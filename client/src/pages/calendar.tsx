import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimezone } from "@/hooks/use-timezone";
import { cn, getTzAbbr } from "@/lib/utils";
import {
  AlertTriangle,
  Brain,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Newspaper,
  Search,
  Sparkles,
  TimerReset,
  TrendingUp,
} from "lucide-react";

type ImpactLevel = "High" | "Medium" | "Low" | "Holiday";
type BiasDirection = "bullish" | "bearish" | "mixed" | "neutral";
type Confidence = "high" | "medium" | "low";
type VolatilityLevel = "high" | "medium" | "low";

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: ImpactLevel | string;
  forecast: string;
  previous: string;
  actual?: string;
}

interface CalendarAiBrief {
  generatedAt: string;
  source: "grok" | "gemini" | "algorithmic";
  modelUsed: string;
  fallbackUsed: boolean;
  fromCache: boolean;
  dayKey: string;
  timezone: string;
  overview: string;
  sentiment: {
    label: string;
    bias: BiasDirection;
    confidence: Confidence;
    driver: string;
  };
  volatility: {
    level: VolatilityLevel;
    driver: string;
  };
  topThemes: string[];
  pairBiases: Array<{
    symbol: string;
    bias: BiasDirection;
    driver: string;
  }>;
  eventFocus: Array<{
    time: string;
    currency: string;
    title: string;
    impact: string;
    bias: BiasDirection;
    summary: string;
  }>;
  tradingPlan: string[];
  riskNotes: string[];
  providerMessage?: string;
}

type ImpactConfig = { priority: number; dotClass: string; badgeClass: string; rowClass: string };

const IMPACT_CONFIG: Record<string, ImpactConfig> = {
  High: {
    priority: 3,
    dotClass: "bg-red-500",
    badgeClass: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    rowClass: "bg-red-500/[0.04] dark:bg-red-500/[0.08]",
  },
  Medium: {
    priority: 2,
    dotClass: "bg-amber-500",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rowClass: "bg-amber-500/[0.03] dark:bg-amber-500/[0.07]",
  },
  Low: {
    priority: 1,
    dotClass: "bg-yellow-500",
    badgeClass: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    rowClass: "",
  },
  Holiday: {
    priority: 0,
    dotClass: "bg-slate-400",
    badgeClass: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    rowClass: "bg-slate-500/[0.03] dark:bg-slate-500/[0.06]",
  },
};

const SESSIONS = [
  { name: "Sydney", color: "bg-sky-500", textColor: "text-sky-600 dark:text-sky-300", startUtc: 22, endUtc: 7 },
  { name: "Tokyo", color: "bg-violet-500", textColor: "text-violet-600 dark:text-violet-300", startUtc: 0, endUtc: 9 },
  { name: "London", color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-300", startUtc: 8, endUtc: 17 },
  { name: "New York", color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-300", startUtc: 13, endUtc: 22 },
];

function getImpactConfig(impact: string): ImpactConfig {
  return IMPACT_CONFIG[impact] ?? IMPACT_CONFIG.Low ?? {
    priority: 1,
    dotClass: "bg-yellow-500",
    badgeClass: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    rowClass: "",
  };
}

function addDays(base: Date, offset: number) {
  const next = new Date(base);
  next.setDate(base.getDate() + offset);
  return next;
}

function formatDayKey(dateValue: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(dateValue));
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function formatEventTime(dateValue: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(dateValue));
}

function formatDisplayDay(dateValue: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(dateValue);
}

function formatHour12(hour: number): string {
  if (hour === 0 || hour === 24) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function utcHourToTz(utcHour: number, timezone: string) {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(d),
    10,
  );
}

function isSessionActive(startUtc: number, endUtc: number, nowUtcHour: number) {
  if (startUtc < endUtc) {
    return nowUtcHour >= startUtc && nowUtcHour < endUtc;
  }
  return nowUtcHour >= startUtc || nowUtcHour < endUtc;
}

function getBiasClasses(bias: BiasDirection) {
  if (bias === "bullish") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (bias === "bearish") return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (bias === "neutral") return "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function getVolatilityClasses(level: VolatilityLevel) {
  if (level === "high") return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  if (level === "medium") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function getEventStatus(eventDate: string) {
  const now = Date.now();
  const timestamp = new Date(eventDate).getTime();
  const deltaMinutes = Math.round((timestamp - now) / 60000);

  if (deltaMinutes < -30) {
    return { label: "Past", className: "text-muted-foreground" };
  }
  if (deltaMinutes <= 15) {
    return { label: "Due", className: "text-red-600 dark:text-red-300" };
  }
  if (deltaMinutes <= 90) {
    return { label: "Soon", className: "text-amber-600 dark:text-amber-300" };
  }
  return { label: "Upcoming", className: "text-emerald-600 dark:text-emerald-300" };
}

function ImpactDots({ impact }: { impact: string }) {
  const config = getImpactConfig(impact);
  return (
    <div className="flex items-center justify-center gap-1" title={impact}>
      {[1, 2, 3].map((index) => (
        <span
          key={index}
          className={cn(
            "h-2 w-2 rounded-full",
            index <= config.priority ? config.dotClass : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function SessionsTimeline() {
  const { timezone } = useTimezone();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const tzAbbr = getTzAbbr(timezone);
  const nowUtcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const currentLocalTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(now);

  const tzHours = Array.from({ length: 24 }, (_, hour) => utcHourToTz(hour, timezone));
  const firstDisplayedHour = tzHours[0] || 0;

  function getSessionBarPosition(startUtc: number, endUtc: number) {
    const startTz = utcHourToTz(startUtc, timezone);
    const endTz = utcHourToTz(endUtc, timezone);
    let startOffset = startTz - firstDisplayedHour;
    if (startOffset < 0) startOffset += 24;
    let endOffset = endTz - firstDisplayedHour;
    if (endOffset < 0) endOffset += 24;
    if (endOffset <= startOffset) endOffset += 24;

    const left = (startOffset / 24) * 100;
    const width = ((endOffset - startOffset) / 24) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(width, 100 - left)}%`,
    };
  }

  function getCurrentTimePosition() {
    const currentTzHour = parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now),
      10,
    );
    const currentTzMin = parseInt(
      new Intl.DateTimeFormat("en-US", { minute: "numeric", timeZone: timezone }).format(now),
      10,
    );
    let offset = currentTzHour + currentTzMin / 60 - firstDisplayedHour;
    if (offset < 0) offset += 24;
    return `${(offset / 24) * 100}%`;
  }

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Session Map
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[11px]">
            {currentLocalTime} {tzAbbr}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between px-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((offset) => {
              const hour = (firstDisplayedHour + offset) % 24;
              return <span key={offset}>{formatHour12(hour)}</span>;
            })}
          </div>

          <div className="relative h-2 rounded-full bg-muted/60">
            <div
              className="absolute inset-y-0 z-10 w-0.5 rounded-full bg-foreground"
              style={{ left: getCurrentTimePosition() }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {SESSIONS.map((session) => {
            const active = isSessionActive(session.startUtc, session.endUtc, Math.floor(nowUtcHour));
            const localStart = formatHour12(utcHourToTz(session.startUtc, timezone));
            const localEnd = formatHour12(utcHourToTz(session.endUtc, timezone));
            const barPosition = getSessionBarPosition(session.startUtc, session.endUtc);

            return (
              <div key={session.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", session.color)} />
                    <span className="font-medium text-foreground">{session.name}</span>
                    {active ? (
                      <Badge className="border-transparent bg-foreground text-background">Live</Badge>
                    ) : null}
                  </div>
                  <span className={cn("font-mono", active ? session.textColor : "text-muted-foreground")}>
                    {localStart} - {localEnd}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted/60">
                  <div
                    className={cn("absolute inset-y-0 rounded-full opacity-85", session.color, !active && "opacity-45")}
                    style={barPosition}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AiBriefPanel({
  brief,
  isLoading,
  isError,
}: {
  brief: CalendarAiBrief | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            AI Macro Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !brief) {
    return (
      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            AI Macro Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>AI brief load nahi hui.</span>
          </div>
          <p className="text-muted-foreground">
            Calendar data phir bhi available hai, lekin sentiment summary abhi generate nahi ho saki.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4" />
              AI Macro Brief
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {brief.source === "algorithmic" ? "Rule-based macro board" : `${brief.source} analysis`} in {brief.timezone}
            </p>
          </div>
          <Badge variant="outline" className="text-[11px] uppercase tracking-[0.12em]">
            {brief.fromCache ? "Cached" : "Fresh"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={cn("text-[11px]", getBiasClasses(brief.sentiment.bias))}>
            {brief.sentiment.label}
          </Badge>
          <Badge className={cn("text-[11px]", getVolatilityClasses(brief.volatility.level))}>
            {brief.volatility.level} volatility
          </Badge>
          <Badge variant="outline" className="text-[11px] uppercase tracking-[0.12em]">
            {brief.sentiment.confidence} confidence
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 text-sm">
        <div className="rounded-2xl border border-border/70 bg-muted/35 p-4">
          <p className="leading-6 text-foreground">{brief.overview}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Daily Sentiment
          </div>
          <p className="font-medium text-foreground">{brief.sentiment.driver}</p>
          <p className="text-muted-foreground">{brief.volatility.driver}</p>
        </div>

        {brief.topThemes.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Themes</div>
            <div className="flex flex-wrap gap-2">
              {brief.topThemes.map((theme) => (
                <Badge key={theme} variant="outline">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {brief.pairBiases.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pairs To Watch</div>
            <div className="space-y-2">
              {brief.pairBiases.map((item) => (
                <div key={`${item.symbol}-${item.driver}`} className="rounded-2xl border border-border/70 bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{item.symbol}</span>
                    <Badge className={getBiasClasses(item.bias)}>{item.bias}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.driver}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {brief.eventFocus.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Event Focus</div>
            <div className="space-y-2">
              {brief.eventFocus.map((event) => (
                <div key={`${event.time}-${event.currency}-${event.title}`} className="rounded-2xl border border-border/70 bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{event.time}</span>
                      <span className="font-semibold text-foreground">{event.currency}</span>
                    </div>
                    <Badge className={getBiasClasses(event.bias)}>{event.bias}</Badge>
                  </div>
                  <p className="mt-2 font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {brief.tradingPlan.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Plan</div>
            <ul className="space-y-2">
              {brief.tradingPlan.map((item) => (
                <li key={item} className="rounded-2xl border border-border/70 bg-muted/25 p-3 leading-5 text-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {brief.riskNotes.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Risk Notes</div>
            <ul className="space-y-2">
              {brief.riskNotes.map((note) => (
                <li key={note} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 leading-5 text-amber-900 dark:text-amber-100">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CalendarPage() {
  const { timezone } = useTimezone();
  const tzAbbr = getTzAbbr(timezone);
  const [impactFilter, setImpactFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [dayOffset, setDayOffset] = useState(0);

  const targetDate = useMemo(() => addDays(new Date(), dayOffset), [dayOffset]);
  const dayKey = useMemo(() => formatDayKey(targetDate, timezone), [targetDate, timezone]);

  const {
    data: events,
    isLoading,
    isError,
  } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar"],
    refetchInterval: 15 * 60 * 1000,
  });

  const aiUrl = useMemo(
    () => `/api/calendar/ai?date=${encodeURIComponent(dayKey)}&timezone=${encodeURIComponent(timezone)}`,
    [dayKey, timezone],
  );

  const {
    data: aiBrief,
    isLoading: isBriefLoading,
    isError: isBriefError,
  } = useQuery<CalendarAiBrief>({
    queryKey: [aiUrl],
    refetchInterval: 15 * 60 * 1000,
  });

  const currencies = useMemo(() => {
    const codes = new Set((events || []).map((event) => event.country));
    return Array.from(codes).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return (events || [])
      .filter((event) => formatDayKey(event.date, timezone) === dayKey)
      .filter((event) => impactFilter === "all" || event.impact === impactFilter)
      .filter((event) => currencyFilter === "all" || event.country === currencyFilter)
      .filter((event) => {
        if (!searchFilter.trim()) return true;
        const query = searchFilter.trim().toLowerCase();
        return `${event.country} ${event.title}`.toLowerCase().includes(query);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [currencyFilter, dayKey, events, impactFilter, searchFilter, timezone]);

  const isToday = dayOffset === 0;
  const displayDay = formatDisplayDay(targetDate, timezone);
  const highImpactCount = filteredEvents.filter((event) => event.impact === "High").length;
  const mediumImpactCount = filteredEvents.filter((event) => event.impact === "Medium").length;
  const liveWindowCount = filteredEvents.filter((event) => {
    const delta = new Date(event.date).getTime() - Date.now();
    return delta >= -15 * 60 * 1000 && delta <= 60 * 60 * 1000;
  }).length;

  const nextEvent = filteredEvents.find((event) => new Date(event.date).getTime() > Date.now());

  const currencyPulse = useMemo(() => {
    const pulse = new Map<string, { total: number; high: number; medium: number }>();
    for (const event of filteredEvents) {
      const current = pulse.get(event.country) || { total: 0, high: 0, medium: 0 };
      current.total += 1;
      if (event.impact === "High") current.high += 1;
      if (event.impact === "Medium") current.medium += 1;
      pulse.set(event.country, current);
    }
    return Array.from(pulse.entries())
      .map(([currency, stats]) => ({ currency, ...stats }))
      .sort((a, b) => {
        if (b.high !== a.high) return b.high - a.high;
        if (b.medium !== a.medium) return b.medium - a.medium;
        return b.total - a.total;
      })
      .slice(0, 6);
  }, [filteredEvents]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6" data-testid="page-calendar">
      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.10),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.88))] p-6 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_32%),linear-gradient(180deg,rgba(9,14,24,0.96),rgba(6,10,18,0.92))]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="border-border/70 bg-background/70">
              Forex Factory-style economic board
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Economic Calendar</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Dense event layout, timezone-aware session map, and an AI daily macro brief built on top of the live weekly calendar feed.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Timezone</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{tzAbbr}</div>
              <div className="mt-1 text-xs text-muted-foreground">{timezone}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">High Impact</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{highImpactCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Red-folder events for selected day</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">In Play</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{liveWindowCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Events due within the next hour</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Next Release</div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {nextEvent ? formatEventTime(nextEvent.date, timezone) : "None"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {nextEvent ? `${nextEvent.country} ${nextEvent.title}` : "No more scheduled releases"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="space-y-4 pb-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setDayOffset((current) => current - 1)}
                      data-testid="button-prev-day"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isToday ? "default" : "outline"}
                      className="h-9 px-4"
                      onClick={() => setDayOffset(0)}
                      data-testid="button-today"
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setDayOffset((current) => current + 1)}
                      data-testid="button-next-day"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Badge variant="outline" className="h-9 rounded-xl px-3 text-sm font-medium">
                      {displayDay}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <TimerReset className="h-3.5 w-3.5" />
                      Live weekly feed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Newspaper className="h-3.5 w-3.5" />
                      Times shown in {timezone}
                    </span>
                    {highImpactCount > 0 ? (
                      <span className="font-medium text-red-600 dark:text-red-300">
                        {highImpactCount} high-impact event{highImpactCount > 1 ? "s" : ""}
                      </span>
                    ) : null}
                    {mediumImpactCount > 0 ? (
                      <span>{mediumImpactCount} medium-impact event{mediumImpactCount > 1 ? "s" : ""}</span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_120px_120px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchFilter}
                      onChange={(event) => setSearchFilter(event.target.value)}
                      placeholder="Search event or currency"
                      className="pl-9"
                    />
                  </div>
                  <Select value={impactFilter} onValueChange={setImpactFilter}>
                    <SelectTrigger data-testid="select-impact-filter">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All impact</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                    <SelectTrigger data-testid="select-currency-filter">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All pairs</SelectItem>
                      {currencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <Skeleton key={item} className="h-14 w-full" />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="text-sm font-medium text-foreground">Calendar data load nahi hui.</p>
                  <p className="text-xs text-muted-foreground">Server ya feed response ko dobara check karein.</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <Newspaper className="h-9 w-9 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Selected filters ke sath koi event nahi mila.</p>
                  <p className="max-w-md text-xs leading-5 text-muted-foreground">
                    Dusra day choose karein ya impact/currency/search filter relax karein.
                  </p>
                </div>
              ) : (
                <ScrollArea className="w-full">
                  <div className="min-w-[980px]">
                    <table className="w-full text-sm" data-testid="table-calendar">
                      <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                        <tr className="border-y border-border/70 bg-muted/35 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          <th className="px-4 py-3 text-left font-semibold">Time ({tzAbbr})</th>
                          <th className="px-4 py-3 text-left font-semibold">Currency</th>
                          <th className="px-4 py-3 text-center font-semibold">Impact</th>
                          <th className="px-4 py-3 text-left font-semibold">Event</th>
                          <th className="px-4 py-3 text-right font-semibold">Actual</th>
                          <th className="px-4 py-3 text-right font-semibold">Forecast</th>
                          <th className="px-4 py-3 text-right font-semibold">Previous</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEvents.map((event, index) => {
                          const status = getEventStatus(event.date);
                          const impactStyle = getImpactConfig(event.impact);
                          const eventTime = formatEventTime(event.date, timezone);
                          const isPast = new Date(event.date).getTime() < Date.now() - 30 * 60 * 1000;

                          return (
                            <tr
                              key={`${event.date}-${event.country}-${event.title}-${index}`}
                              className={cn(
                                "border-b border-border/60 transition-colors hover:bg-muted/30",
                                impactStyle.rowClass,
                                isPast && "opacity-65",
                              )}
                              data-testid={`calendar-event-${index}`}
                            >
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1">
                                  <div className="font-mono text-xs font-medium text-foreground">{eventTime}</div>
                                  <div className={cn("text-[11px] uppercase tracking-[0.14em]", status.className)}>
                                    {status.label}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2.5 py-1.5">
                                  <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                                  <span className="font-semibold text-foreground">{event.country}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top text-center">
                                <div className="space-y-2">
                                  <ImpactDots impact={event.impact} />
                                  <Badge className={cn("text-[10px]", impactStyle.badgeClass)}>
                                    {event.impact}
                                  </Badge>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1">
                                  <p className="font-medium leading-5 text-foreground">{event.title}</p>
                                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                    Macro release
                                  </p>
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top text-right font-mono text-xs text-muted-foreground">
                                {event.actual || "-"}
                              </td>
                              <td className="px-4 py-3 align-top text-right font-mono text-xs text-foreground">
                                {event.forecast || "-"}
                              </td>
                              <td className="px-4 py-3 align-top text-right font-mono text-xs text-muted-foreground">
                                {event.previous || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <AiBriefPanel brief={aiBrief} isLoading={isBriefLoading} isError={isBriefError} />

          <SessionsTimeline />

          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Currency Pulse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {currencyPulse.length > 0 ? (
                currencyPulse.map((item) => (
                  <div key={item.currency} className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                    <div>
                      <div className="font-semibold text-foreground">{item.currency}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.total} event{item.total > 1 ? "s" : ""} on board
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.high > 0 ? (
                        <Badge className="border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300">
                          {item.high} high
                        </Badge>
                      ) : null}
                      {item.medium > 0 ? (
                        <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                          {item.medium} med
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Selected day ke liye abhi koi currency cluster nahi hai.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />
                Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                <span className="text-foreground">High impact expected</span>
                <ImpactDots impact="High" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                <span className="text-foreground">Medium impact expected</span>
                <ImpactDots impact="Medium" />
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-background/75 px-3 py-3">
                <span className="text-foreground">Low impact expected</span>
                <ImpactDots impact="Low" />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Forex Factory ki tarah dense board banaya gaya hai, lekin theme-safe colors aur AI sentiment panel ke sath taa-ke dark aur light dono mode mein readable rahe.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
