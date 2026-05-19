import { Router, type Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { Logger } from "../logging";
import { publishUserUpdate } from "../realtime";

const MAX_TRADES_PER_REQUEST = 500;

const pythonTradeSchema = z.object({
  account_id: z.string().min(1).optional(),
  external_id: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  symbol: z.string().min(1).max(24),
  direction: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.enum(["BUY", "SELL"])),
  open_time: z.union([z.string(), z.date()]),
  open_price: z.number().positive("open_price must be positive"),
  lot_size: z.number().positive("lot_size must be positive"),
  profit: z.number().optional().default(0),
  commission: z.number().optional().default(0),
  swap: z.number().optional().default(0),
  notes: z.string().max(5000).nullable().optional(),
});

function getHeaderValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function getBearerToken(req: Request): string {
  const authHeader = getHeaderValue(req.headers.authorization);
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
}

function parseDateFlexible(value: string | Date): Date {
  if (value instanceof Date) return value;
  const cleaned = String(value).replace(/\./g, "-").replace(/\s+/g, "T");
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  throw new Error(`Invalid date string: "${value}"`);
}

function sanitizeTextInput(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.split("\u0000").join("").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const mt5SyncRouter = Router();

mt5SyncRouter.post("/trades", async (req, res) => {
  const apiKey = getBearerToken(req);
  if (!apiKey) {
    return res.status(401).json({ message: "Missing bearer token" });
  }

  try {
    const account = await storage.getAccountByApiKey(apiKey);
    if (!account) return res.status(401).json({ message: "Invalid API key" });
    if (!account.userId) return res.status(400).json({ message: "Invalid account" });

    if (!Array.isArray(req.body)) {
      return res.status(400).json({ message: "Request body must be an array of trades" });
    }

    if (req.body.length > MAX_TRADES_PER_REQUEST) {
      return res.status(413).json({
        message: `Too many trades in one request. Maximum is ${MAX_TRADES_PER_REQUEST}.`,
      });
    }

    let inserted = 0;
    let skipped = 0;
    const errors: Array<{ index: number; external_id?: string; message: string }> = [];

    for (const [index, rawTrade] of req.body.entries()) {
      try {
        const parsed = pythonTradeSchema.parse(rawTrade);
        if (parsed.account_id && parsed.account_id !== account.id) {
          errors.push({
            index,
            external_id: parsed.external_id,
            message: "Trade account_id does not match API key account",
          });
          continue;
        }

        const existing = await storage.getTradeByTicket(parsed.external_id, account.id);
        if (existing) {
          skipped += 1;
          continue;
        }

        const openTime = parseDateFlexible(parsed.open_time);
        const sanitizedNotes = sanitizeTextInput(parsed.notes, 5000);

        await storage.createTrade({
          ticket: parsed.external_id,
          external_id: parsed.external_id,
          sync_source: "python",
          accountId: account.id,
          symbol: parsed.symbol,
          type: parsed.direction,
          openTime,
          openPrice: parsed.open_price,
          closeTime: openTime,
          closePrice: parsed.open_price,
          volume: parsed.lot_size,
          profit: parsed.profit,
          commission: parsed.commission,
          swap: parsed.swap,
          comment: sanitizedNotes,
          isClosed: true,
          duration: 0,
          pips: null,
          reviewPending: true,
        });
        inserted += 1;
      } catch (error: unknown) {
        errors.push({
          index,
          external_id:
            rawTrade && typeof rawTrade === "object" && "external_id" in rawTrade
              ? String((rawTrade as { external_id?: unknown }).external_id)
              : undefined,
          message: errorMessage(error, "Failed to import trade"),
        });
      }
    }

    await storage.updateAccount(account.id, {
      connected: true,
      lastSyncAt: new Date(),
    });

    if (inserted > 0) {
      publishUserUpdate(account.userId, "python_trades_imported", "trades", { inserted, skipped });
    } else {
      publishUserUpdate(account.userId, "python_sync_completed", "accounts", { inserted, skipped });
    }

    return res.json({ success: true, inserted, skipped, errors });
  } catch (error: unknown) {
    Logger.logError("mt5_python_sync_failed", error as Error);
    return res.status(400).json({ message: errorMessage(error, "Python sync failed") });
  }
});
