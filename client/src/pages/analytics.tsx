import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDuration, getProfitColor, cn, utcToTzHour, getTzAbbr } from "@/lib/utils";
import { useTimezone } from "@/hooks/use-timezone";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  Snowflake,
  ArrowDown,
  Clock,
  Target,
} from "lucide-react";
import type { Trade } from "@shared/schema";
import { useAccount } from "@/hooks/use-account";
import { isPerfectProfitFactor } from "@shared/trade-utils";

interface Stats {
  totalTrades: number;
  winRate: number;
  totalProfit: number;
  netProfit: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  wins: number;
  losses: number;
  breakeven: number;
  avgRR: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  currentWinStreak: number;
  currentLossStreak: number;
  maxDrawdown: number;
  avgDuration: number;
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
  longProfit: number;
  shortProfit: number;
  symbolStats: { symbol: string; count: number; profit: number; winRate: number; avgDuration: number }[];
  equityCurve: { date: string; pnl: number; cumulative: number }[];
  monthlyPnl: { month: string; profit: number; trades: number; winRate: number }[];
  sessionStats: { session: string; profit: number; trades: number; winRate: number }[];
  hourlyStats: { hour: number; profit: number; count: number; winRate: number }[];
}

function WinLossChart({ wins, losses, breakeven }: { wins: number; losses: number; breakeven: number }) {
  const data = [
    { name: "Wins", value: wins, color: "#10b981" },
    { name: "Losses", value: losses, color: "#ef4444" },
  ];
  if (breakeven > 0) {
    data.push({ name: "Breakeven", value: breakeven, color: "#6b7280" });
  }

  if (wins + losses + breakeven === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          label={({ name, value }) => `${name}: ${value}`}
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function SymbolProfitChart({ data }: { data: Stats["symbolStats"] }) {
  const sorted = [...data].sort((a, b) => b.profit - a.profit);

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={sorted} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="symbol"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, "P&L"]}
        />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
          {sorted.map((entry, index) => (
            <Cell key={index} fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DailyPnlChart({ data }: { data: Stats["equityCurve"] }) {
  const { timezone } = useTimezone();
  const tzAbbr = getTzAbbr(timezone);
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => {
            const date = new Date(d);
            return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", timeZone: timezone }).format(date);
          }}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          labelFormatter={(d) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone }).format(new Date(d)) + ` ${tzAbbr}`}
          formatter={(value: number) => [`$${value.toFixed(2)}`, "Daily P&L"]}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthlyPnlChart({ data }: { data: Stats["monthlyPnl"] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={formatted} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${v}`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => {
            if (name === "profit") return [`$${value.toFixed(2)}`, "P&L"];
            return [value, name];
          }}
        />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
          {formatted.map((entry, index) => (
            <Cell key={index} fill={entry.profit >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function getDayOfWeek(date: Date, tz: string): number {
  const dayStr = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayStr] ?? date.getDay();
}

function tradeNetPnl(trade: Trade): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

function TradeDistributionByDay({ trades }: { trades: Trade[] }) {
  const { timezone } = useTimezone();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayData = dayNames.map((name, i) => {
    const dayTrades = trades.filter(
      (t) => t.isClosed && t.openTime && getDayOfWeek(new Date(t.openTime), timezone) === i
    );
    const profit = dayTrades.reduce((s, t) => s + tradeNetPnl(t), 0);
    return {
      day: name.substring(0, 3),
      count: dayTrades.length,
      profit: Math.round(profit * 100) / 100,
      winRate: dayTrades.length > 0
        ? Math.round((dayTrades.filter((t) => tradeNetPnl(t) > 0).length / dayTrades.length) * 100)
        : 0,
    };
  });

  return (
    <div className="space-y-3">
      {dayData.filter(d => d.count > 0).map((d) => (
        <div key={d.day} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-medium w-8">{d.day}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${Math.min(100, (d.count / Math.max(...dayData.map(x => x.count), 1)) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{d.count} trades</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{d.winRate}% WR</span>
            <span className={cn("text-sm font-mono", getProfitColor(d.profit))}>
              {d.profit >= 0 ? "+" : ""}{formatCurrency(d.profit)}
            </span>
          </div>
        </div>
      ))}
      {dayData.filter(d => d.count > 0).length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-4">No data available</div>
      )}
    </div>
  );
}

function HourlyHeatmap({ data }: { data: Stats["hourlyStats"] }) {
  const { timezone } = useTimezone();
  const tzAbbr = getTzAbbr(timezone);
  if (data.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-4">No data available</div>;
  }

  const pstMap = new Map<number, { count: number; profit: number; wins: number }>();
  for (const d of data) {
    const pstHour = utcToTzHour(d.hour, timezone);
    const wins = Math.round(d.count * d.winRate / 100);
    const existing = pstMap.get(pstHour);
    if (existing) {
      existing.count += d.count;
      existing.profit += d.profit;
      existing.wins += wins;
    } else {
      pstMap.set(pstHour, { count: d.count, profit: d.profit, wins });
    }
  }

  const maxCount = Math.max(...Array.from(pstMap.values()).map((d) => d.count), 1);

  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Array.from({ length: 24 }, (_, h) => {
        const entry = pstMap.get(h);
        const count = entry?.count || 0;
        const profit = entry?.profit || 0;
        const winRate = count > 0 ? Math.round(((entry?.wins || 0) / count) * 100) : 0;
        const intensity = count / maxCount;

        return (
          <div
            key={h}
            className={cn(
              "rounded p-1.5 text-center cursor-default transition-colors",
              count === 0 && "bg-muted/30",
              count > 0 && profit >= 0 && "bg-emerald-500/10 hover:bg-emerald-500/20",
              count > 0 && profit < 0 && "bg-red-500/10 hover:bg-red-500/20"
            )}
            style={{ opacity: count === 0 ? 0.4 : 0.3 + intensity * 0.7 }}
            title={`${h}:00 ${tzAbbr} | ${count} trades | $${profit.toFixed(2)} | ${winRate}% WR`}
          >
            <p className="text-[10px] text-muted-foreground">{h}:00</p>
            {count > 0 && (
              <p className={cn("text-[10px] font-mono font-medium", getProfitColor(profit))}>
                {count}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SessionCard({ session, profit, trades, winRate }: { session: string; profit: number; trades: number; winRate: number }) {
  const sessionColors: Record<string, string> = {
    Asian: "border-amber-500/20 bg-amber-500/5",
    London: "border-blue-500/20 bg-blue-500/5",
    "London/NY Overlap": "border-cyan-500/20 bg-cyan-500/5",
    "New York": "border-purple-500/20 bg-purple-500/5",
    "Off-hours": "border-muted bg-muted/30",
  };

  return (
    <div className={cn("rounded-lg border p-3 space-y-1", sessionColors[session] || "border-muted bg-muted/30")} data-testid={`session-${session}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{session}</p>
      <p className={cn("text-lg font-bold font-mono", getProfitColor(profit))}>
        {profit >= 0 ? "+" : ""}{formatCurrency(profit)}
      </p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{trades} trades</span>
        <span>{winRate}% WR</span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { selectedAccountId, queryParam } = useAccount();
  const { timezone } = useTimezone();

  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<Stats>({
    queryKey: ["/api/stats", selectedAccountId, timezone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      params.set("timezone", timezone);
      const res = await fetch(`/api/stats?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: trades, isLoading: tradesLoading, isError: tradesError } = useQuery<Trade[]>({
    queryKey: ["/api/trades", selectedAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/trades${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json();
    },
  });

  if (statsLoading || tradesLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-[360px]" />
          <Skeleton className="h-[360px]" />
        </div>
      </div>
    );
  }

  if (statsError || tradesError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium">Failed to load analytics data</p>
            <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = stats || {
    totalTrades: 0,
    winRate: 0,
    totalProfit: 0,
    netProfit: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    avgRR: null,
    maxWinStreak: 0,
    maxLossStreak: 0,
    currentWinStreak: 0,
    currentLossStreak: 0,
    maxDrawdown: 0,
    avgDuration: 0,
    longTrades: 0,
    shortTrades: 0,
    longWinRate: 0,
    shortWinRate: 0,
    longProfit: 0,
    shortProfit: 0,
    symbolStats: [],
    equityCurve: [],
    monthlyPnl: [],
    sessionStats: [],
    hourlyStats: [],
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-analytics">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deep dive into your trading performance
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 page-fade-in stagger-1">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Win</p>
            <p className="text-lg font-bold font-mono text-emerald-500 mt-0.5">{formatCurrency(s.avgWin)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Loss</p>
            <p className="text-lg font-bold font-mono text-red-500 mt-0.5">{formatCurrency(s.avgLoss)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Profit Factor</p>
            <p className={cn("text-lg font-bold font-mono mt-0.5", s.profitFactor >= 1 ? "text-emerald-500" : "text-red-500")}>
              {isPerfectProfitFactor(s.profitFactor) ? "INF" : s.profitFactor}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
            <p className={cn("text-lg font-bold font-mono mt-0.5", s.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
              {s.winRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 page-fade-in stagger-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Streak</p>
            </div>
            <p className="text-lg font-bold font-mono text-emerald-500">{s.maxWinStreak}</p>
            {s.currentWinStreak > 0 && (
              <p className="text-[10px] text-muted-foreground">Current: {s.currentWinStreak}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Snowflake className="w-3.5 h-3.5 text-red-500" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Loss Streak</p>
            </div>
            <p className="text-lg font-bold font-mono text-red-500">{s.maxLossStreak}</p>
            {s.currentLossStreak > 0 && (
              <p className="text-[10px] text-muted-foreground">Current: {s.currentLossStreak}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown className="w-3.5 h-3.5 text-red-500" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Drawdown</p>
            </div>
            <p className="text-lg font-bold font-mono text-red-500">{formatCurrency(s.maxDrawdown)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Duration</p>
            </div>
            <p className="text-lg font-bold font-mono">{formatDuration(s.avgDuration)}</p>
          </CardContent>
        </Card>
      </div>

      {s.avgRR !== null && (
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Target className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Average Risk:Reward Ratio</p>
              <p className={cn("text-lg font-bold font-mono", s.avgRR >= 1 ? "text-emerald-500" : "text-amber-500")}>
                1 : {s.avgRR}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Long vs Short</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <p className="text-xs font-medium text-emerald-600">Long (Buy)</p>
                </div>
                <p className={cn("text-lg font-bold font-mono", getProfitColor(s.longProfit))}>
                  {s.longProfit >= 0 ? "+" : ""}{formatCurrency(s.longProfit)}
                </p>
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span>{s.longTrades} trades</span>
                  <span>{s.longWinRate}% WR</span>
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-xs font-medium text-red-600">Short (Sell)</p>
                </div>
                <p className={cn("text-lg font-bold font-mono", getProfitColor(s.shortProfit))}>
                  {s.shortProfit >= 0 ? "+" : ""}{formatCurrency(s.shortProfit)}
                </p>
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span>{s.shortTrades} trades</span>
                  <span>{s.shortWinRate}% WR</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Win / Loss Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <WinLossChart wins={s.wins} losses={s.losses} breakeven={s.breakeven} />
          </CardContent>
        </Card>
      </div>

      {s.sessionStats.length > 0 && (
        <Card className="page-fade-in stagger-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Trading Sessions</CardTitle>
            <p className="text-xs text-muted-foreground">Performance breakdown by market session, including the London/New York overlap.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {s.sessionStats.map((ss) => (
                <SessionCard key={ss.session} {...ss} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">P&L by Symbol</CardTitle>
            <p className="text-xs text-muted-foreground">Net profit/loss for each traded instrument</p>
          </CardHeader>
          <CardContent>
            <SymbolProfitChart data={s.symbolStats} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily P&L</CardTitle>
            <p className="text-xs text-muted-foreground">Day-by-day profit and loss breakdown</p>
          </CardHeader>
          <CardContent>
            <DailyPnlChart data={s.equityCurve} />
          </CardContent>
        </Card>
      </div>

      {s.monthlyPnl.length > 0 && (
        <Card className="page-fade-in stagger-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Performance</CardTitle>
            <p className="text-xs text-muted-foreground">Month-over-month trading results and consistency</p>
          </CardHeader>
          <CardContent>
            <MonthlyPnlChart data={s.monthlyPnl} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Month</th>
                    <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Trades</th>
                    <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</th>
                    <th className="text-right p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {s.monthlyPnl.map((m) => (
                    <tr key={m.month} className="border-b last:border-0">
                      <td className="p-2 text-sm font-medium">
                        {new Date(m.month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      </td>
                      <td className="p-2 text-right text-sm">{m.trades}</td>
                      <td className="p-2 text-right text-sm">
                        <span className={cn("font-mono", m.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
                          {m.winRate}%
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <span className={cn("text-sm font-mono font-medium", getProfitColor(m.profit))}>
                          {m.profit >= 0 ? "+" : ""}{formatCurrency(m.profit)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 page-fade-in stagger-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Performance by Day of Week</CardTitle>
            <p className="text-xs text-muted-foreground">Identify your most and least profitable trading days</p>
          </CardHeader>
          <CardContent>
            <TradeDistributionByDay trades={trades || []} />
          </CardContent>
        </Card>

        {s.hourlyStats.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hourly Activity</CardTitle>
              <p className="text-xs text-muted-foreground">Trade frequency and profitability by hour</p>
            </CardHeader>
            <CardContent>
              <HourlyHeatmap data={s.hourlyStats} />
            </CardContent>
          </Card>
        )}
      </div>

      {s.symbolStats.length > 0 && (
        <Card className="page-fade-in stagger-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Symbol Performance Table</CardTitle>
            <p className="text-xs text-muted-foreground">Detailed statistics for each instrument you trade</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Trades</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Duration</th>
                    <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {s.symbolStats.sort((a, b) => b.profit - a.profit).map((sym) => (
                    <tr key={sym.symbol} className="border-b last:border-0" data-testid={`row-symbol-${sym.symbol}`}>
                      <td className="p-3 font-mono text-sm font-medium">{sym.symbol}</td>
                      <td className="p-3 text-right text-sm">{sym.count}</td>
                      <td className="p-3 text-right text-sm">
                        <span className={cn("font-mono", sym.winRate >= 50 ? "text-emerald-500" : "text-red-500")}>
                          {sym.winRate}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-sm text-muted-foreground">
                        {formatDuration(sym.avgDuration)}
                      </td>
                      <td className="p-3 text-right">
                        <span className={cn("text-sm font-mono font-medium", getProfitColor(sym.profit))}>
                          {sym.profit >= 0 ? "+" : ""}{formatCurrency(sym.profit)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
