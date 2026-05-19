/**
 * PROFESSIONAL TRADING DASHBOARD
 * Mathematically correct metrics calculated from deposit balance
 * Multi-account support with comprehensive analytics
 */

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Brain,
  NotebookPen,
  AlertTriangle,
  Target,
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatCurrency, formatPercent, formatDayKeyInTimeZone, cn } from "@/lib/utils";
import { useTimezone } from "@/hooks/use-timezone";
import { useAccount } from "@/hooks/use-account";
import type { Mt5Account, Trade } from "@shared/schema";
import { isPerfectProfitFactor } from "@shared/trade-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DashboardMetrics {
  // Deposit & Balance
  depositBalance: number;
  currentBalance: number;
  totalProfit: number;
  tradeNetProfit: number;
  profitPercent: number;

  // Trade Statistics
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winRate: number;
  wins: number;
  losses: number;
  breakeven: number;

  // Risk & Return
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  riskRewardRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;

  // Performance
  bestTrade: number;
  worstTrade: number;
  avgTradeTime: number;
  avgRRPerTrade: number;
  expectancy: number;

  // Streaks & Consistency
  currentWinStreak: number;
  currentLossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;

  // Monthly Data
  monthlyReturns: Array<{
    month: string;
    profit: number;
    trades: number;
    winRate: number;
  }>;

  // Symbol Performance
  symbolStats: Record<
    string,
    { profit: number; trades: number; winRate: number }
  >;
}

interface DailyPnlBreakdownRow {
  day: string;
  profit: number;
  trades: number;
  wins: number;
  winRate: number;
}

interface DashboardStats {
  currentBalance: number;
  accountBalance: number;
  accountEquity: number;
  depositBalance: number;
  equityCurve: { date: string; pnl: number; cumulative: number }[];
  balanceProfit: number;
  balanceProfitPercent: number;
  equityProfit: number;
  equityProfitPercent: number;
  floatingPnl: number;
  todayPnl: number;
  todayProfitPercent: number;
  weeklyPnl: number;
  weeklyProfitPercent: number;
  monthlyPnlToDate: number;
  monthlyProfitPercent: number;
  dailyPnlBreakdown?: DailyPnlBreakdownRow[];
}

interface DashboardReflection {
  userId: string;
  notes: string | null;
  lessons: string | null;
  mistakes: string | null;
  weaknesses: string | null;
  updatedAt?: string | null;
}

interface ReflectionSuggestion {
  title: string;
  detail: string;
  category: "discipline" | "execution" | "risk" | "mindset";
}

function parseDayKeyToInstant(dayKey: string, timeZone: string): Date {
  const [ys = "0", ms = "1", ds = "1"] = dayKey.split("-");
  const y = parseInt(ys, 10);
  const mo = parseInt(ms, 10);
  const d = parseInt(ds, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return new Date(`${dayKey}T12:00:00`);
  }

  for (let delta = -2; delta <= 2; delta++) {
    for (let hour = 0; hour < 24; hour++) {
      const cand = new Date(Date.UTC(y, mo - 1, d + delta, hour, 30, 0));
      if (formatDayKeyInTimeZone(cand, timeZone) === dayKey) return cand;
    }
  }
  return new Date(`${dayKey}T12:00:00`);
}

function addDaysToDayKey(dayKey: string, delta: number, timeZone: string): string {
  let key = dayKey;
  const step = delta >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(delta); i++) {
    const anchor = parseDayKeyToInstant(key, timeZone);
    key = formatDayKeyInTimeZone(new Date(anchor.getTime() + step * 86400000), timeZone);
  }
  return key;
}

function monthGridMeta(calMonth: string, timeZone: string) {
  const [yStr = "0", moStr = "1"] = calMonth.split("-");
  const y = parseInt(yStr, 10);
  const mo = parseInt(moStr, 10);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const firstKey = `${calMonth}-01`;
  const anchor = parseDayKeyToInstant(firstKey, timeZone);
  const wdLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(anchor);
  const sun0: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = sun0[wdLabel] ?? 0;
  const padMon0 = (dow + 6) % 7;
  return { daysInMonth, padMon0 };
}

function normalizeTradesResponse(payload: unknown): Trade[] {
  if (Array.isArray(payload)) return payload as Trade[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: Trade[] }).data;
  }
  return [];
}

function tradeNetPnl(trade: Trade): number {
  return (trade.profit ?? 0) + (trade.commission ?? 0) + (trade.swap ?? 0);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function combineAccounts(accounts: Mt5Account[]): Mt5Account | null {
  const primaryAccount = accounts[0];
  if (!primaryAccount) return null;

  const balance = accounts.reduce((sum, account) => sum + asFiniteNumber(account.balance, 0), 0);
  const equity = accounts.reduce((sum, account) => sum + asFiniteNumber(account.equity, 0), 0);
  const startingBalance = accounts.reduce((sum, account) => {
    const stored = asFiniteNumber(account.startingBalance, NaN);
    if (Number.isFinite(stored)) return sum + stored;

    const fallback = asFiniteNumber(account.balance, asFiniteNumber(account.equity, 0));
    return sum + fallback;
  }, 0);

  return {
    ...primaryAccount,
    id: "__all__",
    name: "All Accounts",
    balance,
    equity,
    startingBalance,
    connected: accounts.some((account) => Boolean(account.connected)),
    currency: primaryAccount.currency ?? "USD",
    platform: primaryAccount.platform ?? "mt5",
    investorPassword: primaryAccount.investorPassword ?? "",
  };
}

function calculateMetrics(
  account: Mt5Account | null,
  trades: Trade[],
  timezone: string,
): DashboardMetrics {
  const closedTrades = trades.filter((t) => t.isClosed);
  const openTrades = trades.filter((t) => !t.isClosed);
  const startingBalance = asFiniteNumber(account?.startingBalance, NaN);
  const brokerBalance = asFiniteNumber(account?.balance, 0);
  const brokerEquity = asFiniteNumber(account?.equity, 0);
  const depositBalance = Number.isFinite(startingBalance) ? startingBalance : brokerBalance;

  // Calculate P&L
  const tradeNetProfit = closedTrades.reduce(
    (sum, t) => sum + tradeNetPnl(t),
    0
  );
  const currentBalance =
    brokerBalance > 0
      ? brokerBalance
      : brokerEquity > 0
      ? brokerEquity
      : depositBalance + tradeNetProfit;
  const totalProfit = currentBalance - depositBalance;
  const profitPercent =
    depositBalance > 0 ? (totalProfit / depositBalance) * 100 : 0;

  // Win/Loss Statistics
  const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
  const losses = closedTrades.filter((t) => tradeNetPnl(t) < 0);
  const breakeven = closedTrades.filter((t) => tradeNetPnl(t) === 0);
  const winRate =
    closedTrades.length > 0
      ? (wins.length / closedTrades.length) * 100
      : 0;

  // Risk/Return Metrics
  const grossWins = wins.reduce((s, t) => s + tradeNetPnl(t), 0);
  const grossLosses = Math.abs(
    losses.reduce((s, t) => s + tradeNetPnl(t), 0)
  );
  const profitFactor =
    grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

  const avgWin = wins.length > 0 ? grossWins / wins.length : 0;
  const avgLoss =
    losses.length > 0 ? Math.abs(grossLosses / losses.length) : 0;

  const tradesWithRR = closedTrades.filter(
    (t) => t.stopLoss && t.takeProfit && t.openPrice
  );
  const rrValues = tradesWithRR.map((t) => {
    const risk = Math.abs(t.openPrice - (t.stopLoss ?? 0));
    const reward = Math.abs((t.takeProfit ?? 0) - t.openPrice);
    return risk > 0 ? reward / risk : 0;
  });
  const avgRRPerTrade =
    rrValues.length > 0
      ? rrValues.reduce((a, b) => a + b) / rrValues.length
      : 0;

  // Expectancy = (Win% x AvgWin) - (Loss% x AvgLoss)
  const expectancy =
    (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss;

  // Drawdown Calculation
  let maxDrawdown = 0;
  let peak = 0;
  let running = 0;
  const sorted = [...closedTrades].sort(
    (a, b) =>
      new Date(a.closeTime ?? a.openTime).getTime() -
      new Date(b.closeTime ?? b.openTime).getTime()
  );

  for (const t of sorted) {
    running += tradeNetPnl(t);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const maxDrawdownPercent =
    depositBalance > 0 ? (maxDrawdown / depositBalance) * 100 : 0;

  // Sharpe Ratio (simplified: assuming 0 risk-free rate)
  const returns = closedTrades.map((t) => tradeNetPnl(t));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
  const variance =
    returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
        returns.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Streaks
  let currentWin = 0,
    currentLoss = 0,
    maxWin = 0,
    maxLoss = 0;
  for (const t of sorted) {
    const net = tradeNetPnl(t);
    if (net > 0) {
      currentWin++;
      currentLoss = 0;
      maxWin = Math.max(maxWin, currentWin);
    } else if (net < 0) {
      currentLoss++;
      currentWin = 0;
      maxLoss = Math.max(maxLoss, currentLoss);
    }
  }

  // Monthly Returns
  const monthlyMap: Record<string, any> = {};
  for (const t of closedTrades) {
    const key = formatDayKeyInTimeZone(t.closeTime ?? t.openTime, timezone).slice(0, 7);
    if (!monthlyMap[key]) {
      monthlyMap[key] = { profit: 0, trades: 0, wins: 0 };
    }
    const net = tradeNetPnl(t);
    monthlyMap[key].profit += net;
    monthlyMap[key].trades++;
    if (net > 0) monthlyMap[key].wins++;
  }

  const monthlyReturns = Object.entries(monthlyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => ({
      month,
      profit: data.profit,
      trades: data.trades,
      winRate: (data.wins / data.trades) * 100,
    }));

  // Symbol Performance
  const symbolMap: Record<string, any> = {};
  for (const t of closedTrades) {
    if (!symbolMap[t.symbol]) {
      symbolMap[t.symbol] = { profit: 0, trades: 0, wins: 0 };
    }
    const net = tradeNetPnl(t);
    symbolMap[t.symbol].profit += net;
    symbolMap[t.symbol].trades++;
    if (net > 0) symbolMap[t.symbol].wins++;
  }

  const symbolStats: Record<string, any> = {};
  for (const [symbol, data] of Object.entries(symbolMap)) {
    symbolStats[symbol] = {
      profit: data.profit,
      trades: data.trades,
      winRate: (data.wins / data.trades) * 100,
    };
  }

  return {
    depositBalance,
    currentBalance,
    totalProfit,
    tradeNetProfit,
    profitPercent,
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    openTrades: openTrades.length,
    winRate,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    avgWin,
    avgLoss,
    profitFactor,
    riskRewardRatio: avgRRPerTrade,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    bestTrade:
      closedTrades.length > 0
        ? Math.max(...closedTrades.map((t) => tradeNetPnl(t)))
        : 0,
    worstTrade:
      closedTrades.length > 0
        ? Math.min(...closedTrades.map((t) => tradeNetPnl(t)))
        : 0,
    avgTradeTime:
      closedTrades.length > 0
        ? closedTrades.reduce((s, t) => s + (t.duration ?? 0), 0) /
          closedTrades.length
        : 0,
    avgRRPerTrade,
    expectancy,
    currentWinStreak: currentWin,
    currentLossStreak: currentLoss,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    monthlyReturns,
    symbolStats,
  };
}

function suggestionTone(category: ReflectionSuggestion["category"]): string {
  if (category === "risk") return "border-loss/25 bg-loss/8";
  if (category === "execution") return "border-primary/25 bg-primary/8";
  if (category === "discipline") return "border-chart-4/25 bg-chart-4/8";
  return "border-profit/25 bg-profit/8";
}

function suggestionIcon(category: ReflectionSuggestion["category"]) {
  if (category === "risk") return AlertTriangle;
  if (category === "execution") return Target;
  if (category === "discipline") return NotebookPen;
  return Brain;
}

export default function ProfessionalDashboard() {
  const { timezone } = useTimezone();
  const { accounts, selectedAccountId, selectedAccount, queryParam } = useAccount();
  const { toast } = useToast();
  const [reflectionDraft, setReflectionDraft] = useState({
    notes: "",
    lessons: "",
    mistakes: "",
    weaknesses: "",
  });

  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["/api/trades", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const res = await fetch(`/api/trades${queryParam}`);
      const payload = (await res.json()) as unknown;
      return normalizeTradesResponse(payload);
    },
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/stats", selectedAccountId ?? "__all__", timezone],
    queryFn: async () => {
      const params = new URLSearchParams({ timezone });
      if (selectedAccountId) {
        params.set("accountId", selectedAccountId);
      }
      const res = await fetch(`/api/stats?${params.toString()}`);
      return res.json() as Promise<DashboardStats>;
    },
  });

  const { data: reflection } = useQuery<DashboardReflection>({
    queryKey: ["/api/dashboard/reflection"],
  });

  const { data: reflectionSuggestions } = useQuery<{ updatedAt: string; suggestions: ReflectionSuggestion[] }>({
    queryKey: ["/api/dashboard/reflection/suggestions", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) {
        params.set("accountId", selectedAccountId);
      }
      const suffix = params.toString();
      const res = await fetch(`/api/dashboard/reflection/suggestions${suffix ? `?${suffix}` : ""}`);
      return res.json() as Promise<{ updatedAt: string; suggestions: ReflectionSuggestion[] }>;
    },
  });

  const saveReflection = useMutation({
    mutationFn: async (payload: Partial<DashboardReflection>) => {
      const response = await apiRequest("PATCH", "/api/dashboard/reflection", payload);
      return response.json() as Promise<DashboardReflection>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/reflection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/reflection/suggestions"] });
      toast({ title: "Reflection updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save reflection", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    setReflectionDraft({
      notes: reflection?.notes ?? "",
      lessons: reflection?.lessons ?? "",
      mistakes: reflection?.mistakes ?? "",
      weaknesses: reflection?.weaknesses ?? "",
    });
  }, [
    reflection?.lessons,
    reflection?.mistakes,
    reflection?.notes,
    reflection?.weaknesses,
  ]);

  const metricsAccount = useMemo(
    () => selectedAccount ?? combineAccounts(accounts),
    [accounts, selectedAccount]
  );

  const metrics = useMemo(
    () => calculateMetrics(metricsAccount, trades || [], timezone),
    [metricsAccount, trades, timezone]
  );

  const displayDeposit = asFiniteNumber(stats?.depositBalance, metrics.depositBalance);
  const displayBalance = stats
    ? asFiniteNumber(
        stats.currentBalance,
        asFiniteNumber(stats.accountBalance, asFiniteNumber(stats.accountEquity, metrics.currentBalance)),
      )
    : metrics.currentBalance;
  const displayProfit = stats
    ? (displayBalance - displayDeposit)
    : metrics.totalProfit;
  const displayProfitPercent = displayDeposit > 0 ? (displayProfit / displayDeposit) * 100 : 0;
  const fallbackFloating = metricsAccount
    ? (asFiniteNumber(metricsAccount.equity, 0) - asFiniteNumber(metricsAccount.balance, 0))
    : 0;
  const displayFloating = stats?.floatingPnl ?? fallbackFloating;
  const displayEquity = stats?.accountEquity ?? (displayBalance + displayFloating);
  const dailyPnl = stats?.todayPnl ?? 0;
  const dailyPct = stats?.todayProfitPercent ?? 0;
  const weeklyPnl = stats?.weeklyPnl ?? 0;
  const weeklyPct = stats?.weeklyProfitPercent ?? 0;
  const monthlyPnl = stats?.monthlyPnlToDate ?? 0;
  const monthlyPct = stats?.monthlyProfitPercent ?? 0;
  const equitySeries = useMemo(() => {
    const curve = stats?.equityCurve ?? [];
    if (!curve.length) return [];
    return curve.map((point) => ({
      date: point.date,
      equity: Math.round((displayDeposit + point.cumulative) * 100) / 100,
      pnl: point.pnl,
      cumulative: point.cumulative,
    }));
  }, [stats?.equityCurve, displayDeposit]);

  const currentMonthYm = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    return `${y}-${m}`;
  }, [timezone]);

  const [calMonth, setCalMonth] = useState(currentMonthYm);

  useEffect(() => {
    setCalMonth(currentMonthYm);
  }, [currentMonthYm]);

  const pnlByDay = useMemo(() => {
    const m = new Map<string, DailyPnlBreakdownRow>();
    for (const row of stats?.dailyPnlBreakdown ?? []) {
      m.set(row.day, row);
    }
    return m;
  }, [stats?.dailyPnlBreakdown]);

  const calendarCells = useMemo(() => {
    const { daysInMonth, padMon0 } = monthGridMeta(calMonth, timezone);
    type Cell =
      | { kind: "blank" }
      | { kind: "day"; dayNum: number; dayKey: string; row?: DailyPnlBreakdownRow };
    const cells: Cell[] = [];
    for (let i = 0; i < padMon0; i++) {
      cells.push({ kind: "blank" });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dayKey = `${calMonth}-${String(d).padStart(2, "0")}`;
      cells.push({ kind: "day", dayNum: d, dayKey, row: pnlByDay.get(dayKey) });
    }
    return cells;
  }, [calMonth, timezone, pnlByDay]);

  const monthBreakdownTotal = useMemo(() => {
    const prefix = `${calMonth}-`;
    let profit = 0;
    let trades = 0;
    for (const row of stats?.dailyPnlBreakdown ?? []) {
      if (!row.day.startsWith(prefix)) continue;
      profit += row.profit;
      trades += row.trades;
    }
    return { profit, trades };
  }, [stats?.dailyPnlBreakdown, calMonth]);

  const shiftCalMonth = (dir: -1 | 1) => {
    setCalMonth((prev) => {
      const [yStr = "0", mStr = "1"] = prev.split("-");
      const y = parseInt(yStr, 10);
      const mo = parseInt(mStr, 10);
      const next = mo + dir;
      if (next < 1) return `${y - 1}-12`;
      if (next > 12) return `${y + 1}-01`;
      return `${y}-${String(next).padStart(2, "0")}`;
    });
  };

  const weekRangeLabel = useMemo(() => {
    const todayKey = formatDayKeyInTimeZone(new Date(), timezone);
    const wdLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(
      parseDayKeyToInstant(todayKey, timezone),
    );
    const sun0: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = sun0[wdLabel] ?? 0;
    const mondaysBack = (dow + 6) % 7;
    let start = todayKey;
    for (let i = 0; i < mondaysBack; i++) {
      start = addDaysToDayKey(start, -1, timezone);
    }
    return `${start} → ${todayKey}`;
  }, [timezone]);

  const displayProfitFactor = metrics.profitFactor;
  const isPositive = displayProfit >= 0;
  const scopeLabel = selectedAccount?.name || "All Accounts";
  const reflectionDirty =
    reflectionDraft.notes !== (reflection?.notes ?? "") ||
    reflectionDraft.lessons !== (reflection?.lessons ?? "") ||
    reflectionDraft.mistakes !== (reflection?.mistakes ?? "") ||
    reflectionDraft.weaknesses !== (reflection?.weaknesses ?? "");

  return (
    <div className="space-y-6 p-6">
      <section className="hero-panel rounded-[2rem] page-fade-in">
        <div className="grid gap-6 p-6 md:grid-cols-[1.2fr,0.95fr] md:p-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
                Trading Command Center
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {scopeLabel}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {metrics.closedTrades >= 60 ? "High confidence sample" : metrics.closedTrades >= 20 ? "Developing sample" : "Small sample"}
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                Professional trading review with better hierarchy and less noise.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground">
                See balances, risk posture, streaks, and edge quality in one premium workspace that feels closer to a real desk review than a generic admin panel.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/trades">Open Trade Journal</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/goals">Review Goals</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="metric-card rounded-[1.6rem] border border-emerald-500/25 bg-card p-5 text-foreground">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-[image:var(--gradient-success)] p-3 shadow-lg">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                <Badge variant="outline">{formatPercent(displayProfitPercent)}</Badge>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live Equity</p>
              <p className="mt-2 text-3xl font-semibold text-profit">{formatCurrency(displayEquity)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Floating {displayFloating >= 0 ? "+" : ""}{formatCurrency(displayFloating)}</p>
            </div>

            <div className="metric-card rounded-[1.6rem] border border-cyan-500/25 bg-card p-5 text-foreground">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-[image:var(--gradient-primary)] p-3 shadow-lg">
                  {isPositive ? <TrendingUp className="h-5 w-5 text-white" /> : <TrendingDown className="h-5 w-5 text-white" />}
                </div>
                <Badge variant="outline">{metrics.closedTrades} closed</Badge>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Net P&amp;L</p>
              <p className={`mt-2 text-3xl font-semibold ${isPositive ? "text-profit" : "text-loss"}`}>
                {displayProfit >= 0 ? "+" : ""}{formatCurrency(displayProfit)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">Realized {formatCurrency(metrics.tradeNetProfit)}</p>
            </div>

            <div className="metric-card rounded-[1.6rem] border border-violet-500/25 bg-card p-5 text-foreground">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-400 p-3 shadow-lg">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <Badge variant="outline">{metrics.wins}W / {metrics.losses}L</Badge>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Win Rate</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">{formatPercent(metrics.winRate)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{metrics.breakeven} breakeven trades in sample</p>
            </div>

            <div className="metric-card rounded-[1.6rem] border border-amber-500/25 bg-card p-5 text-foreground">
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-2xl bg-[image:var(--gradient-warning)] p-3 shadow-lg">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <Badge variant="outline">
                  {metrics.expectancy >= 0 ? "+" : ""}{formatCurrency(metrics.expectancy)}/trade
                </Badge>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profit Factor</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {isPerfectProfitFactor(displayProfitFactor) || !Number.isFinite(displayProfitFactor)
                  ? "INF"
                  : displayProfitFactor.toFixed(2)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Avg win {formatCurrency(metrics.avgWin)} vs avg loss {formatCurrency(metrics.avgLoss)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr,0.95fr] page-fade-in stagger-1">
        <Card className="rounded-[1.8rem]">
          <CardHeader>
            <CardTitle className="text-2xl">Performance Pulse</CardTitle>
            <CardDescription>
              Snapshot of business health before drilling into individual trades.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Starting balance</span>
              <span className="text-sm font-semibold text-foreground">{formatCurrency(displayDeposit)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Current balance</span>
              <span className="text-sm font-semibold text-foreground">{formatCurrency(displayBalance)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Realized trade P&amp;L</span>
              <span className={`text-sm font-semibold ${metrics.tradeNetProfit >= 0 ? "text-profit" : "text-loss"}`}>
                {metrics.tradeNetProfit >= 0 ? "+" : ""}{formatCurrency(metrics.tradeNetProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Sharpe ratio</span>
              <span className="text-sm font-semibold text-foreground">{metrics.sharpeRatio.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Max drawdown</span>
              <span className="text-sm font-semibold text-loss">
                {formatCurrency(metrics.maxDrawdown)} ({formatPercent(metrics.maxDrawdownPercent)})
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Average R:R</span>
              <span className="text-sm font-semibold text-foreground">{metrics.riskRewardRatio.toFixed(2)}:1</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Daily P&amp;L</span>
              <span className={`text-sm font-semibold ${dailyPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {dailyPnl >= 0 ? "+" : ""}{formatCurrency(dailyPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Weekly P&amp;L</span>
              <span className={`text-sm font-semibold ${weeklyPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {weeklyPnl >= 0 ? "+" : ""}{formatCurrency(weeklyPnl)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.8rem] page-fade-in stagger-2">
          <CardHeader>
            <CardTitle className="text-2xl">Review Focus</CardTitle>
            <CardDescription>What deserves attention in the next review cycle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Monthly P&amp;L</span>
              <span className={`text-sm font-semibold ${monthlyPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {monthlyPnl >= 0 ? "+" : ""}{formatCurrency(monthlyPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Current streak</span>
              <span className="text-sm font-semibold">
                {metrics.currentWinStreak > 0 ? `${metrics.currentWinStreak} wins` : `${metrics.currentLossStreak} losses`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Best trade</span>
              <span className="text-sm font-semibold text-profit">+{formatCurrency(metrics.bestTrade)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Worst trade</span>
              <span className="text-sm font-semibold text-loss">{formatCurrency(metrics.worstTrade)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Expectancy</span>
              <span className={`text-sm font-semibold ${metrics.expectancy >= 0 ? "text-profit" : "text-loss"}`}>
                {metrics.expectancy >= 0 ? "+" : ""}{formatCurrency(metrics.expectancy)}/trade
              </span>
            </div>
            <div className="rounded-[1.4rem] border border-primary/15 bg-primary/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Coach note</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {metrics.closedTrades < 20
                  ? "This sample is still early. Use it to ask better questions, not to over-trust the result."
                  : metrics.profitFactor >= 1.5
                  ? "Your edge is showing. Protect it by keeping size stable and staying selective."
                  : "The system is still leaking quality somewhere. Review weak sessions before adding more volume."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/notes">Open Notes</Link>
                </Button>
                <Button asChild variant="glass">
                  <Link href="/ai-insights">AI Insights</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="equity" className="w-full page-fade-in stagger-3">
        <TabsList className="flex w-full max-w-5xl flex-wrap gap-1">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="pnl">PnL calendar</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="symbols">By Symbol</TabsTrigger>
        </TabsList>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-[1.6rem]">
              <CardHeader>
                <CardTitle className="text-sm">Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Drawdown</span>
                  <span className="font-semibold">
                    {formatCurrency(metrics.maxDrawdown)} ({formatPercent(metrics.maxDrawdownPercent)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Loss</span>
                  <span className="font-semibold text-loss">
                    -{formatCurrency(metrics.avgLoss)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk/Reward</span>
                  <span className="font-semibold">
                    {metrics.riskRewardRatio.toFixed(2)}:1
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sharpe Ratio</span>
                  <span className="font-semibold">
                    {metrics.sharpeRatio.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.6rem]">
              <CardHeader>
                <CardTitle className="text-sm">Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Win</span>
                  <span className="font-semibold text-profit">
                    +{formatCurrency(metrics.avgWin)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best Trade</span>
                  <span className="font-semibold text-profit">
                    +{formatCurrency(metrics.bestTrade)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Worst Trade</span>
                  <span className="font-semibold text-loss">
                    {formatCurrency(metrics.worstTrade)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expectancy</span>
                  <span className="font-semibold">
                    {formatCurrency(metrics.expectancy)}/trade
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.6rem]">
              <CardHeader>
                <CardTitle className="text-sm">Consistency Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Win Streak</span>
                  <span className="font-semibold">{metrics.maxWinStreak} trades</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Loss Streak</span>
                  <span className="font-semibold">{metrics.maxLossStreak} trades</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Streak</span>
                  <span className="font-semibold">
                    {metrics.currentWinStreak > 0
                      ? `+${metrics.currentWinStreak}W`
                      : `-${metrics.currentLossStreak}L`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Trade Duration</span>
                  <span className="font-semibold">
                    {Math.round(metrics.avgTradeTime / 3600)}h
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Equity Curve Tab */}
        <TabsContent value="equity">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="chart-shell rounded-[1.8rem]">
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
                <CardDescription>Balance progression across the selected account scope.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {equitySeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equitySeries}>
                      <defs>
                        <linearGradient id="equityDashboardLine" x1="0" x2="1" y1="0" y2="0">
                          <stop offset="0%" stopColor="hsl(var(--chart-1))" />
                          <stop offset="55%" stopColor="hsl(var(--chart-2))" />
                          <stop offset="100%" stopColor="hsl(var(--chart-3))" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} width={84} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 18,
                          color: "hsl(var(--card-foreground))",
                          boxShadow: "var(--shadow-md)",
                        }}
                        formatter={(value: number | string) =>
                          formatCurrency(typeof value === "number" ? value : Number(value) || 0)
                        }
                      />
                      <Line type="monotone" dataKey="equity" stroke="url(#equityDashboardLine)" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No closed trades yet</p>
                )}
              </CardContent>
            </Card>

            <Card className="chart-shell rounded-[1.8rem]">
              <CardHeader>
                <CardTitle>Monthly Returns</CardTitle>
                <CardDescription>Keep the monthly business view visible, not just the recent streak.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {metrics.monthlyReturns.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.monthlyReturns}>
                      <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} width={84} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 18,
                          color: "hsl(var(--card-foreground))",
                          boxShadow: "var(--shadow-md)",
                        }}
                        formatter={(value: number | string) =>
                          formatCurrency(typeof value === "number" ? value : Number(value) || 0)
                        }
                      />
                      <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[14, 14, 10, 10]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No closed trades yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PnL calendar */}
        <TabsContent value="pnl" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr,320px]">
            <Card className="rounded-[1.8rem]">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Calendar className="h-5 w-5 text-primary" />
                    Calendar P&amp;L
                  </CardTitle>
                  <CardDescription>
                    Closed-trade net by close date in your journal timezone ({timezone}). Week totals on the hero cards use the same week window:{" "}
                    <span className="font-mono text-xs">{weekRangeLabel}</span>.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" onClick={() => shiftCalMonth(-1)} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[8.5rem] text-center font-mono text-sm font-semibold">{calMonth}</span>
                  <Button type="button" variant="outline" size="icon" onClick={() => shiftCalMonth(1)} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setCalMonth(currentMonthYm)}>
                    Today
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="rounded-2xl border border-border bg-card px-4 py-2">
                    <span className="text-muted-foreground">Month realized </span>
                    <span className={cn("font-semibold", monthBreakdownTotal.profit >= 0 ? "text-profit" : "text-loss")}>
                      {monthBreakdownTotal.profit >= 0 ? "+" : ""}
                      {formatCurrency(monthBreakdownTotal.profit)}
                    </span>
                    <span className="text-muted-foreground"> · {monthBreakdownTotal.trades} closes</span>
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-2">
                    <span className="text-muted-foreground">This week </span>
                    <span className={cn("font-semibold", weeklyPnl >= 0 ? "text-profit" : "text-loss")}>
                      {weeklyPnl >= 0 ? "+" : ""}
                      {formatCurrency(weeklyPnl)}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-border bg-card px-4 py-2">
                    <span className="text-muted-foreground">Today </span>
                    <span className={cn("font-semibold", dailyPnl >= 0 ? "text-profit" : "text-loss")}>
                      {dailyPnl >= 0 ? "+" : ""}
                      {formatCurrency(dailyPnl)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, idx) =>
                    cell.kind === "blank" ? (
                      <div key={`blank-${idx}`} className="min-h-[56px] rounded-xl bg-muted/15" />
                    ) : cell.row ? (
                      <Link
                        key={cell.dayKey}
                        href={`/trades?day=${cell.dayKey}`}
                        className={cn(
                          "flex min-h-[56px] flex-col justify-between rounded-xl border p-1.5 text-left transition-colors hover:ring-2 hover:ring-primary/30",
                          cell.row.profit > 0 && "border-profit/35 bg-profit/10",
                          cell.row.profit < 0 && "border-loss/35 bg-loss/10",
                          cell.row.profit === 0 && "border-border bg-card",
                        )}
                      >
                        <span className="text-[11px] font-semibold text-foreground">{cell.dayNum}</span>
                        <span className={cn("text-xs font-semibold", cell.row.profit >= 0 ? "text-profit" : "text-loss")}>
                          {cell.row.profit >= 0 ? "+" : ""}
                          {formatCurrency(cell.row.profit)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {cell.row.trades}t · {formatPercent(cell.row.winRate)}
                        </span>
                      </Link>
                    ) : (
                      <div
                        key={cell.dayKey}
                        className="flex min-h-[56px] flex-col justify-between rounded-xl border border-border/60 bg-muted/10 p-1.5 text-left"
                      >
                        <span className="text-[11px] font-semibold text-foreground">{cell.dayNum}</span>
                        <span className="text-[9px] text-muted-foreground">—</span>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.8rem]">
              <CardHeader>
                <CardTitle className="text-base">Recent days</CardTitle>
                <CardDescription>Newest closes first (same source as the grid).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {(stats?.dailyPnlBreakdown ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No closed trades yet.</p>
                  ) : (
                    (stats?.dailyPnlBreakdown ?? []).slice(0, 60).map((row) => (
                      <Link
                        key={row.day}
                        href={`/trades?day=${row.day}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{row.day}</span>
                        <span className={cn("font-semibold", row.profit >= 0 ? "text-profit" : "text-loss")}>
                          {row.profit >= 0 ? "+" : ""}
                          {formatCurrency(row.profit)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {row.trades}t
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="chart-shell rounded-[1.8rem]">
              <CardHeader>
                <CardTitle>Win/Loss Distribution</CardTitle>
                <CardDescription>Outcome balance at a glance.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Wins", value: metrics.wins },
                        { name: "Losses", value: metrics.losses },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={96}
                      paddingAngle={6}
                      dataKey="value"
                    >
                      <Cell fill="hsl(var(--profit))" />
                      <Cell fill="hsl(var(--loss))" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 18,
                        color: "hsl(var(--card-foreground))",
                        boxShadow: "var(--shadow-md)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-[1.8rem]">
              <CardHeader>
                <CardTitle>Trade Statistics</CardTitle>
                <CardDescription>Quick reality check before changing anything in the process.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Trades</p>
                  <p className="text-2xl font-bold">{metrics.closedTrades}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Trades</p>
                  <p className="text-2xl font-bold">{metrics.openTrades}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Profit/Loss</p>
                  <p className={`text-2xl font-bold ${isPositive ? "text-profit" : "text-loss"}`}>
                    {formatCurrency(displayProfit)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Realized: {formatCurrency(metrics.tradeNetProfit)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* By Symbol Tab */}
        <TabsContent value="symbols">
          <Card className="rounded-[1.8rem]">
            <CardHeader>
              <CardTitle>Performance by Symbol</CardTitle>
              <CardDescription>Put more attention on what is actually paying you.</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(metrics.symbolStats).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.symbolStats)
                    .sort((a, b) => b[1].profit - a[1].profit)
                    .map(([symbol, stats]) => (
                      <div key={symbol} className="flex justify-between items-center rounded-[1.2rem] border border-border bg-card p-4">
                        <div>
                          <p className="font-semibold">{symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            {stats.trades} trades | {formatPercent(stats.winRate)} WR
                          </p>
                        </div>
                        <p className={`text-lg font-bold ${stats.profit >= 0 ? "text-profit" : "text-loss"}`}>
                          {stats.profit >= 0 ? "+" : ""}{formatCurrency(stats.profit)}
                        </p>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No symbol data</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}




