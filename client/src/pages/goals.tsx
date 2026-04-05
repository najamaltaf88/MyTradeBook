import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Trophy,
  Target,
  TrendingUp,
  Shield,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Clock3,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, getTradeNetPnl } from "@/lib/utils";
import { useAccount } from "@/hooks/use-account";
import { useTimezone } from "@/hooks/use-timezone";
import { insertPerformanceGoalSchema } from "@shared/schema";
import type { PerformanceGoal, Trade } from "@shared/schema";

type GoalPeriodType = PerformanceGoal["periodType"];

const GOAL_PERIOD_OPTIONS: Array<{
  value: GoalPeriodType;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}> = [
  { value: "daily", label: "Daily", shortLabel: "Day", icon: Clock3 },
  { value: "weekly", label: "Weekly", shortLabel: "Week", icon: CalendarRange },
  { value: "monthly", label: "Monthly", shortLabel: "Month", icon: BarChart3 },
];

const goalFormSchema = insertPerformanceGoalSchema.extend({
  periodType: z.enum(["daily", "weekly", "monthly"]),
  periodKey: z.string().min(1, "Period is required"),
});

type GoalStats = {
  netProfit: number;
  maxLossFromStart: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  activeDays: number;
  averageDailyNetProfit: number;
  maxTradesInDay: number;
  maxDailyLossActual: number;
};

type GoalMetricStatus = {
  label: string;
  current: number;
  target: number;
  type: "profit" | "loss" | "rate" | "count";
  passed: boolean;
  icon: LucideIcon;
};

type GoalEvaluation = {
  periodClosed: boolean;
  status: "achieved" | "missed" | "on-track" | "at-risk" | "idle";
  metrics: GoalMetricStatus[];
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function getDatePartsInTimezone(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || "0"),
    month: Number(parts.find((part) => part.type === "month")?.value || "1"),
    day: Number(parts.find((part) => part.type === "day")?.value || "1"),
  };
}

function dateFromParts(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDayKeyInTimezone(value: string | Date, timezone: string) {
  return formatDayKey(dateFromParts(getDatePartsInTimezone(value, timezone)));
}

function getMonthKeyInTimezone(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function getWeekKeyInTimezone(value: string | Date, timezone: string) {
  const date = dateFromParts(getDatePartsInTimezone(value, timezone));
  const dayOfWeek = date.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return formatDayKey(date);
}

function getPeriodKeyInTimezone(value: string | Date, periodType: GoalPeriodType, timezone: string) {
  if (periodType === "daily") return getDayKeyInTimezone(value, timezone);
  if (periodType === "weekly") return getWeekKeyInTimezone(value, timezone);
  return getMonthKeyInTimezone(value, timezone);
}

function getPeriodStartDate(periodType: GoalPeriodType, periodKey: string) {
  if (periodType === "monthly") {
    return new Date(`${periodKey}-01T00:00:00.000Z`);
  }
  return new Date(`${periodKey}T00:00:00.000Z`);
}

function normalizePeriodInputValue(periodType: GoalPeriodType, rawValue: string, timezone: string) {
  if (periodType === "weekly") {
    return getWeekKeyInTimezone(rawValue, timezone);
  }
  return rawValue;
}

function getPeriodLabel(periodType: GoalPeriodType, periodKey: string) {
  if (periodType === "daily") {
    return new Date(`${periodKey}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (periodType === "weekly") {
    const start = getPeriodStartDate(periodType, periodKey);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return new Date(`${periodKey}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shiftPeriodKey(periodType: GoalPeriodType, periodKey: string, offset: number) {
  const date = getPeriodStartDate(periodType, periodKey);
  if (periodType === "daily") {
    date.setUTCDate(date.getUTCDate() + offset);
    return formatDayKey(date);
  }
  if (periodType === "weekly") {
    date.setUTCDate(date.getUTCDate() + offset * 7);
    return formatDayKey(date);
  }
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function periodIsClosed(periodType: GoalPeriodType, periodKey: string, timezone: string) {
  const currentKey = getPeriodKeyInTimezone(new Date(), periodType, timezone);
  return currentKey > periodKey;
}

function evaluateGoal(goal: PerformanceGoal, stats: GoalStats, timezone: string): GoalEvaluation {
  const metrics: GoalMetricStatus[] = [];
  if (goal.profitTarget != null) {
    metrics.push({
      label: "Profit Target",
      current: stats.netProfit,
      target: goal.profitTarget,
      type: "profit",
      passed: stats.netProfit >= goal.profitTarget,
      icon: TrendingUp,
    });
  }
  if (goal.dailyTarget != null) {
    metrics.push({
      label: goal.periodType === "daily" ? "Daily Net P&L" : "Average Daily P&L",
      current: goal.periodType === "daily" ? stats.netProfit : stats.averageDailyNetProfit,
      target: goal.dailyTarget,
      type: "profit",
      passed: (goal.periodType === "daily" ? stats.netProfit : stats.averageDailyNetProfit) >= goal.dailyTarget,
      icon: TrendingUp,
    });
  }
  if (goal.maxLoss != null) {
    metrics.push({
      label: "Max Loss Limit",
      current: stats.maxLossFromStart,
      target: goal.maxLoss,
      type: "loss",
      passed: stats.maxLossFromStart <= goal.maxLoss,
      icon: AlertTriangle,
    });
  }
  if (goal.maxDailyLoss != null) {
    metrics.push({
      label: "Max Daily Loss",
      current: stats.maxDailyLossActual,
      target: goal.maxDailyLoss,
      type: "loss",
      passed: stats.maxDailyLossActual <= goal.maxDailyLoss,
      icon: Shield,
    });
  }
  if (goal.winRateTarget != null) {
    metrics.push({
      label: "Win Rate",
      current: stats.winRate,
      target: goal.winRateTarget,
      type: "rate",
      passed: stats.winRate >= goal.winRateTarget,
      icon: Target,
    });
  }
  if (goal.maxTradesPerDay != null) {
    metrics.push({
      label: "Max Trades In One Day",
      current: stats.maxTradesInDay,
      target: goal.maxTradesPerDay,
      type: "count",
      passed: stats.maxTradesInDay <= goal.maxTradesPerDay,
      icon: Shield,
    });
  }

  const periodClosed = periodIsClosed(goal.periodType, goal.periodKey, timezone);
  if (metrics.length === 0) {
    return { periodClosed, status: "idle", metrics };
  }
  if (periodClosed) {
    return { periodClosed, status: metrics.every((metric) => metric.passed) ? "achieved" : "missed", metrics };
  }
  return { periodClosed, status: metrics.every((metric) => metric.passed) ? "on-track" : "at-risk", metrics };
}

function buildGoalStats(periodType: GoalPeriodType, periodKey: string, trades: Trade[] | undefined, timezone: string): GoalStats {
  if (!trades) {
    return {
      netProfit: 0,
      maxLossFromStart: 0,
      winRate: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      activeDays: 0,
      averageDailyNetProfit: 0,
      maxTradesInDay: 0,
      maxDailyLossActual: 0,
    };
  }

  const periodTrades = trades.filter((trade) => {
    if (!trade.isClosed || !trade.closeTime) return false;
    return getPeriodKeyInTimezone(trade.closeTime as string | Date, periodType, timezone) === periodKey;
  });

  const netProfit = periodTrades.reduce((sum, trade) => sum + getTradeNetPnl(trade), 0);
  const wins = periodTrades.filter((trade) => getTradeNetPnl(trade) > 0).length;
  const losses = periodTrades.filter((trade) => getTradeNetPnl(trade) < 0).length;
  const winRate = periodTrades.length > 0 ? (wins / periodTrades.length) * 100 : 0;

  const sortedTrades = [...periodTrades].sort((a, b) => {
    const aTime = a.closeTime ? new Date(a.closeTime).getTime() : 0;
    const bTime = b.closeTime ? new Date(b.closeTime).getTime() : 0;
    return aTime - bTime;
  });

  let runningNet = 0;
  let minNetFromStart = 0;
  for (const trade of sortedTrades) {
    runningNet += getTradeNetPnl(trade);
    minNetFromStart = Math.min(minNetFromStart, runningNet);
  }

  const dailyNetByDay: Record<string, number> = {};
  const dailyTradesByDay: Record<string, number> = {};
  periodTrades.forEach((trade) => {
    const dayKey = getDayKeyInTimezone(trade.closeTime as string | Date, timezone);
    const tradeNet = getTradeNetPnl(trade);
    dailyNetByDay[dayKey] = (dailyNetByDay[dayKey] || 0) + tradeNet;
    dailyTradesByDay[dayKey] = (dailyTradesByDay[dayKey] || 0) + 1;
  });

  const dailyNetValues = Object.values(dailyNetByDay);
  const activeDays = Object.keys(dailyNetByDay).length;
  const averageDailyNetProfit =
    periodType === "daily"
      ? netProfit
      : activeDays > 0
      ? dailyNetValues.reduce((sum, value) => sum + value, 0) / activeDays
      : 0;
  const maxTradesInDay = Object.values(dailyTradesByDay).length > 0 ? Math.max(...Object.values(dailyTradesByDay)) : 0;
  const maxDailyLossActual = dailyNetValues.length > 0
    ? Math.max(0, ...dailyNetValues.map((value) => Math.max(0, -value)))
    : 0;

  return {
    netProfit,
    maxLossFromStart: Math.abs(minNetFromStart),
    winRate,
    totalTrades: periodTrades.length,
    wins,
    losses,
    activeDays,
    averageDailyNetProfit,
    maxTradesInDay,
    maxDailyLossActual,
  };
}

function statusBadge(status: GoalEvaluation["status"]) {
  if (status === "achieved") return { label: "Achieved", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (status === "missed") return { label: "Missed", className: "bg-red-500/10 text-red-600 border-red-500/30" };
  if (status === "on-track") return { label: "On track", className: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
  if (status === "at-risk") return { label: "At risk", className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  return { label: "No targets", className: "bg-muted text-muted-foreground border-transparent" };
}

function GoalProgress({
  metric,
}: {
  metric: GoalMetricStatus;
}) {
  let progress = 0;

  if (metric.type === "profit" || metric.type === "rate") {
    progress = metric.target > 0 ? clampPercent((metric.current / metric.target) * 100) : 0;
  } else {
    progress = metric.target > 0 ? clampPercent((Math.abs(metric.current) / metric.target) * 100) : 0;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <metric.icon className="w-3 h-3" />
          {metric.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-medium">
            {metric.type === "profit" || metric.type === "loss"
              ? formatCurrency(metric.current)
              : metric.type === "rate"
              ? `${metric.current.toFixed(1)}%`
              : metric.current}
          </span>
          <span className="text-[10px] text-muted-foreground">
            / {metric.type === "profit" || metric.type === "loss"
              ? formatCurrency(metric.target)
              : metric.type === "rate"
              ? `${metric.target}%`
              : metric.target}
          </span>
          {metric.passed ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <XCircle className="w-3 h-3 text-red-500" />
          )}
        </div>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            metric.passed ? "bg-emerald-500" : "bg-amber-500"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function GoalFormDialog({
  open,
  onOpenChange,
  existingGoal,
  defaultPeriodType,
  defaultPeriodKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingGoal?: PerformanceGoal;
  defaultPeriodType: GoalPeriodType;
  defaultPeriodKey: string;
}) {
  const { toast } = useToast();
  const { timezone } = useTimezone();

  const form = useForm<z.infer<typeof goalFormSchema>>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      periodType: existingGoal?.periodType || defaultPeriodType,
      periodKey: existingGoal?.periodKey || defaultPeriodKey,
      profitTarget: existingGoal?.profitTarget ?? undefined,
      dailyTarget: existingGoal?.dailyTarget ?? undefined,
      maxLoss: existingGoal?.maxLoss ?? undefined,
      maxDailyLoss: existingGoal?.maxDailyLoss ?? undefined,
      winRateTarget: existingGoal?.winRateTarget ?? undefined,
      maxTradesPerDay: existingGoal?.maxTradesPerDay ?? undefined,
      notes: existingGoal?.notes || "",
    },
  });

  const watchedPeriodType = form.watch("periodType");

  const saveMutation = useMutation({
    mutationFn: async (data: z.infer<typeof goalFormSchema>) => {
      const normalizedPeriodKey = normalizePeriodInputValue(data.periodType, data.periodKey, timezone);
      const body = {
        periodType: data.periodType,
        periodKey: normalizedPeriodKey,
        month: data.periodType === "monthly" ? normalizedPeriodKey : null,
        profitTarget: data.profitTarget ?? null,
        dailyTarget: data.dailyTarget ?? null,
        maxLoss: data.maxLoss ?? null,
        maxDailyLoss: data.maxDailyLoss ?? null,
        winRateTarget: data.winRateTarget ?? null,
        maxTradesPerDay: data.maxTradesPerDay ?? null,
        notes: data.notes || null,
      };
      if (existingGoal) {
        const res = await apiRequest("PATCH", `/api/goals/${existingGoal.id}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/goals", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: existingGoal ? "Goal updated" : "Goal created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const periodLabel = GOAL_PERIOD_OPTIONS.find((option) => option.value === watchedPeriodType)?.shortLabel || "Period";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingGoal ? "Edit Goal" : `Set ${periodLabel} Goal`}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="periodType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goal Cycle</FormLabel>
                  <Select value={field.value} onValueChange={(value) => field.onChange(value as GoalPeriodType)}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select goal cycle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GOAL_PERIOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="periodKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {watchedPeriodType === "daily" ? "Date" : watchedPeriodType === "weekly" ? "Any date in the week" : "Month"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type={watchedPeriodType === "monthly" ? "month" : "date"}
                      {...field}
                    />
                  </FormControl>
                  {watchedPeriodType === "weekly" ? (
                    <p className="text-[11px] text-muted-foreground">The app automatically saves the Monday that starts this trading week.</p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="profitTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profit Target ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 500"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxLoss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Loss ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 200"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dailyTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchedPeriodType === "daily" ? "Net Target ($)" : "Avg Daily Target ($)"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 50"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxDailyLoss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Daily Loss ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 100"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="winRateTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Win Rate Target (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 55"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxTradesPerDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Trades Per Day</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 3"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Focus Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What matters most for this goal cycle?"
                      {...field}
                      value={field.value || ""}
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Target className="w-4 h-4 mr-2" />
              )}
              {existingGoal ? "Update Goal" : "Save Goal"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function GoalsPage() {
  const { toast } = useToast();
  const { selectedAccountId, queryParam } = useAccount();
  const { timezone } = useTimezone();
  const now = new Date();

  const [selectedPeriodType, setSelectedPeriodType] = useState<GoalPeriodType>("monthly");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(getPeriodKeyInTimezone(now, "monthly", timezone));
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<PerformanceGoal | undefined>();

  const { data: goals = [], isLoading: goalsLoading, isError: goalsError } = useQuery<PerformanceGoal[]>({
    queryKey: ["/api/goals"],
  });

  const { data: trades } = useQuery<Trade[]>({
    queryKey: ["/api/trades", selectedAccountId],
    queryFn: async () => {
      const res = await fetch(`/api/trades${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      toast({ title: "Goal deleted" });
    },
  });

  const goalsForPeriodType = useMemo(
    () => goals.filter((goal) => goal.periodType === selectedPeriodType),
    [goals, selectedPeriodType],
  );

  const selectedGoal = useMemo(
    () => goalsForPeriodType.find((goal) => goal.periodKey === selectedPeriodKey),
    [goalsForPeriodType, selectedPeriodKey],
  );

  const currentPeriodKey = getPeriodKeyInTimezone(new Date(), selectedPeriodType, timezone);
  const currentGoal = goalsForPeriodType.find((goal) => goal.periodKey === currentPeriodKey);

  const goalCards = useMemo(() => {
    return goalsForPeriodType
      .slice()
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
      .slice(0, 6)
      .map((goal) => {
        const stats = buildGoalStats(goal.periodType, goal.periodKey, trades, timezone);
        return {
          goal,
          stats,
          evaluation: evaluateGoal(goal, stats, timezone),
        };
      });
  }, [goalsForPeriodType, trades, timezone]);

  const selectedStats = buildGoalStats(selectedPeriodType, selectedPeriodKey, trades, timezone);
  const selectedEvaluation = selectedGoal ? evaluateGoal(selectedGoal, selectedStats, timezone) : null;

  const summaryCards = useMemo(() => {
    const evaluations = goalCards.map((card) => card.evaluation.status);
    return {
      total: goalsForPeriodType.length,
      achieved: evaluations.filter((status) => status === "achieved").length,
      atRisk: evaluations.filter((status) => status === "at-risk").length,
    };
  }, [goalCards, goalsForPeriodType.length]);

  const selectedPeriodMeta = GOAL_PERIOD_OPTIONS.find((option) => option.value === selectedPeriodType) ?? {
    value: "monthly" as GoalPeriodType,
    label: "Monthly",
    shortLabel: "Month",
    icon: BarChart3,
  };

  if (goalsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (goalsError) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium">Failed to load performance goals</p>
            <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-goals">
      <Card className="hero-panel overflow-hidden shadow-xl page-fade-in">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.35fr,0.95fr] md:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Performance Goals</Badge>
              <Badge variant="outline">{selectedPeriodMeta.label} planning</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Track whether the target was actually met</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Move between daily, weekly, and monthly cycles, set hard limits, and review finished periods as achieved or missed instead of relying on memory.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{selectedPeriodMeta.label} goals</div>
              <div className="mt-2 text-3xl font-semibold">{summaryCards.total}</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Achieved</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-600 dark:text-emerald-300">{summaryCards.achieved}</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">At risk</div>
              <div className="mt-2 text-3xl font-semibold text-amber-600 dark:text-amber-300">{summaryCards.atRisk}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={selectedPeriodType}
            onValueChange={(value) => {
              const nextType = value as GoalPeriodType;
              setSelectedPeriodType(nextType);
              setSelectedPeriodKey(getPeriodKeyInTimezone(new Date(), nextType, timezone));
            }}
            className="w-full lg:w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 lg:w-[360px]">
              {GOAL_PERIOD_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value} className="gap-2">
                  <option.icon className="h-4 w-4" />
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedPeriodKey((current) => shiftPeriodKey(selectedPeriodType, current, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedPeriodKey(getPeriodKeyInTimezone(new Date(), selectedPeriodType, timezone))}
            >
              Current {selectedPeriodMeta.shortLabel}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedPeriodKey((current) => shiftPeriodKey(selectedPeriodType, current, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button onClick={() => { setEditGoal(undefined); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Set {selectedPeriodMeta.shortLabel} Goal
            </Button>
          </div>
        </CardContent>
      </Card>

      {(showForm || editGoal) && (
        <GoalFormDialog
          key={editGoal ? `edit-${editGoal.id}` : `create-${selectedPeriodType}-${selectedPeriodKey}`}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setShowForm(false);
              setEditGoal(undefined);
            }
          }}
          existingGoal={editGoal}
          defaultPeriodType={selectedPeriodType}
          defaultPeriodKey={selectedPeriodKey}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <selectedPeriodMeta.icon className="h-5 w-5" />
              {getPeriodLabel(selectedPeriodType, selectedPeriodKey)}
            </CardTitle>
            <CardDescription>
              {selectedGoal
                ? "This goal is scored against the trades closed inside the selected period."
                : `No ${selectedPeriodMeta.label.toLowerCase()} goal saved for this period yet.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedGoal ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="space-y-1">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn("border", statusBadge(selectedEvaluation?.status || "idle").className)}>
                        {statusBadge(selectedEvaluation?.status || "idle").label}
                      </Badge>
                      {selectedEvaluation?.periodClosed ? (
                        <span className="text-xs text-muted-foreground">Period finished</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Still active</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => { setEditGoal(selectedGoal); setShowForm(false); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(selectedGoal.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Net P&L</div>
                    <div className={cn("mt-2 text-2xl font-semibold", selectedStats.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                      {selectedStats.netProfit >= 0 ? "+" : ""}{formatCurrency(selectedStats.netProfit)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Win Rate</div>
                    <div className="mt-2 text-2xl font-semibold">{selectedStats.winRate.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trades Closed</div>
                    <div className="mt-2 text-2xl font-semibold">{selectedStats.totalTrades}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedEvaluation?.metrics.map((metric) => (
                    <GoalProgress key={metric.label} metric={metric} />
                  ))}
                </div>

                {selectedGoal.notes ? (
                  <div className="rounded-2xl border border-border/60 bg-muted/35 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Focus notes</div>
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{selectedGoal.notes}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>{selectedStats.totalTrades} trades in this period</span>
                  <span>{selectedStats.wins}W / {selectedStats.losses}L</span>
                  <span>{selectedStats.activeDays} active day{selectedStats.activeDays === 1 ? "" : "s"}</span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Trophy className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No goal set for this period</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create a {selectedPeriodMeta.label.toLowerCase()} goal for {getPeriodLabel(selectedPeriodType, selectedPeriodKey)} and this page will score it as achieved or missed when the period ends.
                </p>
                <Button className="mt-4" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Set {selectedPeriodMeta.shortLabel} Goal
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle>Recent {selectedPeriodMeta.label} Goals</CardTitle>
            <CardDescription>Quick access to your latest goal cycles in this view.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {goalCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                No {selectedPeriodMeta.label.toLowerCase()} goals saved yet.
              </div>
            ) : (
              goalCards.map(({ goal, stats, evaluation }) => {
                const badge = statusBadge(evaluation.status);
                const isSelected = goal.periodKey === selectedPeriodKey;
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setSelectedPeriodKey(goal.periodKey)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      isSelected ? "border-primary/50 bg-primary/5" : "border-border/60 bg-background hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{getPeriodLabel(goal.periodType, goal.periodKey)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {stats.totalTrades} trades, {stats.netProfit >= 0 ? "+" : ""}{formatCurrency(stats.netProfit)}
                        </div>
                      </div>
                      <Badge className={cn("border", badge.className)}>{badge.label}</Badge>
                    </div>
                  </button>
                );
              })
            )}

            {currentGoal && currentGoal.periodKey !== selectedPeriodKey ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSelectedPeriodKey(currentGoal.periodKey)}
              >
                Jump to current {selectedPeriodMeta.shortLabel.toLowerCase()}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
