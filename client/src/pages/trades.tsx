import { Component, memo, type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  StickyNote,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Trash2,
  Target,
  Shield,
  TrendingUp,
  Ruler,
  Camera,
  Brain,
  Lightbulb,
  Heart,
  X,
  Upload,
  Globe,
  Image,
  ClipboardPaste,
  LineChart,
  NotebookPen,
} from "lucide-react";
import { formatCurrency, formatDate, formatDuration, getProfitColor, cn, getTradeNetPnl } from "@/lib/utils";
import { apiRequest, buildAuthHeaders, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@/hooks/use-account";
import { useTimezone } from "@/hooks/use-timezone";
import { useAnalysisStyle, type AnalysisStyle } from "@/hooks/use-analysis-style";
import { extractClipboardImageFile, readClipboardImage } from "@/lib/clipboard-images";
import type { Trade, TradeNote } from "@shared/schema";
import { calculateTradePips, getTradingSession } from "@shared/trade-utils";

const EMOTION_OPTIONS = [
  { value: "confident", label: "Confident", color: "text-emerald-500 bg-emerald-500/10" },
  { value: "calm", label: "Calm", color: "text-blue-500 bg-blue-500/10" },
  { value: "fearful", label: "Fearful", color: "text-amber-500 bg-amber-500/10" },
  { value: "greedy", label: "Greedy", color: "text-orange-500 bg-orange-500/10" },
  { value: "anxious", label: "Anxious", color: "text-yellow-500 bg-yellow-500/10" },
  { value: "frustrated", label: "Frustrated", color: "text-red-500 bg-red-500/10" },
  { value: "revenge", label: "Revenge", color: "text-red-600 bg-red-600/10" },
  { value: "fomo", label: "FOMO", color: "text-purple-500 bg-purple-500/10" },
  { value: "neutral", label: "Neutral", color: "text-muted-foreground bg-muted" },
  { value: "disciplined", label: "Disciplined", color: "text-cyan-500 bg-cyan-500/10" },
];

class TradesErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Unexpected error" };
  }

  componentDidCatch(error: Error) {
    console.error("Trades page crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-3">
              <h2 className="text-lg font-semibold">Trades view failed to load</h2>
              <p className="text-sm text-muted-foreground">{this.state.message}</p>
              <Button onClick={() => window.location.reload()}>Reload</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

type TradeAiAnalysis = {
  tradeId: string;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  score: number;
  session: string;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  whatWentRight: string[];
  whatWentWrong: string[];
  checks: {
    riskReward: string;
    timing: string;
    duration: string;
    pnlContext: string;
    sizing: string;
    revenge: string;
    slTpDiscipline: string;
  };
};

type TradesQueryResponse = {
  data: Trade[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function isTradeRecord(value: unknown): value is Trade {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    "accountId" in value &&
    "symbol" in value,
  );
}

function patchTradesQueryData(
  existing: Trade[] | TradesQueryResponse | undefined,
  updater: (trade: Trade) => Trade,
) {
  if (!existing) return existing;

  if (Array.isArray(existing)) {
    if (existing.length > 0 && !isTradeRecord(existing[0])) return existing;
    return existing.map((trade) => updater(trade));
  }

  if (existing.data.length > 0 && !isTradeRecord(existing.data[0])) {
    return existing;
  }

  return {
    ...existing,
    data: existing.data.map((trade) => updater(trade)),
  };
}

function syncTradeCaches(updatedTrade: Trade) {
  queryClient.setQueryData<Trade>(["/api/trades", updatedTrade.id], updatedTrade);
  queryClient.setQueriesData<Trade[] | TradesQueryResponse>(
    { queryKey: ["/api/trades"] },
    (existing) =>
      patchTradesQueryData(existing, (trade) =>
        trade.id === updatedTrade.id ? updatedTrade : trade,
      ),
  );
}

function patchTradeCaches(tradeId: string, updater: (trade: Trade) => Trade) {
  queryClient.setQueryData<Trade>(["/api/trades", tradeId], (existing) =>
    existing ? updater(existing) : existing,
  );
  queryClient.setQueriesData<Trade[] | TradesQueryResponse>(
    { queryKey: ["/api/trades"] },
    (existing) =>
      patchTradesQueryData(existing, (trade) =>
        trade.id === tradeId ? updater(trade) : trade,
      ),
  );
}

function resolveTradePips(
  trade: Pick<Trade, "symbol" | "type" | "openPrice" | "closePrice" | "isClosed" | "pips">,
) {
  if (
    trade.isClosed &&
    typeof trade.openPrice === "number" &&
    Number.isFinite(trade.openPrice) &&
    typeof trade.closePrice === "number" &&
    Number.isFinite(trade.closePrice)
  ) {
    return calculateTradePips(
      trade.symbol,
      trade.type,
      trade.openPrice,
      trade.closePrice,
    );
  }

  return trade.pips ?? null;
}

function gradeClass(grade: TradeAiAnalysis["grade"]) {
  if (grade === "A+") return "bg-emerald-600/15 text-emerald-400 border-emerald-500/40";
  if (grade === "A") return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  if (grade === "B") return "bg-green-500/10 text-green-500 border-green-500/20";
  if (grade === "C") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  if (grade === "D") return "bg-orange-500/10 text-orange-500 border-orange-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}

function normalizeTradeGrade(value: string | null | undefined): TradeAiAnalysis["grade"] | null {
  if (value === "A+" || value === "A" || value === "B" || value === "C" || value === "D" || value === "F") {
    return value;
  }
  return null;
}

function DualTimeDisplay({ date, label, timezone }: { date: string | Date | null | undefined; label: string; timezone: string }) {
  if (!date) return <TradeMetricBox label={label} value="-" />;
  const localStr = formatDate(date, timezone);
  const utcStr = formatDate(date, "UTC");
  return (
    <div className="bg-muted/40 rounded-md p-2.5 space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1">
          <Globe className="w-2.5 h-2.5 text-muted-foreground" />
          <p className="text-xs font-mono font-medium">{localStr}</p>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground">{utcStr}</p>
      </div>
    </div>
  );
}

function TradeMetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-muted/40 rounded-md p-2.5 space-y-0.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-mono font-medium", color)}>{value}</p>
    </div>
  );
}

const TradeTableRow = memo(function TradeTableRow({
  trade,
  timezone,
  onSelect,
}: {
  trade: Trade;
  timezone: string;
  onSelect: (trade: Trade) => void;
}) {
  const tradeNet = getTradeNetPnl(trade);
  const pips = resolveTradePips(trade);
  const cachedGrade = normalizeTradeGrade(trade.aiGrade);
  const hasJournal = trade.reason || trade.logic || trade.emotion || trade.screenshotUrl;
  const emotionOpt = EMOTION_OPTIONS.find((emotion) => emotion.value === trade.emotion);

  return (
    <tr
      className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
      onClick={() => onSelect(trade)}
      data-testid={`row-trade-${trade.id}`}
    >
      <td className="p-3">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-6 h-6 rounded flex items-center justify-center shrink-0",
              trade.type === "BUY" ? "bg-emerald-500/10" : "bg-red-500/10",
            )}
          >
            {trade.type === "BUY" ? (
              <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            ) : (
              <ArrowDownRight className="w-3 h-3 text-red-500" />
            )}
          </div>
          <span className="text-sm font-medium font-mono">{trade.symbol}</span>
        </div>
      </td>
      <td className="p-3">
        <Badge
          variant={trade.type === "BUY" ? "default" : "secondary"}
          className="text-[10px]"
        >
          {trade.type}
        </Badge>
      </td>
      <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">
        {formatDate(trade.openTime, timezone)}
      </td>
      <td className="p-3 text-sm text-muted-foreground hidden md:table-cell">
        {trade.isClosed ? formatDate(trade.closeTime, timezone) : "-"}
      </td>
      <td className="p-3 text-sm text-right font-mono hidden sm:table-cell">
        {trade.volume}
      </td>
      <td className="p-3 text-sm text-right font-mono hidden lg:table-cell">
        {pips !== null && pips !== undefined ? (
          <span className={getProfitColor(pips)}>
            {pips >= 0 ? "+" : ""}{pips}
          </span>
        ) : "-"}
      </td>
      <td className="p-3 text-sm text-right text-muted-foreground hidden lg:table-cell">
        <div className="flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(trade.duration)}
        </div>
      </td>
      <td className="p-3 text-right">
        <span className={cn("text-sm font-mono font-medium", getProfitColor(tradeNet))}>
          {tradeNet >= 0 ? "+" : ""}{formatCurrency(tradeNet)}
        </span>
      </td>
      <td className="p-3 hidden lg:table-cell">
        <div className="flex justify-center">
          {cachedGrade ? (
            <Badge className={cn("text-[10px] border", gradeClass(cachedGrade))}>
              {cachedGrade}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">-</span>
          )}
        </div>
      </td>
      <td className="p-3 hidden md:table-cell">
        <div className="flex items-center justify-center gap-1">
          {trade.screenshotUrl && <Image className="w-3 h-3 text-blue-500" />}
          {trade.reason && <Brain className="w-3 h-3 text-purple-500" />}
          {trade.logic && <Lightbulb className="w-3 h-3 text-amber-500" />}
          {emotionOpt && (
            <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-full", emotionOpt.color)}>
              {emotionOpt.label}
            </span>
          )}
          {!hasJournal && <span className="text-[10px] text-muted-foreground">-</span>}
        </div>
      </td>
      <td className="p-3 text-right hidden md:table-cell">
        <Badge variant={trade.isClosed ? "outline" : "default"} className="text-[10px]">
          {trade.isClosed ? "Closed" : "Open"}
        </Badge>
      </td>
    </tr>
  );
});

function TradeDetailDialog({
  trade,
  open,
  onClose,
  analysisStyle,
  accountId,
}: {
  trade: Trade | null;
  open: boolean;
  onClose: () => void;
  analysisStyle: AnalysisStyle;
  accountId: string | null;
}) {
  const [noteText, setNoteText] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [logicText, setLogicText] = useState("");
  const [editingReason, setEditingReason] = useState(false);
  const [editingLogic, setEditingLogic] = useState(false);
  const [screenshotMissing, setScreenshotMissing] = useState(false);
  const [clipboardPending, setClipboardPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { timezone } = useTimezone();

  const { data: notes, isLoading: notesLoading } = useQuery<TradeNote[]>({
    queryKey: ["/api/trades", trade?.id, "notes"],
    enabled: !!trade?.id,
    queryFn: async () => {
      const res = await fetch(`/api/trades/${trade?.id}/notes`);
      if (!res.ok) throw new Error("Failed to fetch trade notes");
      return res.json();
    },
  });

  const { data: freshTrade } = useQuery<Trade>({
    queryKey: ["/api/trades", trade?.id],
    enabled: !!trade?.id,
    queryFn: async () => {
      const res = await fetch(`/api/trades/${trade?.id}`);
      if (!res.ok) throw new Error("Failed to fetch trade");
      return res.json();
    },
  });

  const { data: aiAnalysis, isLoading: aiLoading } = useQuery<TradeAiAnalysis>({
    queryKey: ["/api/ai/trades", trade?.id, analysisStyle, accountId || "__all__"],
    enabled: !!trade,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("style", analysisStyle);
      if (accountId) params.set("accountId", accountId);
      const res = await fetch(`/api/ai/trades/${trade?.id}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch trade AI analysis");
      return res.json();
    },
  });

  const currentTrade = freshTrade || trade;

  useEffect(() => {
    setNoteText("");
    setEditingReason(false);
    setEditingLogic(false);
    setScreenshotMissing(false);
  }, [trade?.id]);

  useEffect(() => {
    if (!editingReason) {
      setReasonText(currentTrade?.reason ?? "");
    }
  }, [currentTrade?.id, currentTrade?.reason, editingReason]);

  useEffect(() => {
    if (!editingLogic) {
      setLogicText(currentTrade?.logic ?? "");
    }
  }, [currentTrade?.id, currentTrade?.logic, editingLogic]);

  const addNote = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/trades/${trade?.id}/notes`, { note: noteText });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades", trade?.id, "notes"] });
      setNoteText("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades", trade?.id, "notes"] });
    },
  });

  const updateJournal = useMutation({
    mutationFn: async (data: { reason?: string; logic?: string; emotion?: string }) => {
      const response = await apiRequest("PATCH", `/api/trades/${trade?.id}`, data);
      return response.json() as Promise<Trade>;
    },
    onSuccess: (updatedTrade) => {
      syncTradeCaches(updatedTrade);
      setReasonText(updatedTrade.reason ?? "");
      setLogicText(updatedTrade.logic ?? "");
      setEditingReason(false);
      setEditingLogic(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const uploadScreenshot = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      const authHeaders = await buildAuthHeaders();
      const res = await fetch(`/api/trades/${trade?.id}/screenshot`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-Mytradebook-Request": "1",
        },
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: ({ url }) => {
      if (trade?.id) {
        patchTradeCaches(trade.id, (currentTrade) => ({
          ...currentTrade,
          screenshotUrl: url,
        }));
      }
      setScreenshotMissing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteScreenshot = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/trades/${trade?.id}/screenshot`);
    },
    onSuccess: () => {
      if (trade?.id) {
        patchTradeCaches(trade.id, (currentTrade) => ({
          ...currentTrade,
          screenshotUrl: null,
        }));
      }
      setScreenshotMissing(false);
    },
  });

  const submitScreenshotFile = (file: File, mode: "upload" | "paste" = "upload") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Only image files can be attached.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please keep screenshots under 10MB.", variant: "destructive" });
      return;
    }
    uploadScreenshot.mutate(file, {
      onSuccess: () => {
        toast({ title: mode === "paste" ? "Screenshot pasted" : "Screenshot uploaded" });
      },
    });
  };

  useEffect(() => {
    if (!open || !trade?.id) return;

    const handlePaste = (event: ClipboardEvent) => {
      const file = extractClipboardImageFile(event.clipboardData, `trade-${trade.id}`);
      if (!file) return;
      event.preventDefault();
      submitScreenshotFile(file, "paste");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, trade?.id]);

  const handleClipboardRead = async () => {
    try {
      setClipboardPending(true);
      const file = await readClipboardImage(`trade-${trade?.id || "journal"}`);
      if (!file) {
        toast({
          title: "No image found",
          description: "Copy a screenshot first, then paste it here.",
          variant: "destructive",
        });
        return;
      }
      submitScreenshotFile(file, "paste");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard access failed";
      toast({ title: "Clipboard unavailable", description: message, variant: "destructive" });
    } finally {
      setClipboardPending(false);
    }
  };

  if (!trade || !currentTrade) return null;

  const netPnl = getTradeNetPnl(currentTrade);
  const hasRR = currentTrade.stopLoss && currentTrade.takeProfit && currentTrade.openPrice;
  const riskPips = hasRR ? Math.abs(currentTrade.openPrice - (currentTrade.stopLoss || 0)) : null;
  const rewardPips = hasRR ? Math.abs((currentTrade.takeProfit || 0) - currentTrade.openPrice) : null;
  const rrRatio = riskPips && riskPips > 0 && rewardPips ? Math.round((rewardPips / riskPips) * 100) / 100 : null;

  const rMultiple = (() => {
    if (!currentTrade.isClosed || !currentTrade.openPrice || !currentTrade.stopLoss || !currentTrade.closePrice) return null;
    const riskAmt = Math.abs(currentTrade.openPrice - currentTrade.stopLoss);
    if (riskAmt === 0) return null;
    const actualMove = currentTrade.type === "BUY"
      ? currentTrade.closePrice - currentTrade.openPrice
      : currentTrade.openPrice - currentTrade.closePrice;
    return Math.round((actualMove / riskAmt) * 100) / 100;
  })();

  const mfe = (() => {
    if (!currentTrade.isClosed || !currentTrade.openPrice || !currentTrade.closePrice) return null;
    if (currentTrade.takeProfit) {
      const maxFav = Math.abs((currentTrade.takeProfit || 0) - currentTrade.openPrice);
      const actual = currentTrade.type === "BUY"
        ? Math.max(0, currentTrade.closePrice - currentTrade.openPrice)
        : Math.max(0, currentTrade.openPrice - currentTrade.closePrice);
      return maxFav > 0 ? Math.round((actual / maxFav) * 10000) / 100 : null;
    }
    return null;
  })();

  const pips = resolveTradePips(currentTrade);

  const tradingSession = currentTrade.openTime ? getTradingSession(currentTrade.openTime) : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={currentTrade.type === "BUY" ? "default" : "secondary"}>
              {currentTrade.type}
            </Badge>
            <span className="font-mono">{currentTrade.symbol}</span>
            {!currentTrade.isClosed && (
              <Badge variant="outline" className="text-[10px]">OPEN</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Trade #{currentTrade.ticket} {tradingSession ? `| ${tradingSession} session` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <TradeMetricBox label="Open Price" value={String(currentTrade.openPrice)} />
            <TradeMetricBox label="Close Price" value={currentTrade.closePrice ? String(currentTrade.closePrice) : "-"} />
            <DualTimeDisplay date={currentTrade.openTime} label="Open Time" timezone={timezone} />
            <DualTimeDisplay date={currentTrade.closeTime} label="Close Time" timezone={timezone} />
            <TradeMetricBox label="Volume" value={`${currentTrade.volume} lots`} />
            <TradeMetricBox
              label="Duration"
              value={formatDuration(currentTrade.duration)}
            />
          </div>

          {(currentTrade.stopLoss || currentTrade.takeProfit || pips !== null) && (
            <div className="grid grid-cols-2 gap-2">
              {currentTrade.stopLoss && (
                <div className="bg-red-500/5 border border-red-500/10 rounded-md p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-red-500" />
                    <p className="text-[10px] text-red-500 uppercase tracking-wider font-medium">Stop Loss</p>
                  </div>
                  <p className="text-sm font-mono font-medium">{currentTrade.stopLoss}</p>
                </div>
              )}
              {currentTrade.takeProfit && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-md p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-emerald-500" />
                    <p className="text-[10px] text-emerald-500 uppercase tracking-wider font-medium">Take Profit</p>
                  </div>
                  <p className="text-sm font-mono font-medium">{currentTrade.takeProfit}</p>
                </div>
              )}
              {pips !== null && (
                <TradeMetricBox
                  label="Pips"
                  value={`${pips >= 0 ? "+" : ""}${pips}`}
                  color={pips >= 0 ? "text-emerald-500" : "text-red-500"}
                />
              )}
              {rrRatio !== null && (
                <TradeMetricBox
                  label="Risk : Reward"
                  value={`1 : ${rrRatio}`}
                  color={rrRatio >= 1 ? "text-emerald-500" : "text-amber-500"}
                />
              )}
            </div>
          )}

          {(rMultiple !== null || mfe !== null) && (
            <div className="grid grid-cols-2 gap-2">
              {rMultiple !== null && (
                <div className="bg-muted/40 rounded-md p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">R-Multiple</p>
                  </div>
                  <p className={cn("text-sm font-mono font-medium", rMultiple >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {rMultiple >= 0 ? "+" : ""}{rMultiple}R
                  </p>
                </div>
              )}
              {mfe !== null && (
                <div className="bg-muted/40 rounded-md p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Ruler className="w-3 h-3 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">TP Capture</p>
                  </div>
                  <p className={cn("text-sm font-mono font-medium", mfe >= 80 ? "text-emerald-500" : mfe >= 50 ? "text-amber-500" : "text-red-500")}>
                    {mfe}%
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gross P&L</span>
              <span className={cn("font-mono font-medium", getProfitColor(currentTrade.profit || 0))}>
                {(currentTrade.profit || 0) >= 0 ? "+" : ""}{formatCurrency(currentTrade.profit || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Commission</span>
              <span className="font-mono text-red-500">{formatCurrency(currentTrade.commission || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Swap</span>
              <span className={cn("font-mono", getProfitColor(currentTrade.swap || 0))}>{formatCurrency(currentTrade.swap || 0)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium border-t pt-2">
              <span>Net P&L</span>
              <span className={cn("font-mono", getProfitColor(netPnl))}>
                {netPnl >= 0 ? "+" : ""}{formatCurrency(netPnl)}
              </span>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Trade Screenshot</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadScreenshot.isPending}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  Upload file
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleClipboardRead}
                  disabled={uploadScreenshot.isPending || clipboardPending}
                >
                  <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                  {clipboardPending ? "Checking clipboard..." : "Paste screenshot"}
                </Button>
              </div>
            </div>
            {currentTrade.screenshotUrl && !screenshotMissing ? (
              <div className="relative group space-y-3 rounded-2xl border border-border bg-card p-3">
                <img
                  src={currentTrade.screenshotUrl}
                  alt="Trade screenshot"
                  className="rounded-xl w-full max-h-56 object-cover border cursor-pointer"
                  onClick={() => window.open(currentTrade.screenshotUrl!, "_blank")}
                  onError={() => setScreenshotMissing(true)}
                  data-testid="img-trade-screenshot"
                />
                <p className="text-[11px] text-muted-foreground">
                  Press `Ctrl+V` any time while this trade window is open to replace the screenshot directly from your clipboard.
                </p>
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteScreenshot.mutate()}
                  data-testid="button-delete-screenshot"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div
                className="rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-screenshot"
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {screenshotMissing
                    ? "Stored screenshot file is missing. Upload a replacement."
                    : "Drop in a chart image without leaving the journal."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Click to upload or press `Ctrl+V` after copying a screenshot. Max 10MB.</p>
                <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, GIF, WebP</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) submitScreenshotFile(file);
                e.target.value = "";
              }}
              data-testid="input-screenshot-file"
            />
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Trade Reason</span>
            </div>
            {editingReason || !currentTrade.reason ? (
              <div className="space-y-2">
                <Textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Why did you enter this trade? (e.g., breakout above resistance, trend continuation...)"
                  className="resize-none text-sm min-h-[60px]"
                  onFocus={() => setEditingReason(true)}
                  data-testid="input-trade-reason"
                />
                {editingReason && (
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingReason(false); setReasonText(currentTrade.reason || ""); }} data-testid="button-cancel-reason">Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => updateJournal.mutate({ reason: reasonText })}
                      disabled={updateJournal.isPending}
                      data-testid="button-save-reason"
                    >Save</Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="bg-muted/40 rounded-md p-3 text-sm cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => { setReasonText(currentTrade.reason || ""); setEditingReason(true); }}
                data-testid="text-trade-reason"
              >
                {currentTrade.reason}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Trade Logic / Setup</span>
            </div>
            {editingLogic || !currentTrade.logic ? (
              <div className="space-y-2">
                <Textarea
                  value={logicText}
                  onChange={(e) => setLogicText(e.target.value)}
                  placeholder="What was your setup/logic? (e.g., H4 FVG fill + OB rejection, London session open sweep...)"
                  className="resize-none text-sm min-h-[60px]"
                  onFocus={() => setEditingLogic(true)}
                  data-testid="input-trade-logic"
                />
                {editingLogic && (
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingLogic(false); setLogicText(currentTrade.logic || ""); }} data-testid="button-cancel-logic">Cancel</Button>
                    <Button
                      size="sm"
                      onClick={() => updateJournal.mutate({ logic: logicText })}
                      disabled={updateJournal.isPending}
                      data-testid="button-save-logic"
                    >Save</Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="bg-muted/40 rounded-md p-3 text-sm cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => { setLogicText(currentTrade.logic || ""); setEditingLogic(true); }}
                data-testid="text-trade-logic"
              >
                {currentTrade.logic}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Emotion / Mindset</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EMOTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                    currentTrade.emotion === opt.value
                      ? `${opt.color} border-current`
                      : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted/60"
                  )}
                  onClick={() => updateJournal.mutate({ emotion: currentTrade.emotion === opt.value ? "" : opt.value })}
                  data-testid={`button-emotion-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI Trade Analysis</span>
            </div>
            {aiLoading ? (
              <Skeleton className="h-24" />
            ) : aiAnalysis ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={cn("border text-xs", gradeClass(aiAnalysis.grade))}>
                    Grade {aiAnalysis.grade}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Score {aiAnalysis.score.toFixed(1)} / 100</span>
                  <Badge variant="outline" className="text-[10px]">{aiAnalysis.session}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded-md p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Strengths</p>
                    {aiAnalysis.whatWentRight.length > 0 ? aiAnalysis.whatWentRight.slice(0, 3).map((item, i) => (
                      <p key={i} className="text-xs">- {item}</p>
                    )) : aiAnalysis.strengths.length > 0 ? aiAnalysis.strengths.slice(0, 3).map((item, i) => (
                      <p key={i} className="text-xs">- {item}</p>
                    )) : <p className="text-xs text-muted-foreground">No specific strengths captured.</p>}
                  </div>
                  <div className="bg-muted/40 rounded-md p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Improvements</p>
                    {aiAnalysis.whatWentWrong.length > 0 ? aiAnalysis.whatWentWrong.slice(0, 3).map((item, i) => (
                      <p key={i} className="text-xs">- {item}</p>
                    )) : aiAnalysis.improvements.length > 0 ? aiAnalysis.improvements.slice(0, 3).map((item, i) => (
                      <p key={i} className="text-xs">- {item}</p>
                    )) : <p className="text-xs text-muted-foreground">No major issues detected.</p>}
                  </div>
                </div>
                <div className="bg-primary/5 rounded-md border border-primary/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Next Trade Suggestions</p>
                  {aiAnalysis.suggestions.length > 0 ? aiAnalysis.suggestions.slice(0, 3).map((item, i) => (
                    <p key={i} className="text-xs">- {item}</p>
                  )) : (
                    <p className="text-xs text-muted-foreground">No additional suggestions generated for this trade.</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded-md p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Execution Checks</p>
                    <p className="text-xs">- {aiAnalysis.checks.riskReward}</p>
                    <p className="text-xs">- {aiAnalysis.checks.timing}</p>
                    <p className="text-xs">- {aiAnalysis.checks.duration}</p>
                  </div>
                  <div className="bg-muted/40 rounded-md p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Context Checks</p>
                    <p className="text-xs">- {aiAnalysis.checks.pnlContext}</p>
                    <p className="text-xs">- {aiAnalysis.checks.sizing}</p>
                    <p className="text-xs">- {aiAnalysis.checks.revenge}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No AI analysis available yet.</p>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center gap-2 mb-3">
              <StickyNote className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Trade Notes</span>
            </div>

            {notesLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="space-y-2 mb-3">
                {(notes || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No notes yet. Add your observations below.</p>
                )}
                {(notes || []).map((note) => (
                  <div key={note.id} className="bg-muted/50 rounded-md p-3 group relative">
                    <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{formatDate(note.createdAt, timezone)}</p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteNote.mutate(note.id)}
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this trade..."
                className="resize-none text-sm min-h-[60px]"
                data-testid="input-trade-note"
              />
              <Button
                size="icon"
                onClick={() => addNote.mutate()}
                disabled={!noteText.trim() || addNote.isPending}
                data-testid="button-add-note"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TradesPageInner() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const { selectedAccountId, queryParam } = useAccount();
  const { timezone } = useTimezone();
  const { style } = useAnalysisStyle();
  const deferredSearch = useDeferredValue(search);

  const { data: trades, isLoading, isError } = useQuery<Trade[]>({
    queryKey: ["/api/trades", selectedAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/trades${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json();
    },
  });

  const searchTerm = deferredSearch.trim().toLowerCase();

  useEffect(() => {
    setVisibleCount(100);
  }, [searchTerm, typeFilter, statusFilter, selectedAccountId]);

  const filteredResult = useMemo(() => {
    const filteredTrades: Trade[] = [];
    let wins = 0;
    let losses = 0;
    let totalPnl = 0;
    let journaledCount = 0;
    let aiCoveredCount = 0;

    for (const trade of trades || []) {
      if (searchTerm && !trade.symbol.toLowerCase().includes(searchTerm)) continue;
      if (typeFilter !== "all" && trade.type !== typeFilter) continue;
      if (statusFilter === "open" && trade.isClosed) continue;
      if (statusFilter === "closed" && !trade.isClosed) continue;

      filteredTrades.push(trade);

      const netPnl = getTradeNetPnl(trade);
      totalPnl += netPnl;
      if (trade.isClosed && netPnl > 0) wins += 1;
      if (trade.isClosed && netPnl < 0) losses += 1;
      if (trade.reason || trade.logic || trade.emotion || trade.screenshotUrl) journaledCount += 1;
      if (normalizeTradeGrade(trade.aiGrade)) aiCoveredCount += 1;
    }

    const averageNet = filteredTrades.length > 0 ? totalPnl / filteredTrades.length : 0;
    const journalCompletion = filteredTrades.length > 0
      ? Math.round((journaledCount / filteredTrades.length) * 100)
      : 0;

    return {
      filtered: filteredTrades,
      wins,
      losses,
      totalPnl,
      journaledCount,
      aiCoveredCount,
      averageNet,
      journalCompletion,
    };
  }, [trades, searchTerm, typeFilter, statusFilter]);

  const filtered = filteredResult.filtered;

  const visibleTrades = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const {
    wins,
    losses,
    totalPnl,
    journaledCount,
    aiCoveredCount,
    averageNet,
    journalCompletion,
  } = filteredResult;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium">Failed to load trades</p>
            <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-trades">
      <Card className="hero-panel overflow-hidden shadow-xl page-fade-in">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.4fr,0.9fr] md:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Trade Journal</Badge>
              <Badge variant="outline">{filtered.length} trade{filtered.length === 1 ? "" : "s"} in view</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Review trades like a real trading desk</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Keep screenshots, reasoning, mindset, and coaching in one place so each trade becomes a cleaner lesson instead of another row in a table.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <LineChart className="h-3.5 w-3.5" />
                Net P&L
              </div>
              <div className={cn("mt-2 text-3xl font-semibold", totalPnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300")}>
                {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Average {averageNet >= 0 ? "+" : ""}{formatCurrency(averageNet)} per visible trade</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <NotebookPen className="h-3.5 w-3.5" />
                Journal Coverage
              </div>
              <div className="mt-2 text-3xl font-semibold">{journalCompletion}%</div>
              <div className="mt-1 text-xs text-muted-foreground">{journaledCount} trades include notes, mindset, or screenshots</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Win / Loss mix</div>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-3xl font-semibold">{wins}</span>
                <span className="pb-1 text-sm text-muted-foreground">wins</span>
                <span className="text-2xl font-semibold text-muted-foreground">{losses}</span>
                <span className="pb-1 text-sm text-muted-foreground">losses</span>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">AI coverage</div>
              <div className="mt-2 text-3xl font-semibold">{aiCoveredCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Trades already graded or analyzed in this filtered view</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-sm page-fade-in stagger-1">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-trades"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36" data-testid="select-type-filter">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="BUY">Buy</SelectItem>
              <SelectItem value="SELL">Sell</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="page-fade-in stagger-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No trades found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {(trades || []).length === 0
                ? "Connect your MT5 account from the Accounts page and sync your trades to get started."
                : "No trades match your current filters. Try adjusting your search or filter criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="page-fade-in stagger-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Open</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Close</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Volume</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Pips</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Duration</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">AI</th>
                  <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Journal</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleTrades.map((trade) => (
                  <TradeTableRow
                    key={trade.id}
                    trade={trade}
                    timezone={timezone}
                    onSelect={setSelectedTrade}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > visibleCount && (
            <div className="p-4 text-center border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + 100)}
                data-testid="button-load-more"
              >
                Load More ({filtered.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </Card>
      )}

      <TradeDetailDialog
        trade={selectedTrade}
        open={!!selectedTrade}
        onClose={() => setSelectedTrade(null)}
        analysisStyle={style}
        accountId={selectedAccountId}
      />
    </div>
  );
}

export default function TradesPage() {
  return (
    <TradesErrorBoundary>
      <TradesPageInner />
    </TradesErrorBoundary>
  );
}
