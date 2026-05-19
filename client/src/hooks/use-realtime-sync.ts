import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queuePostTradeReview } from "@/hooks/use-post-trade-review";

const INVALIDATION_BY_REASON: Record<string, readonly (readonly string[])[]> = {
  trade_opened: [["/api/trades"], ["/api/stats"], ["/api/accounts"]],
  trade_updated: [["/api/trades"], ["/api/stats"]],
  trade_closed: [["/api/trades"], ["/api/stats"], ["/api/accounts"]],
  trade_reviewed: [["/api/trades"]],
  account_info_updated: [["/api/accounts"], ["/api/stats"]],
  account_heartbeat: [["/api/accounts"]],
};

const DEFAULT_INVALIDATION: readonly (readonly string[])[] = [
  ["/api/trades"],
  ["/api/stats"],
  ["/api/accounts"],
];

export function useRealtimeSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let eventSource: EventSource | null = null;
    let disposed = false;
    let pageVisible = typeof document === "undefined" ? true : document.visibilityState === "visible";

    const triggerRefresh = (reason?: string, tradeId?: string) => {
      if (reason === "trade_closed" && tradeId) {
        queuePostTradeReview(tradeId);
      }

      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        const keys = reason && INVALIDATION_BY_REASON[reason]
          ? INVALIDATION_BY_REASON[reason]
          : DEFAULT_INVALIDATION;
        void Promise.all(
          keys.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })),
        );
      }, 120);
    };

    const cleanupSource = () => {
      if (!eventSource) return;
      eventSource.removeEventListener("update", onUpdate);
      eventSource.close();
      eventSource = null;
    };

    const onUpdate = (event: Event) => {
      try {
        const message = event as MessageEvent<string>;
        const data = JSON.parse(message.data) as { reason?: string; tradeId?: string };
        triggerRefresh(data.reason, data.tradeId);
      } catch {
        triggerRefresh();
      }
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed || !pageVisible) return;
      cleanupSource();

      const { data } = await supabase.auth.getSession();
      if (disposed || !pageVisible) return;
      const token = data.session?.access_token;
      const url = token ? `/api/realtime/stream?access_token=${encodeURIComponent(token)}` : "/api/realtime/stream";
      eventSource = new EventSource(url, { withCredentials: true });
      eventSource.addEventListener("update", onUpdate);
      eventSource.onopen = () => {
        reconnectAttempts = 0;
      };
      eventSource.onerror = () => {
        cleanupSource();
        scheduleReconnect();
      };
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      if (!pageVisible) {
        cleanupSource();
        return;
      }
      reconnectAttempts = 0;
      void connect();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    void connect();

    return () => {
      disposed = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      cleanupSource();
    };
  }, [enabled, queryClient]);
}
