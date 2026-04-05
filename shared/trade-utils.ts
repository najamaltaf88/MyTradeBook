import {
  TRADING_SESSION_ORDER,
  type TradingSessionName,
  resolveTradingSessionFromUtcHour,
} from "./constants";

export const PERFECT_PROFIT_FACTOR = 9999;
export const SCREENSHOT_URL_PREFIX = "/uploads/";

export type TradingSession = TradingSessionName;
export const TRADING_SESSIONS = TRADING_SESSION_ORDER;

const TEN_PIP_SYMBOLS = [
  "XAU",
  "XAUUSD",
  "GOLD",
];

const HUNDRED_PIP_SYMBOLS = [
  "EURJPY",
  "GBPJPY",
  "USDJPY",
  "AUDJPY",
  "CADJPY",
  "NZDJPY",
  "CHFJPY",
  "XAG",
  "XAGUSD",
  "BTC",
  "BTCUSD",
  "ETH",
  "ETHUSD",
  "XTI",
  "XTIUSD",
  "XNG",
  "XNGUSD",
];

const ONE_PIP_SYMBOLS = [
  "US30",
  "DJ",
  "DJIA",
  "NAS",
  "NQ100",
  "SPX",
  "SPX500",
  "DAX",
  "DAX40",
];

function normalizeSymbol(symbol: string): string {
  return String(symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function getPipMultiplier(symbol: string): number {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) return 10000;

  if (normalized.length >= 3 && normalized.endsWith("JPY")) {
    return 100;
  }

  if (TEN_PIP_SYMBOLS.some((item) => normalized.includes(item))) {
    return 10;
  }

  if (HUNDRED_PIP_SYMBOLS.some((item) => normalized.includes(item))) {
    return 100;
  }

  if (ONE_PIP_SYMBOLS.some((item) => normalized.includes(item))) {
    return 1;
  }

  return 10000;
}

export function calculateTradePips(
  symbol: string,
  type: "BUY" | "SELL" | string,
  openPrice: number,
  closePrice: number,
): number {
  if (!Number.isFinite(openPrice) || !Number.isFinite(closePrice) || openPrice === closePrice) {
    return 0;
  }

  const pipMultiplier = getPipMultiplier(symbol);
  const rawPips =
    type === "BUY"
      ? (closePrice - openPrice) * pipMultiplier
      : (openPrice - closePrice) * pipMultiplier;

  return Math.round(rawPips * 10) / 10;
}

export function getTradingSessionFromUtcHour(hour: number): TradingSession {
  return resolveTradingSessionFromUtcHour(hour);
}

export function getTradingSession(value: string | Date | null | undefined): TradingSession {
  if (!value) return "Off-hours";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Off-hours";

  return getTradingSessionFromUtcHour(date.getUTCHours());
}

export function isPerfectProfitFactor(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= PERFECT_PROFIT_FACTOR;
}

export function extractScreenshotFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.split("?")[0];
  if (!withoutQuery) return null;
  const withoutHash = withoutQuery.split("#")[0];
  if (!withoutHash) return null;
  const normalized = withoutHash.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const rawFilename = segments[segments.length - 1];
  if (!rawFilename) {
    return null;
  }
  const filename = (() => {
    try {
      return decodeURIComponent(rawFilename);
    } catch {
      return rawFilename;
    }
  })();

  if (!filename || filename === "." || filename === "..") {
    return null;
  }

  const safePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}\.(jpg|jpeg|png|gif|webp)$/i;
  if (!safePattern.test(filename)) {
    return null;
  }

  return filename;
}

export function buildScreenshotUrl(value: unknown): string | null {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value;
  }
  const filename = extractScreenshotFilename(value);
  return filename ? `${SCREENSHOT_URL_PREFIX}${encodeURIComponent(filename)}` : null;
}
