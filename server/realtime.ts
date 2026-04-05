import { randomBytes } from "crypto";
import type { Response } from "express";

type StreamClient = {
  id: string;
  res: Response;
  heartbeat: NodeJS.Timeout;
};

class RealtimeHub {
  private readonly clientsByUser = new Map<string, Map<string, StreamClient>>();

  subscribe(userId: string, res: Response): () => void {
    const clientId = randomBytes(8).toString("hex");
    const userClients = this.clientsByUser.get(userId) ?? new Map<string, StreamClient>();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    this.write(res, "connected", { ok: true, ts: new Date().toISOString() });

    const heartbeat = setInterval(() => {
      this.write(res, "heartbeat", { ts: new Date().toISOString() });
    }, 25000);

    userClients.set(clientId, { id: clientId, res, heartbeat });
    this.clientsByUser.set(userId, userClients);

    return () => {
      const clients = this.clientsByUser.get(userId);
      const current = clients?.get(clientId);
      if (!current) return;

      clearInterval(current.heartbeat);
      clients?.delete(clientId);

      if (clients && clients.size === 0) {
        this.clientsByUser.delete(userId);
      }
    };
  }

  publish(userId: string, payload: Record<string, unknown>) {
    const clients = this.clientsByUser.get(userId);
    if (!clients || clients.size === 0) return;

    clients.forEach((client) => {
      const written = this.write(client.res, "update", {
        ...payload,
        ts: new Date().toISOString(),
      });
      if (!written) {
        clearInterval(client.heartbeat);
        clients.delete(client.id);
      }
    });

    if (clients.size === 0) {
      this.clientsByUser.delete(userId);
    }
  }

  private write(res: Response, eventName: string, payload: Record<string, unknown>): boolean {
    if (res.writableEnded || res.destroyed) return false;
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }
}

const realtimeHub = new RealtimeHub();

export function subscribeUserStream(userId: string, res: Response): () => void {
  return realtimeHub.subscribe(userId, res);
}

export function publishUserUpdate(userId: string, reason: string, entity?: string) {
  realtimeHub.publish(userId, { reason, entity });
}
