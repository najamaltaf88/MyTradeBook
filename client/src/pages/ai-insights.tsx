import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount } from "@/hooks/use-account";
import { useAnalysisStyle } from "@/hooks/use-analysis-style";
import { formatCurrency, getProfitColor, cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { Brain, Shield, TrendingUp, Gauge, Target, Download } from "lucide-react";

type TradeAnalysis = {
  tradeId: string;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  score: number;
};

type PortfolioAnalysis = {
  style: "scalping" | "intraday" | "swing";
  generatedAt: string;
  performanceScore: number;
  componentScores: {
    winRate: number;
    profitFactor: number;
    riskManagement: number;
    consistency: number;
  };
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    profitFactor: number;
    netProfit: number;
    maxDrawdown: number;
  };
  riskManagement: {
    rating: "A" | "B" | "C" | "D" | "F";
    score: number;
    slUsagePct: number;
    tpUsagePct: number;
    sizingConsistencyPct: number;
    maxDrawdown: number;
  };
  psychologicalProfile: {
    revengeTrades: number;
    overtradingDays: number;
    cuttingWinners: number;
    lossAversion: boolean;
    notes: string[];
  };
  projectedImpact: {
    monthlyPnlUplift: number;
    drivers: string[];
  };
  sessionAnalysis: {
    bestSession: string | null;
    worstSession: string | null;
    sessions: Array<{
      session: string;
      pnl: number;
      trades: number;
      winRate: number;
    }>;
  };
  symbolBreakdown: Array<{
    symbol: string;
    pnl: number;
    trades: number;
    winRate: number;
  }>;
  dayOfWeekPatterns: Array<{
    day: string;
    pnl: number;
    trades: number;
    winRate: number;
  }>;
  topStrengths: string[];
  topImprovements: string[];
  monthlyTrend: {
    direction: "improving" | "declining" | "flat";
    slope: number;
    months: Array<{
      month: string;
      pnl: number;
      trades: number;
      winRate: number;
    }>;
  };
  tradeAnalyses: TradeAnalysis[];
};

type CoachingInsight = {
  type: "trading_discipline" | "risk_management" | "psychology" | "strategy_performance";
  message: string;
};

type CoachingAnalysisResult = {
  generatedAt: string;
  source: "grok" | "algorithmic";
  modelUsed: string;
  fallbackUsed: boolean;
  fromCache: boolean;
  insights: CoachingInsight[];
  recommendations: string[];
};

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-500";
  if (score >= 55) return "text-amber-500";
  return "text-red-500";
}

function gradeCounts(trades: TradeAnalysis[]) {
  return trades.reduce<Record<string, number>>((acc, t) => {
    acc[t.grade] = (acc[t.grade] || 0) + 1;
    return acc;
  }, { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 });
}

function styleLabel(style: string) {
  if (style === "scalping") return "Scalping";
  if (style === "swing") return "Swing";
  return "Intraday";
}

function insightLabel(type: CoachingInsight["type"]) {
  if (type === "trading_discipline") return "Discipline";
  if (type === "risk_management") return "Risk";
  if (type === "psychology") return "Psychology";
  return "Strategy";
}

function buildAiQuery(accountId: string | undefined, style: string) {
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  params.set("style", style);
  return `?${params.toString()}`;
}

async function downloadAiReportPdf(
  data: PortfolioAnalysis,
  accountName: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("MyTradebook AI Insights Report", 14, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${accountName} | Style: ${styleLabel(data.style)}`, 14, y + 11);
  doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, 14, y + 16);

  y = 42;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Performance Overview", 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value", "Metric", "Value"]],
    body: [
      ["Performance Score", String(Math.round(data.performanceScore)), "Risk Rating", data.riskManagement.rating],
      ["Win Rate", `${data.summary.winRate.toFixed(1)}%`, "Profit Factor", data.summary.profitFactor.toFixed(2)],
      ["Net P&L", formatCurrency(data.summary.netProfit), "Max Drawdown", formatCurrency(data.summary.maxDrawdown)],
      ["SL Usage", `${data.riskManagement.slUsagePct.toFixed(1)}%`, "TP Usage", `${data.riskManagement.tpUsagePct.toFixed(1)}%`],
      ["Sizing Consistency", `${data.riskManagement.sizingConsistencyPct.toFixed(1)}%`, "Total Closed Trades", String(data.summary.totalTrades)],
    ],
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Projected Impact", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Estimated monthly uplift: ${formatCurrency(data.projectedImpact.monthlyPnlUplift)}`, 14, y);
  y += 5;
  for (const driver of data.projectedImpact.drivers.slice(0, 4)) {
    if (y > 270) {
      doc.addPage();
      y = 15;
    }
    const lines = doc.splitTextToSize(`- ${driver}`, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 1;
  }
  y += 3;

  if (y > 220) {
    doc.addPage();
    y = 15;
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Top Strengths / Improvements", 14, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Strengths", "Improvements"]],
    body: [
      ...Array.from(
        { length: Math.max(data.topStrengths.length, data.topImprovements.length, 1) },
        (_, index) => [data.topStrengths[index] || "-", data.topImprovements[index] || "-"],
      ),
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  if (y > 220) {
    doc.addPage();
    y = 15;
  }
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Session Breakdown", 14, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    head: [["Session", "Trades", "Win Rate", "P&L"]],
    body: data.sessionAnalysis.sessions.map((item) => [
      item.session,
      String(item.trades),
      `${item.winRate.toFixed(1)}%`,
      formatCurrency(item.pnl),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    head: [["Symbol", "Trades", "Win Rate", "P&L"]],
    body: data.symbolBreakdown.slice(0, 12).map((item) => [
      item.symbol,
      String(item.trades),
      `${item.winRate.toFixed(1)}%`,
      formatCurrency(item.pnl),
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
    margin: { left: 14 },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `MyTradebook AI Report | Page ${page} of ${pages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  doc.save(`ai-insights-${data.style}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function AiInsightsPage() {
  const { selectedAccount } = useAccount();
  const { style, setStyle } = useAnalysisStyle();
  const query = buildAiQuery(selectedAccount?.id, style);
  const [coaching, setCoaching] = useState<CoachingAnalysisResult | null>(null);

  const { data, isLoading, isError } = useQuery<PortfolioAnalysis>({
    queryKey: ["/api/ai/portfolio", selectedAccount?.id || "__all__", style],
    queryFn: async () => {
      const res = await fetch(`/api/ai/portfolio${query}`);
      if (!res.ok) throw new Error("Failed to fetch AI insights");
      return res.json();
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (): Promise<CoachingAnalysisResult> => {
      const res = await apiRequest("POST", "/api/ai/analyze", {
        accountId: selectedAccount?.id,
        style,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setCoaching(result);
    },
    onError: () => {
      setCoaching({
        generatedAt: new Date().toISOString(),
        source: "algorithmic",
        modelUsed: "algorithmic-v1",
        fallbackUsed: true,
        fromCache: false,
        insights: [
          {
            type: "strategy_performance",
            message: "Detailed AI analysis is temporarily unavailable. Baseline coaching remains active.",
          },
        ],
        recommendations: [
          "Keep risk fixed and continue logging every trade for better pattern detection.",
        ],
      });
    },
  });

  const grades = useMemo(() => gradeCounts(data?.tradeAnalyses || []), [data?.tradeAnalyses]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-60" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">Failed to load AI insights</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-ai-insights">
      <div className="page-fade-in flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            AI Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rule-based performance intelligence for {selectedAccount?.name || "all accounts"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Profile: {styleLabel(style)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={style} onValueChange={(value) => setStyle(value as "scalping" | "intraday" | "swing")}>
            <SelectTrigger className="w-40" data-testid="select-ai-style">
              <SelectValue placeholder="Trading style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scalping">Scalping</SelectItem>
              <SelectItem value="intraday">Intraday</SelectItem>
              <SelectItem value="swing">Swing</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            data-testid="button-analyze-my-trading"
          >
            {analyzeMutation.isPending ? "Analyzing..." : "Analyze My Trading"}
          </Button>
          <Button
            variant="outline"
            onClick={() => data && downloadAiReportPdf(data, selectedAccount?.name || "All Accounts")}
            data-testid="button-download-ai-report"
          >
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <Card className="page-fade-in stagger-1" data-testid="card-ai-coaching">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Trading Psychology Coach
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {coaching ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={coaching.source === "grok" ? "default" : "secondary"}>
                  {coaching.source === "grok" ? "Grok AI" : "Algorithmic Fallback"}
                </Badge>
                {coaching.fromCache && <Badge variant="outline">Cached</Badge>}
                {coaching.fallbackUsed && <Badge variant="outline">Auto Fallback</Badge>}
                <span className="text-muted-foreground">
                  {new Date(coaching.generatedAt).toLocaleString()}
                </span>
              </div>
              <div className="space-y-2">
                {coaching.insights.map((item, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-card p-3">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {insightLabel(item.type)}
                    </div>
                    <p className="text-sm">{item.message}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Action Plan</p>
                {coaching.recommendations.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 p-3 text-sm">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click Analyze My Trading to generate AI coaching suggestions. If AI is unavailable, fallback insights are shown automatically.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 page-fade-in stagger-1">
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Performance Score</p>
            <p className={cn("text-3xl font-bold font-mono", scoreColor(data.performanceScore))}>
              {Math.round(data.performanceScore)}
            </p>
            <p className="text-xs text-muted-foreground">Out of 100</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risk Rating</p>
            <p className="text-3xl font-bold font-mono">{data.riskManagement.rating}</p>
            <p className="text-xs text-muted-foreground">{data.riskManagement.score.toFixed(1)} / 25</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Win Rate</p>
            <p className={cn("text-3xl font-bold font-mono", data.summary.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
              {data.summary.winRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">{data.summary.wins}W / {data.summary.losses}L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit Factor</p>
            <p className={cn("text-3xl font-bold font-mono", data.summary.profitFactor >= 1 ? "text-emerald-500" : "text-red-500")}>
              {data.summary.profitFactor.toFixed(2)}
            </p>
            <p className={cn("text-xs font-mono", getProfitColor(data.summary.netProfit))}>
              {data.summary.netProfit >= 0 ? "+" : ""}{formatCurrency(data.summary.netProfit)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="page-fade-in stagger-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Component Scores (0-25 each)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(data.componentScores).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</span>
                <span className="font-mono">{value.toFixed(1)} / 25</span>
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (value / 25) * 100)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Risk Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>SL Usage</span><span className="font-mono">{data.riskManagement.slUsagePct.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span>TP Usage</span><span className="font-mono">{data.riskManagement.tpUsagePct.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span>Sizing Consistency</span><span className="font-mono">{data.riskManagement.sizingConsistencyPct.toFixed(1)}%</span></div>
            <div className="flex justify-between"><span>Max Drawdown</span><span className="font-mono text-red-500">{formatCurrency(data.riskManagement.maxDrawdown)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Psychological Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Revenge Trades</span><span className="font-mono">{data.psychologicalProfile.revengeTrades}</span></div>
            <div className="flex justify-between"><span>Overtrading Days</span><span className="font-mono">{data.psychologicalProfile.overtradingDays}</span></div>
            <div className="flex justify-between"><span>Cutting Winners</span><span className="font-mono">{data.psychologicalProfile.cuttingWinners}</span></div>
            <div className="flex justify-between"><span>Loss Aversion</span><span className="font-mono">{data.psychologicalProfile.lossAversion ? "Yes" : "No"}</span></div>
            <div className="pt-2 space-y-1">
              {data.psychologicalProfile.notes.map((note, i) => (
                <p key={i} className="text-xs text-muted-foreground">- {note}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="page-fade-in stagger-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Projected Impact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Estimated monthly uplift</span>
            <span className={cn("text-lg font-mono font-semibold", getProfitColor(data.projectedImpact.monthlyPnlUplift))}>
              {data.projectedImpact.monthlyPnlUplift >= 0 ? "+" : ""}
              {formatCurrency(data.projectedImpact.monthlyPnlUplift)}
            </span>
          </div>
          <div className="space-y-1">
            {data.projectedImpact.drivers.map((driver, index) => (
              <p key={index} className="text-xs text-muted-foreground">
                - {driver}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Top 5 Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.topStrengths.map((item, i) => (
              <p key={i} className="text-sm">- {item}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Top 5 Improvements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.topImprovements.map((item, i) => (
              <p key={i} className="text-sm">- {item}</p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Grade Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 flex-wrap">
            {(["A+", "A", "B", "C", "D", "F"] as const).map((g) => (
              <Badge key={g} variant="secondary" className="text-xs">
                {g}: {grades[g] || 0}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={data.monthlyTrend.direction === "improving" ? "default" : "secondary"}>
                {data.monthlyTrend.direction}
              </Badge>
              <span className="text-xs text-muted-foreground">Slope: {data.monthlyTrend.slope.toFixed(2)}</span>
            </div>
            <div className="space-y-1">
              {data.monthlyTrend.months.slice(-6).map((m) => (
                <div key={m.month} className="flex items-center justify-between text-xs">
                  <span>{m.month}</span>
                  <span className={cn("font-mono", getProfitColor(m.pnl))}>
                    {m.pnl >= 0 ? "+" : ""}{formatCurrency(m.pnl)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 page-fade-in stagger-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Session Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2 text-xs">
              <Badge variant="outline">Best: {data.sessionAnalysis.bestSession || "-"}</Badge>
              <Badge variant="outline">Worst: {data.sessionAnalysis.worstSession || "-"}</Badge>
            </div>
            <div className="space-y-1">
              {data.sessionAnalysis.sessions.map((s) => (
                <div key={s.session} className="grid grid-cols-4 gap-2 text-xs">
                  <span>{s.session}</span>
                  <span className="font-mono">{s.trades} trades</span>
                  <span className="font-mono">{s.winRate.toFixed(1)}%</span>
                  <span className={cn("font-mono text-right", getProfitColor(s.pnl))}>
                    {s.pnl >= 0 ? "+" : ""}{formatCurrency(s.pnl)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day Patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.dayOfWeekPatterns.slice(0, 7).map((d) => (
              <div key={d.day} className="flex items-center justify-between text-xs">
                <span>{d.day}</span>
                <span className={cn("font-mono", getProfitColor(d.pnl))}>
                  {d.pnl >= 0 ? "+" : ""}{formatCurrency(d.pnl)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="page-fade-in stagger-7">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Symbol Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data.symbolBreakdown.slice(0, 10).map((s) => (
            <div key={s.symbol} className="grid grid-cols-4 gap-2 text-xs">
              <span className="font-mono">{s.symbol}</span>
              <span className="font-mono">{s.trades} trades</span>
              <span className="font-mono">{s.winRate.toFixed(1)}%</span>
              <span className={cn("font-mono text-right", getProfitColor(s.pnl))}>
                {s.pnl >= 0 ? "+" : ""}{formatCurrency(s.pnl)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
