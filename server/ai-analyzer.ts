import type { Trade } from "@shared/schema";
import {
  TRADING_SESSION_ORDER,
  type TradingSessionName,
  resolveTradingSessionFromUtcHour,
} from "@shared/constants";

export type TradingStyle = "all" | "scalping" | "intraday" | "swing";
export type TradeGrade = "A+" | "A" | "B" | "C" | "D" | "F";
type RiskGrade = "A" | "B" | "C" | "D" | "F";
type SessionName = TradingSessionName;

type CriterionKey =
  | "riskManagement"
  | "riskReward"
  | "rMultiple"
  | "sessionTiming"
  | "duration"
  | "positionSizing"
  | "revengeTrade"
  | "overtrading"
  | "planExecution"
  | "symbolExpertise";

export interface CriterionResult {
  key: CriterionKey;
  label: string;
  score: number;
  maxScore: 10;
  note: string;
}

export interface TradeAnalysis {
  tradeId: string;
  grade: TradeGrade;
  score: number;
  style: TradingStyle;
  session: SessionName;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  whatWentRight: string[];
  whatWentWrong: string[];
  checks: {
    riskReward: string;
    timing: string;
    duration: string;
    pnlContext: string;
    sizing: string;
    revenge: string;
    slTpDiscipline: string;
  };
  criteria: CriterionResult[];
  metrics: {
    rrRatio: number | null;
    rMultiple: number | null;
    durationMinutes: number | null;
    dayTradeNumber: number;
    symbolHistoricalWinRate: number | null;
    netPnl: number;
  };
}

export interface PortfolioAnalysis {
  style: TradingStyle;
  styleScope: {
    requestedStyle: TradingStyle;
    matchedTrades: number;
    totalTrades: number;
    classification: "all_trades" | "keyword_then_duration";
  };
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
    rating: RiskGrade;
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
  hourlyAnalysis: Array<{
    hour: number;
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
}

type StyleProfile = {
  style: TradingStyle;
  minRrStrong: number;
  minRrAcceptable: number;
  durationIdealMinSec: number;
  durationIdealMaxSec: number;
  durationSoftMinSec: number;
  durationSoftMaxSec: number;
  revengeWindowSec: number;
  overtradingLimit: number;
  preferredSessions: SessionName[];
};

type TradeContext = {
  allTrades: Trade[];
  closedTrades: Trade[];
  closedByCloseAsc: Trade[];
  medianVolume: number;
  avgWin: number;
  avgLoss: number;
  avgWinDuration: number;
  avgLossDuration: number;
  dayTradeNumberById: Map<string, number>;
  dayTradeCountMap: Map<string, number>;
};

const STYLE_PROFILES: Record<TradingStyle, StyleProfile> = {
  all: {
    style: "all",
    minRrStrong: 1.4,
    minRrAcceptable: 1.0,
    durationIdealMinSec: 5 * 60,
    durationIdealMaxSec: 24 * 60 * 60,
    durationSoftMinSec: 60,
    durationSoftMaxSec: 14 * 24 * 60 * 60,
    revengeWindowSec: 45 * 60,
    overtradingLimit: 8,
    preferredSessions: ["London", "London/NY Overlap", "New York"],
  },
  scalping: {
    style: "scalping",
    minRrStrong: 1.2,
    minRrAcceptable: 0.9,
    durationIdealMinSec: 2 * 60,
    durationIdealMaxSec: 45 * 60,
    durationSoftMinSec: 1 * 60,
    durationSoftMaxSec: 2 * 60 * 60,
    revengeWindowSec: 20 * 60,
    overtradingLimit: 10,
    preferredSessions: ["London", "London/NY Overlap", "New York"],
  },
  intraday: {
    style: "intraday",
    minRrStrong: 1.5,
    minRrAcceptable: 1.1,
    durationIdealMinSec: 30 * 60,
    durationIdealMaxSec: 6 * 60 * 60,
    durationSoftMinSec: 10 * 60,
    durationSoftMaxSec: 12 * 60 * 60,
    revengeWindowSec: 30 * 60,
    overtradingLimit: 5,
    preferredSessions: ["London", "London/NY Overlap", "New York"],
  },
  swing: {
    style: "swing",
    minRrStrong: 2.0,
    minRrAcceptable: 1.4,
    durationIdealMinSec: 6 * 60 * 60,
    durationIdealMaxSec: 5 * 24 * 60 * 60,
    durationSoftMinSec: 60 * 60,
    durationSoftMaxSec: 14 * 24 * 60 * 60,
    revengeWindowSec: 2 * 60 * 60,
    overtradingLimit: 2,
    preferredSessions: ["London", "New York", "London/NY Overlap"],
  },
};

export function normalizeTradingStyle(input?: string): TradingStyle {
  const raw = String(input || "").trim().toLowerCase();
  if (raw === "all" || raw === "scalping" || raw === "intraday" || raw === "swing") {
    return raw;
  }
  return "all";
}

function getProfile(input?: string): StyleProfile {
  return STYLE_PROFILES[normalizeTradingStyle(input)];
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

function tradeNetPnl(trade: Trade): number {
  return toNumber(trade.profit, 0) + toNumber(trade.commission, 0) + toNumber(trade.swap, 0);
}

function tradeOpenDate(trade: Trade): Date | null {
  return asDate(trade.openTime);
}

function tradeCloseDate(trade: Trade): Date | null {
  return asDate(trade.closeTime);
}

function tradeDurationSec(trade: Trade): number | null {
  const explicit = toNumber(trade.duration, 0);
  if (explicit > 0) return explicit;
  const open = tradeOpenDate(trade);
  const close = tradeCloseDate(trade);
  if (!open || !close) return null;
  const diff = Math.floor((close.getTime() - open.getTime()) / 1000);
  return diff > 0 ? diff : null;
}

function inferTradingStyleFromText(trade: Trade): TradingStyle | null {
  const source = [trade.comment, trade.reason, trade.logic]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!source) return null;
  if (/\bscalp(?:ing)?\b/.test(source)) return "scalping";
  if (/\bswing\b/.test(source)) return "swing";
  if (/\bintraday\b|\bday\s*trade\b/.test(source)) return "intraday";
  return null;
}

export function inferTradingStyleForTrade(trade: Trade): TradingStyle {
  const tagged = inferTradingStyleFromText(trade);
  if (tagged) return tagged;

  const duration = tradeDurationSec(trade);
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    if (duration <= STYLE_PROFILES.scalping.durationSoftMaxSec) return "scalping";
    if (duration <= STYLE_PROFILES.intraday.durationSoftMaxSec) return "intraday";
    return "swing";
  }

  return "intraday";
}

export function filterTradesByStyle(
  trades: Trade[],
  style?: TradingStyle | string,
): Trade[] {
  const normalizedStyle = normalizeTradingStyle(style);
  if (normalizedStyle === "all") return trades;
  return trades.filter((trade) => inferTradingStyleForTrade(trade) === normalizedStyle);
}

function tradeSession(trade: Trade): SessionName {
  const open = tradeOpenDate(trade);
  if (!open) return "Off-hours";
  return resolveTradingSessionFromUtcHour(open.getUTCHours());
}

function dayKeyFromTrade(trade: Trade): string {
  const open = tradeOpenDate(trade);
  if (!open) return "unknown";
  return open.toISOString().slice(0, 10);
}

function riskDistance(trade: Trade): number | null {
  const openPrice = toNumber(trade.openPrice, 0);
  const stopLoss = toNumber(trade.stopLoss, 0);
  if (!openPrice || !stopLoss) return null;
  const risk = Math.abs(openPrice - stopLoss);
  return risk > 0 ? risk : null;
}

function rewardDistance(trade: Trade): number | null {
  const openPrice = toNumber(trade.openPrice, 0);
  const takeProfit = toNumber(trade.takeProfit, 0);
  if (!openPrice || !takeProfit) return null;
  const reward = Math.abs(takeProfit - openPrice);
  return reward > 0 ? reward : null;
}

function riskRewardRatio(trade: Trade): number | null {
  const risk = riskDistance(trade);
  const reward = rewardDistance(trade);
  if (!risk || !reward) return null;
  return reward / risk;
}

function tradeRMultiple(trade: Trade): number | null {
  const risk = riskDistance(trade);
  const openPrice = toNumber(trade.openPrice, 0);
  const closePrice = toNumber(trade.closePrice, 0);
  if (!risk || !openPrice || !closePrice || !trade.isClosed) return null;
  const move =
    trade.type === "BUY"
      ? closePrice - openPrice
      : openPrice - closePrice;
  return move / risk;
}

function scoreToGrade(score: number): TradeGrade {
  if (score >= 95) return "A+";
  if (score >= 88) return "A";
  if (score >= 78) return "B";
  if (score >= 66) return "C";
  if (score >= 54) return "D";
  return "F";
}

function scoreToRiskGrade(scoreOutOf25: number): RiskGrade {
  if (scoreOutOf25 >= 22) return "A";
  if (scoreOutOf25 >= 18) return "B";
  if (scoreOutOf25 >= 14) return "C";
  if (scoreOutOf25 >= 10) return "D";
  return "F";
}

function pushUnique(target: string[], value: string) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function compareByOpenAsc(a: Trade, b: Trade): number {
  return (tradeOpenDate(a)?.getTime() || 0) - (tradeOpenDate(b)?.getTime() || 0);
}

function compareByCloseAsc(a: Trade, b: Trade): number {
  const aTime = tradeCloseDate(a)?.getTime() || tradeOpenDate(a)?.getTime() || 0;
  const bTime = tradeCloseDate(b)?.getTime() || tradeOpenDate(b)?.getTime() || 0;
  return aTime - bTime;
}

function buildTradeContext(trades: Trade[]): TradeContext {
  const allTrades = [...trades].sort(compareByOpenAsc);
  const closedTrades = allTrades.filter((trade) => trade.isClosed);
  const closedByCloseAsc = [...closedTrades].sort(compareByCloseAsc);

  const wins = closedTrades.map(tradeNetPnl).filter((pnl) => pnl > 0);
  const losses = closedTrades.map(tradeNetPnl).filter((pnl) => pnl < 0).map((pnl) => Math.abs(pnl));
  const volumes = allTrades
    .map((trade) => toNumber(trade.volume, 0))
    .filter((v) => v > 0);
  const winDurations = closedTrades
    .filter((trade) => tradeNetPnl(trade) > 0)
    .map((trade) => tradeDurationSec(trade) || 0)
    .filter((v) => v > 0);
  const lossDurations = closedTrades
    .filter((trade) => tradeNetPnl(trade) < 0)
    .map((trade) => tradeDurationSec(trade) || 0)
    .filter((v) => v > 0);

  const dayTradeNumberById = new Map<string, number>();
  const dayTradeCountMap = new Map<string, number>();
  for (const trade of allTrades) {
    const key = dayKeyFromTrade(trade);
    const nextCount = (dayTradeCountMap.get(key) || 0) + 1;
    dayTradeCountMap.set(key, nextCount);
    dayTradeNumberById.set(trade.id, nextCount);
  }

  return {
    allTrades,
    closedTrades,
    closedByCloseAsc,
    medianVolume: median(volumes),
    avgWin: average(wins),
    avgLoss: average(losses),
    avgWinDuration: average(winDurations),
    avgLossDuration: average(lossDurations),
    dayTradeNumberById,
    dayTradeCountMap,
  };
}

function getPreviousClosedTrade(trade: Trade, context: TradeContext): Trade | null {
  const openTs = tradeOpenDate(trade)?.getTime();
  if (!openTs) return null;
  for (let i = context.closedByCloseAsc.length - 1; i >= 0; i--) {
    const candidate = context.closedByCloseAsc[i];
    if (!candidate) continue;
    if (candidate.id === trade.id) continue;
    const closeTs =
      tradeCloseDate(candidate)?.getTime() ||
      tradeOpenDate(candidate)?.getTime() ||
      0;
    if (closeTs > 0 && closeTs < openTs) return candidate;
  }
  return null;
}

function getSymbolHistoryStats(
  trade: Trade,
  context: TradeContext,
): { count: number; winRate: number | null } {
  const symbol = String(trade.symbol || "").toUpperCase();
  if (!symbol) return { count: 0, winRate: null };
  const openTs = tradeOpenDate(trade)?.getTime() || Number.MAX_SAFE_INTEGER;
  const history = context.closedTrades.filter((item) => {
    if (item.id === trade.id) return false;
    if (String(item.symbol || "").toUpperCase() !== symbol) return false;
    const itemTs =
      tradeCloseDate(item)?.getTime() ||
      tradeOpenDate(item)?.getTime() ||
      0;
    return itemTs > 0 && itemTs < openTs;
  });
  if (!history.length) return { count: 0, winRate: null };
  const wins = history.filter((item) => tradeNetPnl(item) > 0).length;
  return { count: history.length, winRate: (wins / history.length) * 100 };
}

function averagePnlContext(netPnl: number, avgWin: number, avgLoss: number): string {
  if (netPnl > 0 && avgWin > 0) {
    if (netPnl >= avgWin * 1.25) return "This winner outperformed your average winning trade.";
    if (netPnl >= avgWin * 0.75) return "This winner was in line with your normal winners.";
    return "Profitable trade, but below your typical winner size.";
  }
  if (netPnl < 0 && avgLoss > 0) {
    const abs = Math.abs(netPnl);
    if (abs <= avgLoss * 0.8) return "Loss stayed smaller than your typical losing trade.";
    if (abs <= avgLoss * 1.2) return "Loss size was close to your historical average.";
    return "Loss exceeded your typical losing trade size.";
  }
  return "Limited closed-trade history to benchmark P&L context.";
}

function analyzeTradeWithContext(
  trade: Trade,
  context: TradeContext,
  profile: StyleProfile,
): TradeAnalysis {
  const session = tradeSession(trade);
  const rr = riskRewardRatio(trade);
  const rMultiple = tradeRMultiple(trade);
  const durationSec = tradeDurationSec(trade);
  const durationMinutes = durationSec ? durationSec / 60 : null;
  const netPnl = tradeNetPnl(trade);
  const dayTradeNumber = context.dayTradeNumberById.get(trade.id) || 1;
  const symbolHistory = getSymbolHistoryStats(trade, context);

  const openPrice = toNumber(trade.openPrice, 0);
  const stopLoss = toNumber(trade.stopLoss, 0);
  const takeProfit = toNumber(trade.takeProfit, 0);
  const hasSl = stopLoss > 0;
  const hasTp = takeProfit > 0;
  const slLogical = hasSl
    ? trade.type === "BUY"
      ? stopLoss < openPrice
      : stopLoss > openPrice
    : false;

  const previousClosed = getPreviousClosedTrade(trade, context);
  const previousClosedLoss = previousClosed ? tradeNetPnl(previousClosed) < 0 : false;
  const secondsSincePrevious =
    previousClosed && tradeOpenDate(trade)
      ? ((tradeOpenDate(trade)?.getTime() || 0) -
        (tradeCloseDate(previousClosed)?.getTime() ||
          tradeOpenDate(previousClosed)?.getTime() ||
          0)) /
        1000
      : Number.POSITIVE_INFINITY;
  const isRevengeTrade =
    previousClosedLoss &&
    secondsSincePrevious >= 0 &&
    secondsSincePrevious <= profile.revengeWindowSec;

  const criteria: CriterionResult[] = [];
  const strengths: string[] = [];
  const improvements: string[] = [];

  const addCriterion = (
    key: CriterionKey,
    label: string,
    score: number,
    note: string,
    strengthHint: string,
    improvementHint: string,
  ) => {
    const bounded = clamp(round(score, 1), 0, 10);
    criteria.push({ key, label, score: bounded, maxScore: 10, note });
    if (bounded >= 8) pushUnique(strengths, strengthHint);
    if (bounded <= 5) pushUnique(improvements, improvementHint);
  };

  if (!hasSl) {
    addCriterion(
      "riskManagement",
      "Risk Management",
      0,
      "No stop loss was set; downside was not predefined.",
      "Trade had full risk plan (SL + TP) before execution.",
      "Set a logical stop loss before entry. This is the primary risk control.",
    );
  } else if (!slLogical) {
    addCriterion(
      "riskManagement",
      "Risk Management",
      2,
      "Stop loss appears on the wrong side of entry for this direction.",
      "Trade had full risk plan (SL + TP) before execution.",
      "Place SL beyond invalidation: below entry for BUY, above entry for SELL.",
    );
  } else if (hasTp) {
    addCriterion(
      "riskManagement",
      "Risk Management",
      10,
      "SL and TP were both defined with coherent placement.",
      "Trade had full risk plan (SL + TP) before execution.",
      "Keep defining SL and TP before every entry.",
    );
  } else {
    addCriterion(
      "riskManagement",
      "Risk Management",
      8,
      "SL was set, but TP was missing.",
      "Stop loss discipline is present.",
      "Add take-profit planning to improve consistency.",
    );
  }

  if (rr === null) {
    addCriterion(
      "riskReward",
      "Risk:Reward Ratio",
      2,
      "R:R unavailable because SL/TP distances are incomplete.",
      "Planned reward justified the risk.",
      `Define both SL and TP to target at least ${profile.minRrAcceptable}:1.`,
    );
  } else if (rr >= profile.minRrStrong) {
    addCriterion(
      "riskReward",
      "Risk:Reward Ratio",
      10,
      `Strong planned R:R at ${round(rr, 2)}:1 for ${profile.style}.`,
      "Planned reward justified the risk.",
      "Maintain high-R:R selection discipline.",
    );
  } else if (rr >= profile.minRrAcceptable) {
    addCriterion(
      "riskReward",
      "Risk:Reward Ratio",
      8,
      `Acceptable planned R:R at ${round(rr, 2)}:1.`,
      "R:R met minimum threshold for your style.",
      "Push slightly better R:R filtering to improve expectancy.",
    );
  } else if (rr >= 0.8) {
    addCriterion(
      "riskReward",
      "Risk:Reward Ratio",
      5,
      `Low planned R:R at ${round(rr, 2)}:1.`,
      "R:R met minimum threshold for your style.",
      "Avoid setups where reward is similar to or smaller than risk.",
    );
  } else {
    addCriterion(
      "riskReward",
      "Risk:Reward Ratio",
      2,
      `Poor planned R:R at ${round(rr, 2)}:1.`,
      "R:R met minimum threshold for your style.",
      "Reject low-R:R setups and wait for asymmetric opportunities.",
    );
  }

  if (rMultiple === null) {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      5,
      "R-Multiple unavailable (trade still open or risk baseline missing).",
      "Achieved strong R-multiple outcomes.",
      "Track closed trades against initial risk to improve expectancy.",
    );
  } else if (rMultiple >= 2) {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      10,
      `Excellent outcome: ${round(rMultiple, 2)}R.`,
      "Captured outsized R-multiple return.",
      "Keep preserving high-R outcomes when market confirms your thesis.",
    );
  } else if (rMultiple >= 1) {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      8,
      `Solid outcome: ${round(rMultiple, 2)}R.`,
      "Delivered positive expectancy in R terms.",
      "Scale winners slightly better to reach 1.5R+ on strong setups.",
    );
  } else if (rMultiple >= 0) {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      6,
      `Small positive outcome: ${round(rMultiple, 2)}R.`,
      "Delivered positive expectancy in R terms.",
      "Let valid winners run to improve realized R.",
    );
  } else if (rMultiple >= -1) {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      3,
      `Loss outcome: ${round(rMultiple, 2)}R.`,
      "Delivered positive expectancy in R terms.",
      "Tighten execution to keep losers at or below -1R.",
    );
  } else {
    addCriterion(
      "rMultiple",
      "R-Multiple",
      0,
      `Oversized loss: ${round(rMultiple, 2)}R.`,
      "Delivered positive expectancy in R terms.",
      "Prevent losses beyond planned risk by honoring SL execution.",
    );
  }

  if (profile.preferredSessions.includes(session)) {
    addCriterion(
      "sessionTiming",
      "Session Timing",
      10,
      `Trade was taken during ${session}, a preferred session for ${profile.style}.`,
      "Entries align with your highest-probability sessions.",
      "Keep prioritizing your best sessions.",
    );
  } else if (session === "Off-hours") {
    addCriterion(
      "sessionTiming",
      "Session Timing",
      3,
      "Trade executed in off-hours where liquidity and follow-through are often weaker.",
      "Entries align with your highest-probability sessions.",
      "Reduce off-hours exposure unless strategy is explicitly designed for it.",
    );
  } else {
    addCriterion(
      "sessionTiming",
      "Session Timing",
      6,
      `Trade executed in ${session}; acceptable but not your strongest window.`,
      "Entries align with your highest-probability sessions.",
      "Concentrate more entries in your top-performing sessions.",
    );
  }

  if (durationSec === null) {
    addCriterion(
      "duration",
      "Duration",
      5,
      "Duration data unavailable.",
      "Holding time matched your style profile.",
      "Capture full open/close timing data for better duration feedback.",
    );
  } else if (
    durationSec >= profile.durationIdealMinSec &&
    durationSec <= profile.durationIdealMaxSec
  ) {
    addCriterion(
      "duration",
      "Duration",
      10,
      "Holding time matched your style profile.",
      "Holding time matched your style profile.",
      "Maintain this hold-time discipline.",
    );
  } else if (
    durationSec >= profile.durationSoftMinSec &&
    durationSec <= profile.durationSoftMaxSec
  ) {
    addCriterion(
      "duration",
      "Duration",
      7,
      "Holding time was acceptable but outside ideal range.",
      "Holding time matched your style profile.",
      "Tighten exits to stay closer to your best hold-time window.",
    );
  } else if (durationSec < profile.durationSoftMinSec) {
    addCriterion(
      "duration",
      "Duration",
      4,
      "Trade was closed too quickly relative to your style baseline.",
      "Holding time matched your style profile.",
      "Avoid premature exits before setup has room to play out.",
    );
  } else {
    addCriterion(
      "duration",
      "Duration",
      4,
      "Trade was held too long relative to your style baseline.",
      "Holding time matched your style profile.",
      "Define invalidation/time-stop rules to avoid overstaying trades.",
    );
  }

  const volume = toNumber(trade.volume, 0);
  if (volume <= 0) {
    addCriterion(
      "positionSizing",
      "Position Sizing",
      2,
      "Volume data is missing or zero.",
      "Position size stayed close to your normal risk unit.",
      "Use consistent position sizing tied to fixed risk per trade.",
    );
  } else if (context.medianVolume <= 0) {
    addCriterion(
      "positionSizing",
      "Position Sizing",
      7,
      "Limited baseline for lot-size comparison.",
      "Position size stayed close to your normal risk unit.",
      "Build a stable lot-size baseline and avoid random jumps.",
    );
  } else {
    const ratio = volume / context.medianVolume;
    if (ratio >= 0.8 && ratio <= 1.25) {
      addCriterion(
        "positionSizing",
        "Position Sizing",
        10,
        "Lot size was highly consistent with your normal sizing.",
        "Position size stayed close to your normal risk unit.",
        "Keep position size aligned with fixed risk.",
      );
    } else if (ratio >= 0.5 && ratio <= 1.8) {
      addCriterion(
        "positionSizing",
        "Position Sizing",
        8,
        "Lot size was within a reasonable variance band.",
        "Position size stayed close to your normal risk unit.",
        "Reduce lot-size variance further to stabilize performance.",
      );
    } else if (ratio >= 0.33 && ratio <= 2.5) {
      addCriterion(
        "positionSizing",
        "Position Sizing",
        5,
        `Lot size deviated significantly (${round(ratio, 2)}x your median size).`,
        "Position size stayed close to your normal risk unit.",
        "Avoid oversized or undersized trades outside your risk model.",
      );
    } else {
      addCriterion(
        "positionSizing",
        "Position Sizing",
        2,
        `Extreme lot-size deviation (${round(ratio, 2)}x your median size).`,
        "Position size stayed close to your normal risk unit.",
        "Return to fixed-risk sizing and cap discretionary size increases.",
      );
    }
  }

  if (!previousClosed) {
    addCriterion(
      "revengeTrade",
      "Revenge Trade Detection",
      8,
      "No immediate prior closed trade to classify revenge behavior.",
      "No revenge-trade pattern detected.",
      "Keep cooldown rules after losses to prevent emotional entries.",
    );
  } else if (isRevengeTrade) {
    const severe = context.medianVolume > 0 && volume > context.medianVolume * 1.5;
    addCriterion(
      "revengeTrade",
      "Revenge Trade Detection",
      severe ? 0 : 2,
      severe
        ? "Loss was followed by rapid re-entry with larger size: strong revenge-trade pattern."
        : "Loss was followed by rapid re-entry: revenge-trade behavior detected.",
      "No revenge-trade pattern detected.",
      "Add a mandatory cooldown after losses before taking the next setup.",
    );
  } else {
    addCriterion(
      "revengeTrade",
      "Revenge Trade Detection",
      10,
      "No revenge-trade pattern detected.",
      "No revenge-trade pattern detected.",
      "Keep emotional reset routines after losing trades.",
    );
  }

  if (dayTradeNumber <= profile.overtradingLimit) {
    addCriterion(
      "overtrading",
      "Overtrading Control",
      10,
      `Trade #${dayTradeNumber} stayed within your daily trade cap.`,
      "Daily trade frequency stayed in control.",
      "Keep the same quality-over-quantity approach.",
    );
  } else if (dayTradeNumber === profile.overtradingLimit + 1) {
    addCriterion(
      "overtrading",
      "Overtrading Control",
      6,
      `Trade #${dayTradeNumber} exceeded your daily cap by one.`,
      "Daily trade frequency stayed in control.",
      "Set a hard stop after reaching your daily trade limit.",
    );
  } else if (dayTradeNumber <= profile.overtradingLimit + 3) {
    addCriterion(
      "overtrading",
      "Overtrading Control",
      3,
      `Trade #${dayTradeNumber} indicates overtrading for this style.`,
      "Daily trade frequency stayed in control.",
      "Reduce daily trade count; quality drops after your optimal limit.",
    );
  } else {
    addCriterion(
      "overtrading",
      "Overtrading Control",
      1,
      `Trade #${dayTradeNumber} is far beyond your style's daily cap.`,
      "Daily trade frequency stayed in control.",
      "Enforce strict daily max-trade rule to avoid tilt and fatigue.",
    );
  }

  if (!trade.isClosed) {
    addCriterion(
      "planExecution",
      "Plan Execution",
      5,
      "Trade still open; final execution quality will be scored on close.",
      "Execution respected the original plan.",
      "Monitor exits versus predefined TP/SL plan.",
    );
  } else if (hasSl && hasTp && rMultiple !== null) {
    if (netPnl > 0) {
      if (rMultiple >= 1.5) {
        addCriterion(
          "planExecution",
          "Plan Execution",
          10,
          "Winner was executed with strong plan capture.",
          "Execution respected the original plan.",
          "Keep following planned exits with minimal discretion.",
        );
      } else if (rMultiple >= 1) {
        addCriterion(
          "planExecution",
          "Plan Execution",
          8,
          "Winner followed plan with decent capture.",
          "Execution respected the original plan.",
          "Improve winner management to capture more planned move.",
        );
      } else {
        addCriterion(
          "planExecution",
          "Plan Execution",
          6,
          "Winner closed early relative to planned potential.",
          "Execution respected the original plan.",
          "Let winners progress further when setup remains valid.",
        );
      }
    } else if (rMultiple >= -1.1) {
      addCriterion(
        "planExecution",
        "Plan Execution",
        8,
        "Loss stayed close to planned risk bounds.",
        "Execution respected the original plan.",
        "Keep loss containment near -1R.",
      );
    } else {
      addCriterion(
        "planExecution",
        "Plan Execution",
        3,
        "Loss exceeded planned risk bounds.",
        "Execution respected the original plan.",
        "Honor SL without delay to avoid outsized losses.",
      );
    }
  } else if (hasSl || hasTp) {
    addCriterion(
      "planExecution",
      "Plan Execution",
      netPnl >= 0 ? 6 : 4,
      "Partial plan definition (only SL or TP) reduced execution clarity.",
      "Execution respected the original plan.",
      "Define complete entry and exit rules before placing order.",
    );
  } else {
    addCriterion(
      "planExecution",
      "Plan Execution",
      netPnl >= 0 ? 5 : 1,
      "No defined SL/TP plan was recorded.",
      "Execution respected the original plan.",
      "Always place structured exits before entering any trade.",
    );
  }

  if (symbolHistory.count < 5 || symbolHistory.winRate === null) {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      6,
      "Not enough historical trades on this symbol for robust confidence.",
      "Traded symbols with proven edge.",
      "Build more samples per symbol before increasing size.",
    );
  } else if (symbolHistory.winRate >= 65) {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      10,
      `Historical edge confirmed on this symbol (${round(symbolHistory.winRate, 1)}% win rate).`,
      "Traded symbols with proven edge.",
      "Keep allocating to symbols where your edge is validated.",
    );
  } else if (symbolHistory.winRate >= 55) {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      8,
      `Solid historical edge on this symbol (${round(symbolHistory.winRate, 1)}% win rate).`,
      "Traded symbols with proven edge.",
      "Continue tracking symbol-specific edge with sample size.",
    );
  } else if (symbolHistory.winRate >= 45) {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      6,
      `Neutral historical edge on this symbol (${round(symbolHistory.winRate, 1)}% win rate).`,
      "Traded symbols with proven edge.",
      "Refine criteria before taking marginal symbols.",
    );
  } else if (symbolHistory.winRate >= 35) {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      4,
      `Weak historical edge on this symbol (${round(symbolHistory.winRate, 1)}% win rate).`,
      "Traded symbols with proven edge.",
      "Lower exposure to weak symbols until strategy is refined.",
    );
  } else {
    addCriterion(
      "symbolExpertise",
      "Symbol Expertise",
      2,
      `Poor historical edge on this symbol (${round(symbolHistory.winRate, 1)}% win rate).`,
      "Traded symbols with proven edge.",
      "Pause this symbol and prioritize pairs where results are stronger.",
    );
  }

  const rawScore = criteria.reduce((sum, item) => sum + item.score, 0);
  const score = round(clamp(rawScore, 0, 100), 1);
  const grade = scoreToGrade(score);

  if (!strengths.length) {
    strengths.push("No major execution edge identified yet; continue logging for stronger signals.");
  }
  if (!improvements.length) {
    improvements.push("No critical weaknesses flagged on this trade.");
  }

  const byKey = new Map<CriterionKey, CriterionResult>(
    criteria.map((item) => [item.key, item]),
  );

  const checks = {
    riskReward:
      byKey.get("riskReward")?.note ||
      "R:R assessment unavailable.",
    timing:
      byKey.get("sessionTiming")?.note ||
      "Session timing assessment unavailable.",
    duration:
      byKey.get("duration")?.note ||
      "Duration assessment unavailable.",
    pnlContext: averagePnlContext(netPnl, context.avgWin, context.avgLoss),
    sizing:
      byKey.get("positionSizing")?.note ||
      "Sizing assessment unavailable.",
    revenge:
      byKey.get("revengeTrade")?.note ||
      "Revenge-trade assessment unavailable.",
    slTpDiscipline:
      byKey.get("riskManagement")?.note ||
      "SL/TP discipline assessment unavailable.",
  };

  const suggestions: string[] = [];
  const addSuggestion = (value: string) => {
    if (!value.trim()) return;
    if (!suggestions.includes(value)) suggestions.push(value);
  };

  if (!trade.reason && !trade.logic) {
    addSuggestion("Journal the setup in one clear sentence so future reviews can separate planned execution from impulse.");
  }
  if ((byKey.get("riskManagement")?.score || 0) <= 5) {
    addSuggestion("Next trade: define invalidation before entry and place the stop where the setup is objectively wrong.");
  }
  if ((byKey.get("riskReward")?.score || 0) <= 5) {
    addSuggestion(`Next trade: do not accept a reward profile below roughly ${profile.minRrAcceptable}:1 unless your journal shows that setup still has positive expectancy.`);
  }
  if ((byKey.get("revengeTrade")?.score || 0) <= 5) {
    addSuggestion("Coaching note: this trade may have been reactive after a loss. Pause, review the prior trade, and only re-enter after a full reset.");
  }
  if ((byKey.get("positionSizing")?.score || 0) <= 5) {
    addSuggestion("Keep size at your baseline unit until execution quality improves. Fix process first, then scale.");
  }
  if ((byKey.get("duration")?.score || 0) <= 5) {
    addSuggestion("Compare this hold time with your winning trades. If you exited early, define one hold or trail rule before the next entry.");
  }
  if ((byKey.get("sessionTiming")?.score || 0) <= 5) {
    addSuggestion(`Review whether ${session} actually fits this setup. If not, wait for the cleaner session instead of forcing activity.`);
  }
  if (score >= 88) {
    addSuggestion("This was one of the cleaner executions. Save the chart and note exactly what made the entry valid so it can become a repeatable model.");
  }
  if (symbolHistory.count > 0 && symbolHistory.winRate !== null && symbolHistory.count < 5) {
    addSuggestion(`There is only a thin history on ${trade.symbol}. Treat the read with caution until you have more tagged samples.`);
  }
  if (!suggestions.length) {
    addSuggestion("No major execution issue stands out on this single trade. Keep logging with the same level of detail so patterns stay visible.");
  }

  return {
    tradeId: trade.id,
    grade,
    score,
    style: profile.style,
    session,
    strengths: strengths.slice(0, 5),
    improvements: improvements.slice(0, 5),
    suggestions: suggestions.slice(0, 4),
    whatWentRight: strengths.slice(0, 3),
    whatWentWrong: improvements.slice(0, 3),
    checks,
    criteria,
    metrics: {
      rrRatio: rr !== null ? round(rr, 2) : null,
      rMultiple: rMultiple !== null ? round(rMultiple, 2) : null,
      durationMinutes: durationMinutes !== null ? round(durationMinutes, 1) : null,
      dayTradeNumber,
      symbolHistoricalWinRate:
        symbolHistory.winRate !== null ? round(symbolHistory.winRate, 1) : null,
      netPnl: round(netPnl, 2),
    },
  };
}

type AnalyzeTradeOptions = {
  trades?: Trade[];
  style?: TradingStyle | string;
};

export function analyzeTrade(trade: Trade, options: AnalyzeTradeOptions = {}): TradeAnalysis {
  const profile = getProfile(options.style);
  const context = buildTradeContext(options.trades?.length ? options.trades : [trade]);
  return analyzeTradeWithContext(trade, context, profile);
}

function buildMonthlyTrend(closedTrades: Trade[]): PortfolioAnalysis["monthlyTrend"] {
  const monthMap = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const trade of closedTrades) {
    const date = tradeCloseDate(trade) || tradeOpenDate(trade);
    if (!date) continue;
    const month = date.toISOString().slice(0, 7);
    const current = monthMap.get(month) || { pnl: 0, trades: 0, wins: 0 };
    const pnl = tradeNetPnl(trade);
    current.pnl += pnl;
    current.trades += 1;
    if (pnl > 0) current.wins += 1;
    monthMap.set(month, current);
  }

  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      pnl: round(value.pnl, 2),
      trades: value.trades,
      winRate: value.trades ? round((value.wins / value.trades) * 100, 1) : 0,
    }));

  let slope = 0;
  const n = months.length;
  if (n >= 2) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
      const x = i;
      const y = months[i]?.pnl ?? 0;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }
    const denominator = n * sumX2 - sumX * sumX;
    slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  }

  const direction: "improving" | "declining" | "flat" =
    slope > 25 ? "improving" : slope < -25 ? "declining" : "flat";

  return { direction, slope: round(slope, 2), months };
}

function calculateMaxDrawdown(closedTrades: Trade[]): number {
  if (closedTrades.length === 0) return 0;
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;  // Track as positive drawdown value
  for (const trade of [...closedTrades].sort(compareByCloseAsc)) {
    running += tradeNetPnl(trade);
    peak = Math.max(peak, running);
    const currentDrawdown = peak - running;  // Drawdown = peak minus current (always positive or zero)
    maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
  }
  return round(-maxDrawdown, 2);  // Return as negative number (loss from peak)
}

function maxConsecutiveLosses(closedTrades: Trade[]): number {
  let streak = 0;
  let maxStreak = 0;
  for (const trade of [...closedTrades].sort(compareByCloseAsc)) {
    if (tradeNetPnl(trade) < 0) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }
  return maxStreak;
}

function profitFactorComponent(profitFactor: number, grossProfit: number, grossLossAbs: number): number {
  if (grossProfit <= 0 && grossLossAbs <= 0) return 0;
  if (grossLossAbs === 0) return 25;
  if (profitFactor >= 2.5) return 25;
  if (profitFactor >= 2.0) return 22;
  if (profitFactor >= 1.5) return 18;
  if (profitFactor >= 1.2) return 14;
  if (profitFactor >= 1.0) return 10;
  if (profitFactor >= 0.8) return 6;
  return 2;
}

type AnalyzePortfolioOptions = {
  style?: TradingStyle | string;
};

export function analyzePortfolio(
  trades: Trade[],
  options: AnalyzePortfolioOptions = {},
): PortfolioAnalysis {
  const profile = getProfile(options.style);
  const scopedTrades = filterTradesByStyle(trades, profile.style);
  const context = buildTradeContext(scopedTrades);
  const tradeAnalyses = scopedTrades.map((trade) =>
    analyzeTradeWithContext(trade, context, profile),
  );

  const closedTrades = context.closedTrades;
  const totalClosed = closedTrades.length;
  const wins = closedTrades.filter((trade) => tradeNetPnl(trade) > 0);
  const losses = closedTrades.filter((trade) => tradeNetPnl(trade) < 0);
  const breakeven = closedTrades.filter((trade) => tradeNetPnl(trade) === 0);

  const grossProfit = wins.reduce((sum, trade) => sum + tradeNetPnl(trade), 0);
  const grossLossAbs = Math.abs(
    losses.reduce((sum, trade) => sum + tradeNetPnl(trade), 0),
  );
  const netProfit = closedTrades.reduce((sum, trade) => sum + tradeNetPnl(trade), 0);
  const winRate = totalClosed > 0 ? (wins.length / totalClosed) * 100 : 0;
  // CONSISTENCY FIX: Use Infinity for no losses (not 9999) to match risk-engine.ts and strategy-edge-engine.ts
  const profitFactor =
    grossLossAbs > 0 ? grossProfit / grossLossAbs : (grossProfit > 0 ? Infinity : 0);
  const maxDrawdown = calculateMaxDrawdown(closedTrades);

  const monthlyTrend = buildMonthlyTrend(closedTrades);

  const winRateScore = round(clamp((winRate / 100) * 25, 0, 25), 1);
  const pfScore = round(
    clamp(profitFactorComponent(profitFactor, grossProfit, grossLossAbs), 0, 25),
    1,
  );

  const slUsagePct =
    trades.length > 0
      ? (trades.filter((trade) => toNumber(trade.stopLoss, 0) > 0).length / trades.length) *
        100
      : 0;
  const tpUsagePct =
    trades.length > 0
      ? (trades.filter((trade) => toNumber(trade.takeProfit, 0) > 0).length / trades.length) *
        100
      : 0;

  const sizingConsistencyPct = (() => {
    const volumes = trades
      .map((trade) => toNumber(trade.volume, 0))
      .filter((value) => value > 0);
    const med = median(volumes);
    if (!volumes.length || med <= 0) return 0;
    const consistent = volumes.filter((value) => {
      const ratio = value / med;
      return ratio >= 0.5 && ratio <= 1.8;
    }).length;
    return (consistent / volumes.length) * 100;
  })();

  let riskScore =
    (slUsagePct * 0.45 + tpUsagePct * 0.2 + sizingConsistencyPct * 0.35) / 4;
  if (maxDrawdown < -2000) riskScore -= 4;
  else if (maxDrawdown < -1000) riskScore -= 2;
  riskScore = round(clamp(riskScore, 0, 25), 1);

  const pnlSeries = closedTrades.map((trade) => tradeNetPnl(trade));
  const avgPnl = average(pnlSeries);
  const avgAbsPnl = average(pnlSeries.map((value) => Math.abs(value)));
  const stdDev = Math.sqrt(
    average(pnlSeries.map((value) => (value - avgPnl) ** 2)),
  );
  const volatilityPenalty =
    avgAbsPnl > 0 ? clamp((stdDev / avgAbsPnl) * 40, 0, 80) : 20;
  const streakPenalty = maxConsecutiveLosses(closedTrades) * 4;
  const trendBonus = monthlyTrend.direction === "improving" ? 8 : 0;
  const consistencyRaw = clamp(100 - volatilityPenalty - streakPenalty + trendBonus, 0, 100);
  const consistencyScore = round(consistencyRaw / 4, 1);

  const performanceScore = round(
    clamp(winRateScore + pfScore + riskScore + consistencyScore, 0, 100),
    1,
  );

  const revengeTrades = tradeAnalyses.filter((analysis) => {
    const criterion = analysis.criteria.find((item) => item.key === "revengeTrade");
    return criterion ? criterion.score <= 3 : false;
  }).length;
  const overtradingDays = Array.from(context.dayTradeCountMap.values()).filter(
    (count) => count > profile.overtradingLimit,
  ).length;
  const cuttingWinners = closedTrades.filter((trade) => {
    const pnl = tradeNetPnl(trade);
    if (pnl <= 0) return false;
    const duration = tradeDurationSec(trade);
    if (!duration) return false;
    return duration < profile.durationIdealMinSec * 0.6;
  }).length;
  const lossAversion =
    context.avgLoss > 0 &&
    context.avgWin > 0 &&
    context.avgLoss > context.avgWin * 1.35 &&
    winRate > 45;

  const psychologicalNotes: string[] = [];
  if (revengeTrades > 0) {
    psychologicalNotes.push(
      `${revengeTrades} trade(s) were entered too quickly after a loss, which signals revenge behavior and reduced decision quality.`,
    );
  } else {
    psychologicalNotes.push("No revenge-trading pattern detected in the reviewed sample.");
  }
  if (overtradingDays > 0) {
    psychologicalNotes.push(
      `${overtradingDays} day(s) exceeded your ${profile.style} trade-frequency threshold; this often lowers setup quality.`,
    );
  }
  if (cuttingWinners > 0) {
    psychologicalNotes.push(
      `${cuttingWinners} winner(s) were exited earlier than your style baseline, limiting payoff.`,
    );
  }
  if (lossAversion) {
    psychologicalNotes.push(
      "Average losses are materially larger than average wins, which indicates a loss-aversion pattern.",
    );
  }

  const sessionsOrder: SessionName[] = [...TRADING_SESSION_ORDER];
  const sessionMap = new Map<SessionName, { pnl: number; trades: number; wins: number }>();
  sessionsOrder.forEach((session) => sessionMap.set(session, { pnl: 0, trades: 0, wins: 0 }));
  for (const trade of closedTrades) {
    const session = tradeSession(trade);
    const current = sessionMap.get(session)!;
    const pnl = tradeNetPnl(trade);
    current.pnl += pnl;
    current.trades += 1;
    if (pnl > 0) current.wins += 1;
  }
  const sessions = sessionsOrder.map((session) => {
    const value = sessionMap.get(session)!;
    return {
      session,
      pnl: round(value.pnl, 2),
      trades: value.trades,
      winRate: value.trades ? round((value.wins / value.trades) * 100, 1) : 0,
    };
  });
  const populatedSessions = sessions.filter((item) => item.trades > 0);
  const bestSession =
    populatedSessions.length > 0
      ? ([...populatedSessions].sort((a, b) => b.pnl - a.pnl)[0]?.session ?? null)
      : null;
  const worstSession =
    populatedSessions.length > 0
      ? ([...populatedSessions].sort((a, b) => a.pnl - b.pnl)[0]?.session ?? null)
      : null;

  const symbolMap = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const trade of closedTrades) {
    const symbol = String(trade.symbol || "").toUpperCase() || "UNKNOWN";
    const current = symbolMap.get(symbol) || { pnl: 0, trades: 0, wins: 0 };
    const pnl = tradeNetPnl(trade);
    current.pnl += pnl;
    current.trades += 1;
    if (pnl > 0) current.wins += 1;
    symbolMap.set(symbol, current);
  }
  const symbolBreakdown = Array.from(symbolMap.entries())
    .map(([symbol, value]) => ({
      symbol,
      pnl: round(value.pnl, 2),
      trades: value.trades,
      winRate: value.trades ? round((value.wins / value.trades) * 100, 1) : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
  const dayMap = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const day of dayNames) dayMap.set(day, { pnl: 0, trades: 0, wins: 0 });
  for (const trade of closedTrades) {
    const open = tradeOpenDate(trade);
    if (!open) continue;
    const day = dayNames[open.getUTCDay()] ?? "Sunday";
    const current = dayMap.get(day);
    if (!current) continue;
    const pnl = tradeNetPnl(trade);
    current.pnl += pnl;
    current.trades += 1;
    if (pnl > 0) current.wins += 1;
  }
  const dayOfWeekPatterns = Array.from(dayMap.entries())
    .filter(([, value]) => value.trades > 0)
    .map(([day, value]) => ({
      day,
      pnl: round(value.pnl, 2),
      trades: value.trades,
      winRate: value.trades ? round((value.wins / value.trades) * 100, 1) : 0,
    }));

  const hourMap = new Map<number, { pnl: number; trades: number; wins: number }>();
  for (let hour = 0; hour < 24; hour++) hourMap.set(hour, { pnl: 0, trades: 0, wins: 0 });
  for (const trade of closedTrades) {
    const open = tradeOpenDate(trade);
    if (!open) continue;
    const hour = open.getUTCHours();
    const current = hourMap.get(hour)!;
    const pnl = tradeNetPnl(trade);
    current.pnl += pnl;
    current.trades += 1;
    if (pnl > 0) current.wins += 1;
  }
  const hourlyAnalysis = Array.from(hourMap.entries())
    .filter(([, value]) => value.trades > 0)
    .map(([hour, value]) => ({
      hour,
      pnl: round(value.pnl, 2),
      trades: value.trades,
      winRate: value.trades ? round((value.wins / value.trades) * 100, 1) : 0,
    }))
    .sort((a, b) => a.hour - b.hour);

  const analysisById = new Map(tradeAnalyses.map((analysis) => [analysis.tradeId, analysis]));
  const revengeLoss = closedTrades
    .filter((trade) => {
      const analysis = analysisById.get(trade.id);
      if (!analysis) return false;
      const criterion = analysis.criteria.find((item) => item.key === "revengeTrade");
      return criterion ? criterion.score <= 3 : false;
    })
    .reduce((sum, trade) => sum + Math.min(0, tradeNetPnl(trade)), 0);
  const overtradeLoss = closedTrades
    .filter((trade) => (context.dayTradeNumberById.get(trade.id) || 0) > profile.overtradingLimit)
    .reduce((sum, trade) => sum + Math.min(0, tradeNetPnl(trade)), 0);
  const poorRrLoss = closedTrades
    .filter((trade) => {
      const analysis = analysisById.get(trade.id);
      if (!analysis) return false;
      const criterion = analysis.criteria.find((item) => item.key === "riskReward");
      return criterion ? criterion.score <= 4 : false;
    })
    .reduce((sum, trade) => sum + Math.min(0, tradeNetPnl(trade)), 0);

  const monthCount = Math.max(1, new Set(monthlyTrend.months.map((item) => item.month)).size);
  const projectedGainTotal =
    Math.abs(revengeLoss) + Math.abs(overtradeLoss) * 0.7 + Math.abs(poorRrLoss) * 0.5;
  const monthlyPnlUplift = round(projectedGainTotal / monthCount, 2);
  const projectedDrivers: string[] = [];
  if (Math.abs(revengeLoss) > 0) {
    projectedDrivers.push(
      `Removing revenge entries could recover approximately $${round(Math.abs(revengeLoss), 2).toFixed(2)} of avoidable losses.`,
    );
  }
  if (Math.abs(overtradeLoss) > 0) {
    projectedDrivers.push(
      `Enforcing a daily trade cap could cut roughly $${round(Math.abs(overtradeLoss), 2).toFixed(2)} in overtrading losses.`,
    );
  }
  if (Math.abs(poorRrLoss) > 0) {
    projectedDrivers.push(
      `Filtering weak R:R setups may improve expectancy by around $${round(Math.abs(poorRrLoss), 2).toFixed(2)}.`,
    );
  }
  if (!projectedDrivers.length) {
    projectedDrivers.push("Current sample shows limited avoidable-loss patterns; continue collecting data for stronger projections.");
  }

  const lowScoreCount = (key: CriterionKey, maxScore: number) =>
    tradeAnalyses.reduce((count, analysis) => {
      const criterion = analysis.criteria.find((item) => item.key === key);
      if (!criterion) return count;
      return criterion.score <= maxScore ? count + 1 : count;
    }, 0);

  const topStrengths: string[] = [];
  if (winRate >= 55) pushUnique(topStrengths, `Win rate is ${round(winRate, 1)}%, which is above the minimum threshold for sustainable performance.`);
  if (profitFactor >= 1.5) pushUnique(topStrengths, `Profit factor is ${round(profitFactor, 2)}, showing that gains are meaningfully outpacing losses.`);
  if (slUsagePct >= 90) pushUnique(topStrengths, `Stop-loss discipline is strong with ${round(slUsagePct, 1)}% SL usage.`);
  if (revengeTrades === 0 && totalClosed >= 10) pushUnique(topStrengths, "No revenge-trading pattern detected in recent history.");
  if (bestSession) pushUnique(topStrengths, `${bestSession} session is your strongest by realized P&L.`);
  if (monthlyTrend.direction === "improving") pushUnique(topStrengths, "Monthly trajectory is improving, indicating better process control.");
  if (symbolBreakdown[0] && symbolBreakdown[0].pnl > 0) {
    pushUnique(topStrengths, `${symbolBreakdown[0].symbol} is your top-performing symbol by net P&L.`);
  }
  if (!topStrengths.length) {
    topStrengths.push("Sample size is still limited; keep logging trades to identify reliable strengths.");
  }

  const topImprovements: string[] = [];
  if (slUsagePct < 85) pushUnique(topImprovements, "Raise stop-loss usage to at least 85% so risk is defined before entry.");
  if (lowScoreCount("riskReward", 5) > 0) {
    pushUnique(topImprovements, "Filter low R:R setups more aggressively and avoid entries below your minimum threshold.");
  }
  if (revengeTrades > 0) pushUnique(topImprovements, "Enforce a strict cooldown after losses to prevent emotional re-entry.");
  if (overtradingDays > 0) pushUnique(topImprovements, `Cap trading to ${profile.overtradingLimit} trades/day for your ${profile.style} profile.`);
  if (cuttingWinners > 0) pushUnique(topImprovements, "Hold valid winners closer to planned targets to improve payoff.");
  if (lossAversion) pushUnique(topImprovements, "Bring average loss size below average win by tightening invalidation discipline.");
  if (monthlyTrend.direction === "declining") pushUnique(topImprovements, "Monthly trend is declining; reduce size and trade only top-quality setups until stability returns.");
  if (worstSession) pushUnique(topImprovements, `Audit mistakes in the ${worstSession} session and reduce exposure there until results improve.`);
  if (!topImprovements.length) {
    topImprovements.push("No major structural weakness detected in the current sample; maintain discipline and consistency.");
  }

  return {
    style: profile.style,
    styleScope: {
      requestedStyle: profile.style,
      matchedTrades: scopedTrades.length,
      totalTrades: trades.length,
      classification: profile.style === "all" ? "all_trades" : "keyword_then_duration",
    },
    generatedAt: new Date().toISOString(),
    performanceScore,
    componentScores: {
      winRate: winRateScore,
      profitFactor: pfScore,
      riskManagement: riskScore,
      consistency: consistencyScore,
    },
    summary: {
      totalTrades: totalClosed,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      winRate: round(winRate, 1),
      profitFactor: round(profitFactor, 2),
      netProfit: round(netProfit, 2),
      maxDrawdown,
    },
    riskManagement: {
      rating: scoreToRiskGrade(riskScore),
      score: riskScore,
      slUsagePct: round(slUsagePct, 1),
      tpUsagePct: round(tpUsagePct, 1),
      sizingConsistencyPct: round(sizingConsistencyPct, 1),
      maxDrawdown,
    },
    psychologicalProfile: {
      revengeTrades,
      overtradingDays,
      cuttingWinners,
      lossAversion,
      notes: psychologicalNotes.slice(0, 5),
    },
    projectedImpact: {
      monthlyPnlUplift,
      drivers: projectedDrivers.slice(0, 5),
    },
    sessionAnalysis: {
      bestSession,
      worstSession,
      sessions,
    },
    symbolBreakdown,
    dayOfWeekPatterns,
    hourlyAnalysis,
    topStrengths: topStrengths.slice(0, 5),
    topImprovements: topImprovements.slice(0, 5),
    monthlyTrend,
    tradeAnalyses,
  };
}
