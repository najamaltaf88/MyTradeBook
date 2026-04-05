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
import { TrendingUp, TrendingDown, DollarSign, Brain, NotebookPen, AlertTriangle, Target, Sparkles } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
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
  trades: Trade[]
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
    const date = new Date(t.closeTime ?? t.openTime);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
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
  if (category === "risk") return "border-red-500/20 bg-red-500/5";
  if (category === "execution") return "border-blue-500/20 bg-blue-500/5";
  if (category === "discipline") return "border-amber-500/20 bg-amber-500/5";
  return "border-emerald-500/20 bg-emerald-500/5";
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

  const { data: trades } = useQuery({
    queryKey: ["/api/trades", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const res = await fetch(`/api/trades${queryParam}`);
      return res.json() as Promise<Trade[]>;
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
    () => calculateMetrics(metricsAccount, trades || []),
    [metricsAccount, trades]
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
              <p className="mt-2 text-3xl font-semibold text-emerald-600 dark:text-emerald-300">{formatCurrency(displayEquity)}</p>
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
              <p className={`mt-2 text-3xl font-semibold ${isPositive ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
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
              <span className={`text-sm font-semibold ${metrics.tradeNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
                {metrics.tradeNetProfit >= 0 ? "+" : ""}{formatCurrency(metrics.tradeNetProfit)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Sharpe ratio</span>
              <span className="text-sm font-semibold text-foreground">{metrics.sharpeRatio.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Max drawdown</span>
              <span className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                {formatCurrency(metrics.maxDrawdown)} ({formatPercent(metrics.maxDrawdownPercent)})
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Average R:R</span>
              <span className="text-sm font-semibold text-foreground">{metrics.riskRewardRatio.toFixed(2)}:1</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Daily P&amp;L</span>
              <span className={`text-sm font-semibold ${dailyPnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
                {dailyPnl >= 0 ? "+" : ""}{formatCurrency(dailyPnl)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Weekly P&amp;L</span>
              <span className={`text-sm font-semibold ${weeklyPnl >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
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
        <TabsList className="grid w-full grid-cols-4 lg:w-auto">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
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
                  <span className="font-semibold text-red-600">
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
                  <span className="font-semibold text-green-600">
                    +{formatCurrency(metrics.avgWin)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best Trade</span>
                  <span className="font-semibold text-green-600">
                    +{formatCurrency(metrics.bestTrade)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Worst Trade</span>
                  <span className="font-semibold text-red-600">
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
                          <stop offset="0%" stopColor="#14b8a6" />
                          <stop offset="55%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "currentColor", fontSize: 12 }} tickLine={false} axisLine={false} width={84} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15, 23, 42, 0.94)",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          borderRadius: 18,
                          color: "#f8fafc",
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
                          background: "rgba(15, 23, 42, 0.94)",
                          border: "1px solid rgba(148, 163, 184, 0.18)",
                          borderRadius: 18,
                          color: "#f8fafc",
                        }}
                        formatter={(value: number | string) =>
                          formatCurrency(typeof value === "number" ? value : Number(value) || 0)
                        }
                      />
                      <Bar dataKey="profit" fill="#14b8a6" radius={[14, 14, 10, 10]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No closed trades yet</p>
                )}
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
                      <Cell fill="#10b981" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15, 23, 42, 0.94)",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        borderRadius: 18,
                        color: "#f8fafc",
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
                  <p className={`text-2xl font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
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




