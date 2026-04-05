import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const INVALIDATION_KEYS = [
  ["/api/accounts"],
  ["/api/trades"],
  ["/api/stats"],
  ["/api/playbook"],
  ["/api/goals"],
  ["/api/reports"],
  ["/api/ai/trades"],
  ["/api/ai/portfolio"],
  ["/api/dashboard/reflection"],
  ["/api/dashboard/reflection/suggestions"],
  ["/api/strategy-edge/concepts"],
  ["strategyEdge"],
  ["/api/alerts"],
  ["/api/alerts/history"],
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

    const triggerRefresh = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        void Promise.all(
          INVALIDATION_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
        );
      }, 150);
    };

    const cleanupSource = () => {
      if (!eventSource) return;
      eventSource.removeEventListener("update", triggerRefresh);
      eventSource.close();
      eventSource = null;
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
      eventSource.addEventListener("update", triggerRefresh);
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
