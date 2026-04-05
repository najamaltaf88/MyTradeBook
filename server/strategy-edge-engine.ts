import type { Trade } from "@shared/schema";
import { getTradingSession } from "@shared/trade-utils";

/**
 * Strategy Edge Engine - Identifies which strategies actually have edge
 * Groups trades by trading strategy and calculates statistical edge
 */

export interface StrategyStatistics {
  strategy: string;
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;

  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;

  totalProfit: number;
  maxProfit: number;
  maxLoss: number;

  // Statistical edge metrics
  edge: number; // Expected return per trade
  edgeConfidence: number; // 0-100, confidence level based on sample size
  sampleSize: number; // number of trades needed for stat significance

  // Session breakdown
  bestSession: string;
  bestSessionWinRate: number;
  worstSession: string;
  worstSessionWinRate: number;

  // Time metrics
  avgDuration: number; // in minutes
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;

  // Recommendation
  recommendation: "STOP" | "REDUCE" | "NEUTRAL" | "INCREASE" | "EXPAND";
  rationale: string;
}

export interface StrategyEdgeReport {
  totalTrades: number;
  strategies: Map<string, StrategyStatistics>;
  strategiesList: StrategyStatistics[];
  bestStrategy: StrategyStatistics | null;
  worstStrategy: StrategyStatistics | null;
  summary: string;
}

/**
 * Calculate win rate with 0 trades handling
 */
function safeWinRate(wins: number, total: number): number {
  return total > 0 ? wins / total : 0;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeNetPnl(trade: Trade): number {
  return toFiniteNumber(trade.profit) + toFiniteNumber(trade.commission) + toFiniteNumber(trade.swap);
}

function sanitizeRatio(value: number): number {
  if (Number.isFinite(value)) return value;
  return value > 0 ? 9999 : 0;
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return "INF";
  return value.toFixed(2);
}

/**
 * Get session name from timestamp
 */
function getSessionName(date: Date): string {
  return getTradingSession(date);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractStrategyName(trade: Trade): string {
  const sources = [trade.logic, trade.reason, trade.comment]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const source of sources) {
    const firstLine = source
      .split(/\r?\n/)
      .map((line) => normalizeWhitespace(line))
      .find(Boolean);

    if (!firstLine) continue;

    const explicitLabel = firstLine.match(/strategy\s*[:=-]\s*(.+)$/i);
    if (explicitLabel?.[1]) {
      return explicitLabel[1].slice(0, 80).trim();
    }

    const firstChunk = firstLine.split(/\s+\|\s+|\s+>\s+|\s+\/\s+/)[0] ?? "";
    const normalized = (firstChunk.split(/\s+-\s+/)[0] ?? "").trim();

    if (normalized.length > 0) {
      return normalized.slice(0, 80);
    }
  }

  return "Unspecified";
}

/**
 * Analyze a single strategy
 */
function analyzeStrategy(trades: Trade[], strategyName: string): StrategyStatistics {
  const closed = trades
    .filter((t) => t.isClosed)
    .sort((a, b) => {
      const aTime = new Date(a.closeTime ?? a.openTime).getTime();
      const bTime = new Date(b.closeTime ?? b.openTime).getTime();
      return aTime - bTime;
    });
  const wins = closed.filter((t) => tradeNetPnl(t) > 0);
  const losses = closed.filter((t) => tradeNetPnl(t) < 0);
  const breakeven = closed.filter((t) => tradeNetPnl(t) === 0);

  const totalProfit = closed.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const totalWinProfit = wins.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const totalLossAbs = Math.abs(losses.reduce((sum, t) => sum + tradeNetPnl(t), 0));

  const winRate = safeWinRate(wins.length, closed.length);
  // EDGE CASE FIX: Handle division by zero - use Infinity for consistent behavior
  const profitFactor = totalLossAbs > 0 ? totalWinProfit / totalLossAbs : (totalWinProfit > 0 ? Infinity : 0);
  const expectancy = closed.length > 0 ? totalProfit / closed.length : 0;

  // EDGE CASE FIX: Properly calculate average loss (should be absolute value of average, not average of absolute values)
  const avgWin = wins.length > 0 ? totalWinProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLossAbs / losses.length : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);
  const safeProfitFactor = sanitizeRatio(profitFactor);
  const safePayoffRatio = sanitizeRatio(payoffRatio);

  // EDGE CASE FIX: Handle empty array case - if no trades, max/min will be just [0]
  const profits = closed.length > 0 ? closed.map((t) => tradeNetPnl(t)) : [0];
  const maxProfit = Math.max(...profits, 0);
  const maxLoss = Math.min(...profits, 0);

  // Calculate edge (expectancy, adjusted for risk)
  // High edge = positive expectancy with good payoff ratio
  const edge = expectancy > 0 && payoffRatio > 1 ? expectancy * Math.min(payoffRatio, 3) : expectancy;

  // Confidence based on sample size
  // Need ~30 trades for statistical significance
  const sampleSize = Math.max(0, 30 - closed.length);
  const confidence = Math.min(100, (closed.length / 30) * 100);

  // Session analysis
  const sessionStats: Map<string, { wins: number; total: number }> = new Map();
  closed.forEach((t) => {
    const session = getSessionName(new Date(t.openTime ?? t.closeTime ?? new Date().toISOString()));
    const stat = sessionStats.get(session) || { wins: 0, total: 0 };
    stat.total++;
    if (tradeNetPnl(t) > 0) stat.wins++;
    sessionStats.set(session, stat);
  });

  let bestSession = "N/A";
  let bestSessionWinRate = 0;
  let worstSession = "N/A";
  let worstSessionWinRate = 0;
  let hasSessionStats = false;

  sessionStats.forEach((stat, session) => {
    hasSessionStats = true;
    const wr = safeWinRate(stat.wins, stat.total);
    if (wr > bestSessionWinRate) {
      bestSession = session;
      bestSessionWinRate = wr;
    }
    if (worstSession === "N/A" || wr < worstSessionWinRate) {
      worstSession = session;
      worstSessionWinRate = wr;
    }
  });

  if (!hasSessionStats) {
    bestSessionWinRate = 0;
    worstSessionWinRate = 0;
  }

  // Duration analysis
  const durations = closed
    .filter((t) => t.duration !== null)
    .map((t) => t.duration || 0)
    .filter((d) => d > 0);
  const avgDuration = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length) / 60 : 0;

  // Consecutive wins/losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentConsecutiveWins = 0;
  let currentConsecutiveLosses = 0;

  closed.forEach((t) => {
    const net = tradeNetPnl(t);
    if (net > 0) {
      currentConsecutiveWins++;
      currentConsecutiveLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentConsecutiveWins);
    } else if (net < 0) {
      currentConsecutiveLosses++;
      currentConsecutiveWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
    }
  });

  // Generate recommendation
  let recommendation: "STOP" | "REDUCE" | "NEUTRAL" | "INCREASE" | "EXPAND";
  let rationale = "";

  if (closed.length < 5) {
    recommendation = "NEUTRAL";
    rationale = `Only ${closed.length} closed trades logged. Keep tagging the setup until you reach at least 5-10 trades.`;
  } else if (edge < -50 || (profitFactor < 0.5 && closed.length > 10)) {
    recommendation = "STOP";
    rationale = `Disable this setup for now. Expectancy is $${edge.toFixed(2)}/trade with weak protection from payoff or win rate.`;
  } else if (profitFactor < 1 || winRate < 0.35) {
    recommendation = "REDUCE";
    rationale = `Reduce size and tighten filters. Profit factor is ${formatRatio(profitFactor)} and win rate is ${(winRate * 100).toFixed(0)}%.`;
  } else if (edge > 0 && profitFactor > 1.5 && confidence > 60) {
    recommendation = "EXPAND";
    rationale = `This setup is proving itself. Edge is $${edge.toFixed(2)}/trade with PF ${formatRatio(profitFactor)} across ${closed.length} closed trades.`;
  } else if (edge > 0 && profitFactor > 1.2) {
    recommendation = "INCREASE";
    rationale = `Positive expectancy is present. Keep trading it with normal size while building a bigger sample.`;
  } else {
    recommendation = "NEUTRAL";
    rationale = "Results are mixed. Keep the setup but only under your cleanest market conditions.";
  }

  return {
    strategy: strategyName,
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,

    winRate,
    profitFactor: safeProfitFactor,
    expectancy,
    avgWin,
    avgLoss,
    payoffRatio: safePayoffRatio,

    totalProfit,
    maxProfit,
    maxLoss,

    edge,
    edgeConfidence: confidence,
    sampleSize,

    bestSession,
    bestSessionWinRate,
    worstSession,
    worstSessionWinRate,

    avgDuration,
    maxConsecutiveLosses,
    maxConsecutiveWins,

    recommendation,
    rationale,
  };
}

/**
 * Main strategy edge analysis
 */
export function analyzeStrategyEdge(trades: Trade[]): StrategyEdgeReport {
  // Group trades by strategy
  const tradesByStrategy: Map<string, Trade[]> = new Map();

  trades.forEach((t) => {
    const strategy = extractStrategyName(t);
    const existing = tradesByStrategy.get(strategy) || [];
    existing.push(t);
    tradesByStrategy.set(strategy, existing);
  });

  // Analyze each strategy
  const strategiesMap = new Map<string, StrategyStatistics>();
  const strategiesList: StrategyStatistics[] = [];

  tradesByStrategy.forEach((tradeList, strategyName) => {
    const stats = analyzeStrategy(tradeList, strategyName);
    strategiesMap.set(strategyName, stats);
    strategiesList.push(stats);
  });

  // Sort by edge
  strategiesList.sort((a, b) => b.edge - a.edge);

  // Find best and worst
  const bestStrategy = strategiesList.at(0) ?? null;
  const worstStrategy = strategiesList.at(-1) ?? null;

  // Generate summary
  const summaryParts = [];
  if (strategiesList.length === 0) {
    summaryParts.push("No strategies tagged. Tag trades with strategy names to enable edge detection.");
  } else if (strategiesList.length === 1) {
    const only = strategiesList[0];
    if (only) {
      summaryParts.push(`Single strategy: ${only.strategy} (${only.recommendation})`);
    }
  } else {
    if (bestStrategy) {
      summaryParts.push(`Best edge: ${bestStrategy.strategy} at $${bestStrategy.edge.toFixed(2)}/trade`);
    }
    if (worstStrategy && worstStrategy.edge < 0) {
      summaryParts.push(`Needs review: ${worstStrategy.strategy} at $${worstStrategy.edge.toFixed(2)}/trade`);
    }

    const profitable = strategiesList.filter((s) => s.expectancy > 0);
    const unprofitable = strategiesList.filter((s) => s.expectancy < 0);
    summaryParts.push(`${profitable.length} profitable, ${unprofitable.length} unprofitable setups tagged`);
  }

  const summary = summaryParts.join(" | ");

  return {
    totalTrades: trades.length,
    strategies: strategiesMap,
    strategiesList,
    bestStrategy,
    worstStrategy,
    summary,
  };
}
