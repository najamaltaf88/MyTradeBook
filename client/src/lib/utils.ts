import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Trade } from "@shared/schema"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "-";
  if (seconds === 0) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d}d ${h}h`;
}

export function getTzAbbr(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value || tz;
  } catch {
    return tz;
  }
}

export function formatDate(date: string | Date | null | undefined, tz: string = "UTC"): string {
  if (!date) return "-";
  const abbr = getTzAbbr(tz);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(date)) + " " + abbr;
}

export function formatDateShort(date: string | Date | null | undefined, tz: string = "UTC"): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(new Date(date));
}

export function utcToTzHour(utcHour: number, tz: string = "UTC"): number {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(d));
}

export function formatShortDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function getProfitColor(profit: number): string {
  if (profit > 0) return "text-emerald-500";
  if (profit < 0) return "text-red-500";
  return "text-muted-foreground";
}

export function getTradeNetPnl(trade: Pick<Trade, "profit" | "commission" | "swap">): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

export function formatPercent(
  value: number,
  options?: { decimals?: number },
): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const decimals = options?.decimals ?? 1;
  return `${safeValue.toFixed(decimals)}%`;
}
