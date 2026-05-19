import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Trade } from "@shared/schema";

const PENDING_REVIEW_KEY = "mtb-pending-review-trade";

export function queuePostTradeReview(tradeId: string) {
  sessionStorage.setItem(PENDING_REVIEW_KEY, tradeId);
}

export function usePostTradeReview() {
  const [tradeId, setTradeId] = useState<string | null>(() =>
    sessionStorage.getItem(PENDING_REVIEW_KEY),
  );

  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
    staleTime: 30_000,
  });

  const pendingTrade = trades?.find(
    (t) => t.id === tradeId || Boolean(t.reviewPending),
  );

  useEffect(() => {
    if (!trades?.length) return;
    const fromStorage = sessionStorage.getItem(PENDING_REVIEW_KEY);
    const pending = trades.find((t) => t.reviewPending);
    const nextId = fromStorage || pending?.id || null;
    if (nextId && nextId !== tradeId) {
      setTradeId(nextId);
    }
  }, [trades, tradeId]);

  const clear = () => {
    sessionStorage.removeItem(PENDING_REVIEW_KEY);
    setTradeId(null);
  };

  return {
    trade: pendingTrade && (pendingTrade.id === tradeId || pendingTrade.reviewPending)
      ? pendingTrade
      : null,
    open: Boolean(
      tradeId &&
        pendingTrade &&
        (pendingTrade.reviewPending || pendingTrade.id === tradeId),
    ),
    clear,
    setTradeId,
  };
}
