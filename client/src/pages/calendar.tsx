import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Newspaper,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { cn, getTzAbbr } from "@/lib/utils";
import { useTimezone } from "@/hooks/use-timezone";

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
}

const IMPACT_CONFIG: Record<string, { label: string; color: string; bg: string; priority: number }> = {
  High: { label: "High", color: "text-red-500", bg: "bg-red-500", priority: 3 },
  Medium: { label: "Medium", color: "text-amber-500", bg: "bg-amber-500", priority: 2 },
  Low: { label: "Low", color: "text-yellow-500", bg: "bg-yellow-500", priority: 1 },
  Holiday: { label: "Holiday", color: "text-muted-foreground", bg: "bg-muted-foreground", priority: 0 },
};
const DEFAULT_IMPACT_CONFIG = {
  label: "Low",
  color: "text-yellow-500",
  bg: "bg-yellow-500",
  priority: 1,
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
  CNY: "🇨🇳",
};

const SESSIONS = [
  { name: "Sydney", color: "bg-blue-500", startUtc: 22, endUtc: 7, textColor: "text-blue-500" },
  { name: "Tokyo", color: "bg-purple-500", startUtc: 0, endUtc: 9, textColor: "text-purple-500" },
  { name: "London", color: "bg-emerald-500", startUtc: 8, endUtc: 17, textColor: "text-emerald-500" },
  { name: "New York", color: "bg-amber-500", startUtc: 13, endUtc: 22, textColor: "text-amber-500" },
];

function utcHourToTz(utcHour: number, tz: string): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(d)
  );
}

function formatHour12(hour: number): string {
  if (hour === 0 || hour === 24) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function isSessionActive(session: typeof SESSIONS[0], nowUtcHour: number): boolean {
  if (session.startUtc < session.endUtc) {
    return nowUtcHour >= session.startUtc && nowUtcHour < session.endUtc;
  }
  return nowUtcHour >= session.startUtc || nowUtcHour < session.endUtc;
}

function SessionsTimeline() {
  const { timezone } = useTimezone();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const nowUtcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const tzAbbr = getTzAbbr(timezone);

  const currentLocalTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(now);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const tzHours = hours.map((h) => utcHourToTz(h, timezone));
  const firstDisplayedHour = tzHours[0] ?? 0;

  function getSessionBarPosition(session: typeof SESSIONS[0]) {
    const startTz = utcHourToTz(session.startUtc, timezone);
    const endTz = utcHourToTz(session.endUtc, timezone);

    let startOffset = startTz - firstDisplayedHour;
    if (startOffset < 0) startOffset += 24;
    let endOffset = endTz - firstDisplayedHour;
    if (endOffset < 0) endOffset += 24;
    if (endOffset <= startOffset) endOffset += 24;

    const leftPct = (startOffset / 24) * 100;
    const widthPct = ((endOffset - startOffset) / 24) * 100;

    return { left: `${Math.max(0, leftPct)}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` };
  }

  function getCurrentTimePosition() {
    const currentTzHour = parseInt(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone }).format(now)
    );
    const currentTzMin = parseInt(
      new Intl.DateTimeFormat("en-US", { minute: "numeric", timeZone: timezone }).format(now)
    );
    const currentDecimal = currentTzHour + currentTzMin / 60;
    let offset = currentDecimal - firstDisplayedHour;
    if (offset < 0) offset += 24;
    return `${(offset / 24) * 100}%`;
  }

  return (
    <Card data-testid="card-sessions">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Trading Sessions
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {currentLocalTime} {tzAbbr}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1 px-0.5">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((offset) => {
              const h = (firstDisplayedHour + offset) % 24;
              return (
                <span key={offset}>{formatHour12(h)}</span>
              );
            })}
          </div>

          <div className="relative bg-muted/30 rounded-md h-1 mb-3">
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground z-20 rounded-full"
              style={{ left: getCurrentTimePosition() }}
            />
          </div>

          <div className="space-y-2.5">
            {SESSIONS.map((session) => {
              const pos = getSessionBarPosition(session);
              const active = isSessionActive(session, Math.floor(nowUtcHour));
              const localStart = formatHour12(utcHourToTz(session.startUtc, timezone));
              const localEnd = formatHour12(utcHourToTz(session.endUtc, timezone));

              return (
                <div key={session.name} className="relative h-8" data-testid={`session-${session.name.toLowerCase().replace(/\s/g, "-")}`}>
                  <div
                    className={cn(
                      "absolute h-full rounded-md flex items-center justify-center transition-opacity",
                      session.color,
                      active ? "opacity-90" : "opacity-30"
                    )}
                    style={pos}
                  >
                    <span className="text-[10px] font-medium text-white px-2 whitespace-nowrap overflow-hidden">
                      {session.name}
                    </span>
                  </div>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className={cn("text-[10px] font-mono", active ? session.textColor : "text-muted-foreground")}>
                      {localStart} - {localEnd}
                    </span>
                    {active && (
                      <div className="relative flex h-2 w-2">
                        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", session.color)} />
                        <span className={cn("relative inline-flex rounded-full h-2 w-2", session.color)} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImpactDot({ impact }: { impact: string }) {
  const config = IMPACT_CONFIG[impact] ?? DEFAULT_IMPACT_CONFIG;
  return (
    <div className="flex gap-0.5" title={config.label}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "w-2 h-2 rounded-full",
            i <= config.priority ? config.bg : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const { timezone } = useTimezone();
  const tzAbbr = getTzAbbr(timezone);
  const [impactFilter, setImpactFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [dayOffset, setDayOffset] = useState(0);

  const { data: events, isLoading, isError } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar"],
    refetchInterval: 15 * 60 * 1000,
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const targetDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(today);

  const filteredEvents = useMemo(() => {
    if (!events) return [];

    return events
      .filter((e) => {
        const eventDate = new Intl.DateTimeFormat("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: timezone,
        }).format(new Date(e.date));
        if (eventDate !== targetDate) return false;
        if (impactFilter !== "all" && e.impact !== impactFilter) return false;
        if (currencyFilter !== "all" && e.country !== currencyFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, targetDate, impactFilter, currencyFilter, timezone]);

  const currencies = useMemo(() => {
    if (!events) return [];
    const set = new Set(events.map((e) => e.country));
    return Array.from(set).sort();
  }, [events]);

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(today);

  const isToday = dayOffset === 0;

  const highImpactCount = filteredEvents.filter((e) => e.impact === "High").length;
  const mediumImpactCount = filteredEvents.filter((e) => e.impact === "Medium").length;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-calendar">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Economic Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upcoming news events and trading session times in your timezone
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap page-fade-in stagger-1">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDayOffset((d) => d - 1)}
                data-testid="button-prev-day"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant={isToday ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => setDayOffset(0)}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDayOffset((d) => d + 1)}
                data-testid="button-next-day"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium" data-testid="text-calendar-date">{dayLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={impactFilter} onValueChange={setImpactFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs" data-testid="select-impact-filter">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Impact</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger className="h-8 w-[100px] text-xs" data-testid="select-currency-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pairs</SelectItem>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CURRENCY_FLAGS[c] || ""} {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {highImpactCount > 0 && (
            <div className="flex items-center gap-2 text-xs page-fade-in stagger-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-red-500 font-medium">{highImpactCount} high-impact</span>
              {mediumImpactCount > 0 && (
                <span className="text-muted-foreground">· {mediumImpactCount} medium-impact events</span>
              )}
            </div>
          )}

          {isLoading ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </CardContent>
            </Card>
          ) : isError ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm font-medium">Failed to load calendar data</p>
                <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
              </CardContent>
            </Card>
          ) : filteredEvents.length === 0 ? (
            <Card className="page-fade-in stagger-2">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Newspaper className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No events for this day</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {impactFilter !== "all" || currencyFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Check other days for upcoming events"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="page-fade-in stagger-2">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-calendar">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-[100px]">
                          Time ({tzAbbr})
                        </th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-[80px]">
                          Currency
                        </th>
                        <th className="text-center p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-[70px]">
                          Impact
                        </th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Event
                        </th>
                        <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-[80px] hidden sm:table-cell">
                          Forecast
                        </th>
                        <th className="text-right p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-[80px] hidden sm:table-cell">
                          Previous
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event, idx) => {
                        const eventTime = new Intl.DateTimeFormat("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                          timeZone: timezone,
                        }).format(new Date(event.date));

                        const isPast = new Date(event.date) < new Date();
                        return (
                          <tr
                            key={idx}
                            className={cn(
                              "border-b last:border-0 transition-colors hover:bg-muted/30",
                              isPast && "opacity-50",
                              event.impact === "High" && !isPast && "bg-red-500/5"
                            )}
                            data-testid={`calendar-event-${idx}`}
                          >
                            <td className="p-3">
                              <span className={cn("text-xs font-mono", isPast ? "text-muted-foreground" : "font-medium")}>
                                {eventTime}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm">{CURRENCY_FLAGS[event.country] || "🏳️"}</span>
                                <span className="text-xs font-medium">{event.country}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <ImpactDot impact={event.impact} />
                            </td>
                            <td className="p-3">
                              <span className={cn("text-sm", event.impact === "High" && !isPast && "font-medium")}>
                                {event.title}
                              </span>
                            </td>
                            <td className="p-3 text-right hidden sm:table-cell">
                              <span className="text-xs font-mono text-muted-foreground">
                                {event.forecast || "-"}
                              </span>
                            </td>
                            <td className="p-3 text-right hidden sm:table-cell">
                              <span className="text-xs font-mono text-muted-foreground">
                                {event.previous || "-"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4 page-fade-in stagger-2">
          <SessionsTimeline />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Session Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {SESSIONS.map((session) => {
                const localStart = formatHour12(utcHourToTz(session.startUtc, timezone));
                const localEnd = formatHour12(utcHourToTz(session.endUtc, timezone));
                const active = isSessionActive(session, new Date().getUTCHours());
                return (
                  <div
                    key={session.name}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md border",
                      active && "border-primary/30 bg-primary/5"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", session.color, active ? "opacity-100" : "opacity-40")} />
                      <span className="text-sm font-medium">{session.name}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {localStart} - {localEnd}
                    </span>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground mt-2">
                Times shown in {tzAbbr}. Overlapping sessions (e.g., London-New York) tend to have the highest volatility.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Impact Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { impact: "High", desc: "Major market-moving events (NFP, FOMC, CPI)" },
                { impact: "Medium", desc: "Moderate volatility expected" },
                { impact: "Low", desc: "Minor impact, routine data releases" },
              ].map((item) => (
                <div key={item.impact} className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <ImpactDot impact={item.impact} />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{item.impact} Impact</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
