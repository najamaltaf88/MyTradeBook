import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Brain,
  Lightbulb,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Shield,
  BookOpen,
} from "lucide-react";
import { cn, formatCurrency, getTzAbbr } from "@/lib/utils";
import { useAccount } from "@/hooks/use-account";
import { useTimezone } from "@/hooks/use-timezone";
import { isPerfectProfitFactor } from "@shared/trade-utils";

type Period = "daily" | "weekly" | "monthly";

interface ReportData {
  period: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    grossProfit: number;
    grossLoss: number;
    netProfit: number;
    totalCommission: number;
    totalSwap: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    bestTrade: { symbol: string; profit: number; type: string } | null;
    worstTrade: { symbol: string; profit: number; type: string } | null;
  };
  symbolBreakdown: { symbol: string; count: number; profit: number; winRate: number }[];
  dailyBreakdown: { date: string; profit: number; trades: number; winRate: number }[];
  emotionSummary: { emotion: string; count: number }[];
  journalRate: number;
  goalCompliance: {
    month: string;
    profitTarget: number | null;
    actualProfit: number;
    profitOnTrack: boolean | null;
    maxLoss: number | null;
    actualLoss: number;
    lossWithinLimit: boolean | null;
    winRateTarget: number | null;
    actualWinRate: number;
    winRateMet: boolean | null;
    maxTradesPerDay: number | null;
    actualMaxDailyTrades: number;
    tradesPerDayMet: boolean | null;
  } | null;
  ruleCompliance: { id: string; category: string; title: string; isActive: boolean }[];
  suggestions: string[];
  trades: {
    id: string;
    symbol: string;
    type: string;
    openTime: string;
    closeTime: string;
    volume: number;
    profit: number;
    pips: number | null;
    reason: string | null;
    logic: string | null;
    emotion: string | null;
  }[];
}

function formatTzDate(date: string, tz: string = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  }).format(new Date(date));
}

function getDateInputValueInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(date);
  const yearPart = parts.find((part) => part.type === "year")?.value;
  const monthPart = parts.find((part) => part.type === "month")?.value;
  const dayPart = parts.find((part) => part.type === "day")?.value;
  if (!yearPart || !monthPart || !dayPart) {
    return date.toISOString().slice(0, 10);
  }
  return `${yearPart}-${monthPart}-${dayPart}`;
}

async function downloadPDF(report: ReportData, tz: string = "UTC") {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("MyTradebook Report", 14, y + 3);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(report.periodLabel, 14, y + 12);
  doc.setFontSize(8);
  doc.text(`${formatTzDate(report.startDate, tz)} - ${formatTzDate(report.endDate, tz)}`, 14, y + 18);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, pageWidth - 14, y + 18, { align: "right" });

  y = 45;
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", 14, y);
  y += 8;

  const summaryData = [
    ["Total Trades", String(report.summary.totalTrades), "Win Rate", `${report.summary.winRate}%`],
    ["Wins", String(report.summary.wins), "Losses", String(report.summary.losses)],
    ["Net Profit", `$${report.summary.netProfit.toFixed(2)}`, "Profit Factor", String(report.summary.profitFactor)],
    ["Gross Profit", `$${report.summary.grossProfit.toFixed(2)}`, "Gross Loss", `$${report.summary.grossLoss.toFixed(2)}`],
    ["Avg Win", `$${report.summary.avgWin.toFixed(2)}`, "Avg Loss", `$${report.summary.avgLoss.toFixed(2)}`],
    ["Commission", `$${report.summary.totalCommission.toFixed(2)}`, "Swap", `$${report.summary.totalSwap.toFixed(2)}`],
  ];

  autoTable(doc, {
    startY: y,
    body: summaryData,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, textColor: [100, 100, 100] },
      1: { cellWidth: 45 },
      2: { fontStyle: "bold", cellWidth: 35, textColor: [100, 100, 100] },
      3: { cellWidth: 45 },
    },
    margin: { left: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (report.summary.bestTrade || report.summary.worstTrade) {
    const tradeHighlights: string[][] = [];
    if (report.summary.bestTrade) {
      tradeHighlights.push(["Best Trade", `${report.summary.bestTrade.symbol} (${report.summary.bestTrade.type})`, `+$${report.summary.bestTrade.profit.toFixed(2)}`]);
    }
    if (report.summary.worstTrade) {
      tradeHighlights.push(["Worst Trade", `${report.summary.worstTrade.symbol} (${report.summary.worstTrade.type})`, `$${report.summary.worstTrade.profit.toFixed(2)}`]);
    }
    autoTable(doc, {
      startY: y,
      body: tradeHighlights,
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: "bold", textColor: [100, 100, 100] } },
      margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (report.symbolBreakdown.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Symbol Breakdown", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Symbol", "Trades", "Profit", "Win Rate"]],
      body: report.symbolBreakdown.map((s) => [
        s.symbol, String(s.count), `$${s.profit.toFixed(2)}`, `${s.winRate}%`,
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (report.dailyBreakdown.length > 0) {
    if (y > 230) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Daily Breakdown", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Date", "Trades", "Win Rate", "Profit"]],
      body: report.dailyBreakdown.map((d) => [
        d.date, String(d.trades), `${d.winRate}%`, `$${d.profit.toFixed(2)}`,
      ]),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (report.goalCompliance) {
    if (y > 230) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Goal Compliance", 14, y);
    y += 2;

    const goalRows: string[][] = [];
    if (report.goalCompliance.profitTarget != null) {
      goalRows.push(["Profit Target", `$${report.goalCompliance.profitTarget}`, `$${report.goalCompliance.actualProfit.toFixed(2)}`, report.goalCompliance.profitOnTrack ? "ON TRACK" : "BEHIND"]);
    }
    if (report.goalCompliance.maxLoss != null) {
      goalRows.push(["Max Loss", `$${report.goalCompliance.maxLoss}`, `$${report.goalCompliance.actualLoss.toFixed(2)}`, report.goalCompliance.lossWithinLimit ? "WITHIN LIMIT" : "EXCEEDED"]);
    }
    if (report.goalCompliance.winRateTarget != null) {
      goalRows.push(["Win Rate", `${report.goalCompliance.winRateTarget}%`, `${report.goalCompliance.actualWinRate}%`, report.goalCompliance.winRateMet ? "MET" : "NOT MET"]);
    }
    if (goalRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Metric", "Target", "Actual", "Status"]],
        body: goalRows,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        margin: { left: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  if (report.suggestions.length > 0) {
    if (y > 240) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Professional Suggestions", 14, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    for (const s of report.suggestions) {
      if (y > 270) { doc.addPage(); y = 15; }
      const lines = doc.splitTextToSize(`- ${s}`, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 4.5 + 2;
    }
    y += 4;
  }

  if (report.trades.length > 0) {
    if (y > 200) { doc.addPage(); y = 15; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Trade Details", 14, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [["Symbol", "Type", "Open Time", "Close Time", "Vol", "Profit", "Pips"]],
      body: report.trades.map((t) => [
        t.symbol, t.type,
        t.openTime ? formatTzDate(t.openTime, tz) : "-",
        t.closeTime ? formatTzDate(t.closeTime, tz) : "Open",
        String(t.volume),
        `$${t.profit.toFixed(2)}`,
        t.pips != null ? t.pips.toFixed(1) : "-",
      ]),
      theme: "striped",
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      margin: { left: 14 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`MyTradebook Report - Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
  }

  doc.save(`tradebook-report-${report.period}-${report.startDate.split("T")[0]}.pdf`);
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-red-500" />;
}

function EmotionBadge({ emotion, count }: { emotion: string; count: number }) {
  const colors: Record<string, string> = {
    confident: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    calm: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    disciplined: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
    neutral: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    fearful: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    greedy: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    anxious: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    frustrated: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    revenge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    fomo: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium", colors[emotion] || "bg-muted text-muted-foreground border-border")}>
      {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
      <span className="font-mono text-[10px] opacity-70">{count}</span>
    </span>
  );
}

export default function ReportsPage() {
  const { selectedAccountId } = useAccount();
  const { timezone } = useTimezone();
  const [period, setPeriod] = useState<Period>("weekly");
  const [selectedDate, setSelectedDate] = useState(() => getDateInputValueInTimezone(new Date(), timezone));

  const { data: report, isLoading, isError } = useQuery<ReportData>({
    queryKey: ["/api/reports", period, selectedDate, selectedAccountId, timezone],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        date: selectedDate,
        timezone,
      });
      if (selectedAccountId) {
        params.set("accountId", selectedAccountId);
      }
      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to generate report");
      return res.json();
    },
  });

  const navigateDate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setSelectedDate(getDateInputValueInTimezone(new Date(), timezone));
      return;
    }
    const d = new Date(selectedDate + "T12:00:00Z");
    const offset = direction === "prev" ? -1 : 1;
    if (period === "daily") d.setUTCDate(d.getUTCDate() + offset);
    else if (period === "weekly") d.setUTCDate(d.getUTCDate() + offset * 7);
    else d.setUTCMonth(d.getUTCMonth() + offset);
    setSelectedDate(d.toISOString().split("T")[0] ?? getDateInputValueInTimezone(d, timezone));
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto page-fade-in" data-testid="page-reports">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and download trading performance reports
          </p>
        </div>
        {report && report.summary.totalTrades > 0 && (
          <Button onClick={() => downloadPDF(report, timezone)} data-testid="button-download-report">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none text-xs"
                  onClick={() => setPeriod(p)}
                  data-testid={`button-period-${p}`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDate("prev")} data-testid="button-date-prev">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[160px] h-8 text-xs"
                data-testid="input-report-date"
              />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateDate("next")} data-testid="button-date-next">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigateDate("today")} data-testid="button-date-today">
                Today
              </Button>
            </div>

            {report && (
              <Badge variant="secondary" className="text-xs ml-auto">
                {report.periodLabel}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-60" />
            <Skeleton className="h-60" />
          </div>
          <Skeleton className="h-32" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to generate report. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {report && !isLoading && (
        <div className="space-y-6">
          <Card className="page-fade-in stagger-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Executive Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.summary.totalTrades === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">No closed trades in this period</p>
                  <p className="text-xs text-muted-foreground mt-1">Try selecting a different date range</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div className="text-center" data-testid="stat-total-trades">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trades</p>
                    <p className="text-xl font-bold font-mono mt-0.5">{report.summary.totalTrades}</p>
                    <p className="text-[10px] text-muted-foreground">{report.summary.wins}W / {report.summary.losses}L</p>
                  </div>
                  <div className="text-center" data-testid="stat-net-profit">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net P&L</p>
                    <p className={cn("text-xl font-bold font-mono mt-0.5", report.summary.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {report.summary.netProfit >= 0 ? "+" : ""}{formatCurrency(report.summary.netProfit)}
                    </p>
                  </div>
                  <div className="text-center" data-testid="stat-win-rate">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
                    <p className={cn("text-xl font-bold font-mono mt-0.5", report.summary.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
                      {report.summary.winRate}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Win</p>
                    <p className="text-xl font-bold font-mono mt-0.5 text-emerald-500">{formatCurrency(report.summary.avgWin)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Loss</p>
                    <p className="text-xl font-bold font-mono mt-0.5 text-red-500">{formatCurrency(report.summary.avgLoss)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Factor</p>
                    <p className={cn("text-xl font-bold font-mono mt-0.5", report.summary.profitFactor >= 1 ? "text-emerald-500" : "text-red-500")}>
                      {isPerfectProfitFactor(report.summary.profitFactor) ? "INF" : report.summary.profitFactor}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {report.summary.totalTrades > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.summary.bestTrade && (
                  <Card className="page-fade-in stagger-2" data-testid="card-best-trade">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Best Trade</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{report.summary.bestTrade.symbol}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">{report.summary.bestTrade.type}</Badge>
                        </div>
                        <p className="text-lg font-bold font-mono text-emerald-500">+{formatCurrency(report.summary.bestTrade.profit)}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {report.summary.worstTrade && (
                  <Card className="page-fade-in stagger-2" data-testid="card-worst-trade">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Worst Trade</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{report.summary.worstTrade.symbol}</p>
                          <Badge variant="outline" className="text-[10px] mt-1">{report.summary.worstTrade.type}</Badge>
                        </div>
                        <p className="text-lg font-bold font-mono text-red-500">{formatCurrency(report.summary.worstTrade.profit)}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {report.symbolBreakdown.length > 0 && (
                <Card className="page-fade-in stagger-3">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Symbol Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {report.symbolBreakdown.sort((a, b) => b.profit - a.profit).map((s) => (
                        <div key={s.symbol} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/30 transition-colors" data-testid={`symbol-row-${s.symbol}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium font-mono w-16">{s.symbol}</span>
                            <span className="text-xs text-muted-foreground">{s.count} trades</span>
                            <span className="text-xs text-muted-foreground">{s.winRate}% WR</span>
                          </div>
                          <span className={cn("text-sm font-mono font-medium", s.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {s.profit >= 0 ? "+" : ""}{formatCurrency(s.profit)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {report.dailyBreakdown.length > 1 && (
                <Card className="page-fade-in stagger-3">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Daily Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase">Date</th>
                            <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">Trades</th>
                            <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">Win Rate</th>
                            <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.dailyBreakdown.map((d) => (
                            <tr key={d.date} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                              <td className="p-2 text-sm">
                                {new Date(d.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                              </td>
                              <td className="p-2 text-right text-sm font-mono">{d.trades}</td>
                              <td className="p-2 text-right text-sm font-mono">{d.winRate}%</td>
                              <td className={cn("p-2 text-right text-sm font-mono font-medium", d.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                                {d.profit >= 0 ? "+" : ""}{formatCurrency(d.profit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {report.goalCompliance && (
            <Card className="page-fade-in stagger-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Goal Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.goalCompliance.profitTarget != null && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20">
                      <div className="flex items-center gap-2">
                        <StatusIcon ok={report.goalCompliance.profitOnTrack} />
                        <span className="text-sm">Profit Target</span>
                      </div>
                      <div className="text-right">
                        <span className={cn("text-sm font-mono font-medium", report.goalCompliance.actualProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {formatCurrency(report.goalCompliance.actualProfit)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">/ {formatCurrency(report.goalCompliance.profitTarget)}</span>
                      </div>
                    </div>
                  )}
                  {report.goalCompliance.maxLoss != null && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20">
                      <div className="flex items-center gap-2">
                        <StatusIcon ok={report.goalCompliance.lossWithinLimit} />
                        <span className="text-sm">Max Loss Limit</span>
                      </div>
                      <div className="text-right">
                        <span className={cn("text-sm font-mono font-medium", report.goalCompliance.lossWithinLimit ? "text-emerald-500" : "text-red-500")}>
                          {formatCurrency(report.goalCompliance.actualLoss)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">/ {formatCurrency(report.goalCompliance.maxLoss)}</span>
                      </div>
                    </div>
                  )}
                  {report.goalCompliance.winRateTarget != null && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20">
                      <div className="flex items-center gap-2">
                        <StatusIcon ok={report.goalCompliance.winRateMet} />
                        <span className="text-sm">Win Rate Target</span>
                      </div>
                      <div className="text-right">
                        <span className={cn("text-sm font-mono font-medium", report.goalCompliance.winRateMet ? "text-emerald-500" : "text-red-500")}>
                          {report.goalCompliance.actualWinRate}%
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">/ {report.goalCompliance.winRateTarget}%</span>
                      </div>
                    </div>
                  )}
                  {report.goalCompliance.maxTradesPerDay != null && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/20">
                      <div className="flex items-center gap-2">
                        <StatusIcon ok={report.goalCompliance.tradesPerDayMet} />
                        <span className="text-sm">Max Trades/Day</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-medium">
                          {report.goalCompliance.actualMaxDailyTrades}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">/ {report.goalCompliance.maxTradesPerDay}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {report.ruleCompliance.length > 0 && (
            <Card className="page-fade-in stagger-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Active Playbook Rules
                  <Badge variant="outline" className="text-[10px] ml-auto">{report.ruleCompliance.length} rules</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {report.ruleCompliance.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/20 text-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-[10px] text-muted-foreground uppercase w-16 shrink-0">{rule.category}</span>
                      <span className="flex-1">{rule.title}</span>
                    </div>
                  ))}
                </div>
                {report.journalRate < 100 && report.summary.totalTrades > 0 && (
                  <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      {report.journalRate}% of trades have journal entries. Document every trade to track rule adherence.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {report.emotionSummary.length > 0 && (
            <Card className="page-fade-in stagger-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Emotion Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {report.emotionSummary.map((e) => (
                    <EmotionBadge key={e.emotion} emotion={e.emotion} count={e.count} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.suggestions.length > 0 && (
            <Card className="page-fade-in stagger-5 border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  Professional Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {report.suggestions.map((s, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30" data-testid={`suggestion-${i}`}>
                      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {report.summary.totalTrades > 0 && report.trades.length > 0 && (
            <Card className="page-fade-in stagger-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Trade Details
                  <Badge variant="outline" className="text-[10px] ml-auto">{report.trades.length} trades</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase">Symbol</th>
                        <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase">Type</th>
                        <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">Volume</th>
                        <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">Pips</th>
                        <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase">P&L</th>
                        <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase">Emotion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.trades.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="p-2 text-sm font-medium font-mono">{t.symbol}</td>
                          <td className="p-2">
                            <Badge variant={t.type === "BUY" ? "default" : "secondary"} className="text-[10px]">{t.type}</Badge>
                          </td>
                          <td className="p-2 text-right text-sm font-mono">{t.volume}</td>
                          <td className="p-2 text-right text-sm font-mono">
                            {t.pips != null ? (
                              <span className={cn(t.pips >= 0 ? "text-emerald-500" : "text-red-500")}>
                                {t.pips >= 0 ? "+" : ""}{t.pips}
                              </span>
                            ) : "-"}
                          </td>
                          <td className={cn("p-2 text-right text-sm font-mono font-medium", (t.profit || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {(t.profit || 0) >= 0 ? "+" : ""}{formatCurrency(t.profit || 0)}
                          </td>
                          <td className="p-2 text-sm">
                            {t.emotion ? (
                              <span className="text-xs text-muted-foreground">{t.emotion}</span>
                            ) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-center py-4">
            <p className="text-[10px] text-muted-foreground">
              Report generated {new Date(report.generatedAt).toLocaleString("en-US", { timeZone: timezone })} {getTzAbbr(timezone)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
