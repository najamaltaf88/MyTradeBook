import type { Trade } from "@shared/schema";

/**
 * Risk Engine - Advanced risk analytics
 * Calculates Sharpe ratio, Kelly percentage, Risk of Ruin, max drawdown recovery
 */

export interface RiskProfile {
  totalTrades: number;
  closedTrades: number;
  totalProfit: number;
  avgTrade: number;
  winRate: number;
  profitFactor: number;
  
  // Risk metrics
  sharpeRatio: number;
  kellyCriterion: number;
  riskOfRuin: number;
  
  // Drawdown metrics
  maxDrawdown: number;
  maxDrawdownRecoveryDays: number;
  currentDrawdown: number;
  
  // Consistency
  riskConsistency: number;
  profitConsistency: number;
  
  // Advanced
  payoffRatio: number;
  expectancy: number;
  winLossRatio: number;
  
  // Recommendations
  recommendedRiskPercent: number;
  riskScore: "A+" | "A" | "B" | "C" | "D" | "F";
  summary: string;
}

interface EquityCurve {
  date: Date;
  balance: number;
  profit: number;
}

function tradeNetPnl(trade: Trade): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

function sanitizeRatio(value: number): number {
  if (Number.isFinite(value)) return value;
  return value > 0 ? 9999 : 0;
}

/**
 * Calculate Sharpe Ratio: (Return - Risk-free rate) / StdDev
 * Using daily returns, assuming 0% risk-free rate for simplicity
 */
function calculateSharpeRatio(trades: Trade[]): number {
  const closedTrades = trades
    .filter((t) => t.isClosed && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());

  if (closedTrades.length < 2) return 0;  // EDGE CASE FIX: Need at least 2 trades

  // Group trades by day
  const dailyReturns: Map<string, number> = new Map();
  closedTrades.forEach((t) => {
    const day = new Date(t.closeTime!).toISOString().split("T")[0] || new Date(t.closeTime!).toISOString();
    const current = dailyReturns.get(day) || 0;
    dailyReturns.set(day, current + tradeNetPnl(t));
  });

  const returns = Array.from(dailyReturns.values());
  if (returns.length < 2) return 0;  // EDGE CASE FIX: Need at least 2 days of data

  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // EDGE CASE FIX: Division by zero - if no volatility, Sharpe is undefined (return 0)
  if (stdDev === 0) return 0;

  // Annualize: multiply by sqrt(252) trading days
  return (meanReturn * 252) / stdDev;
}

/**
 * Calculate Kelly Criterion: (Win% * Avg Win - Loss% * Avg Loss) / Avg Win
 * Tells optimal percent of bankroll to risk per trade
 */
function calculateKellyCriterion(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.isClosed);
  if (closedTrades.length < 3) return 0.02; // Default 2%

  const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
  const losses = closedTrades.filter((t) => tradeNetPnl(t) < 0);

  if (wins.length === 0 || losses.length === 0) return 0.02;

  const winRate = wins.length / closedTrades.length;
  const avgWin = wins.reduce((sum, t) => sum + tradeNetPnl(t), 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((sum, t) => sum + tradeNetPnl(t), 0) / losses.length);

  if (avgWin === 0) return 0.02;

  // Kelly = (WinRate * AvgWin - (1-WinRate) * AvgLoss) / AvgWin
  const kelly = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;

  // Cap at 25% (conservative), minimum 0%
  return Math.max(0, Math.min(kelly, 0.25));
}

/**
 * Calculate Risk of Ruin: probability account goes to zero
 * Uses: (1 - Kelly) / (1 + Kelly) ^ number_of_trades
 * Simplified version
 */
function calculateRiskOfRuin(trades: Trade[], startingBalance: number = 10000): number {
  const closedTrades = trades.filter((t) => t.isClosed);
  if (closedTrades.length < 3) return 0;

  const kelly = calculateKellyCriterion(trades);
  if (kelly === 0) return 0;

  // Simplified: P = ((1-WinRate) / WinRate) ^ NumTrades
  const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
  const winRate = wins.length / closedTrades.length;

  if (winRate >= 0.5) return 0; // Can't go to zero with >50% win rate

  // Current drawdown risk
  const totalProfit = closedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const maxLoss = Math.abs(Math.min(...closedTrades.map((t) => tradeNetPnl(t))));
  const effectiveBalance = startingBalance + totalProfit;
  if (effectiveBalance <= 0) return 0.99;
  const drawdownPercent = maxLoss / effectiveBalance;
  if (drawdownPercent > 0.25) return 0.99; // 99% if lost 25% of account

  // Estimate: (1-WinRate)^factor
  const ror = Math.pow(1 - winRate, Math.min(50, closedTrades.length / 10));
  return Math.min(ror, 0.99);
}

/**
 * Calculate max drawdown and recovery time
 */
function calculateDrawdownMetrics(trades: Trade[]): {
  maxDrawdown: number;
  maxDrawdownRecoveryDays: number;
  currentDrawdown: number;
} {
  const closedTrades = trades
    .filter((t) => t.isClosed && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());

  if (closedTrades.length === 0) {
    return { maxDrawdown: 0, maxDrawdownRecoveryDays: 0, currentDrawdown: 0 };
  }

  // Build equity curve
  let balance = 0;
  const equityCurve: EquityCurve[] = [];

  closedTrades.forEach((t) => {
    const pnl = tradeNetPnl(t);
    balance += pnl;
    equityCurve.push({
      date: new Date(t.closeTime!),
      balance,
      profit: pnl,
    });
  });

  let maxDrawdown = 0;
  let maxDrawdownRecoveryDays = 0;
  const firstPoint = equityCurve[0];
  if (!firstPoint) {
    return { maxDrawdown: 0, maxDrawdownRecoveryDays: 0, currentDrawdown: 0 };
  }
  let peak = firstPoint.balance;
  let peakDate = firstPoint.date;

  for (let i = 1; i < equityCurve.length; i++) {
    const current = equityCurve[i];
    if (!current) continue;

    // Update peak
    if (current.balance > peak) {
      peak = current.balance;
      peakDate = current.date;
    }

    // Calculate drawdown
    const dd = peak - current.balance;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
    }

    // Calculate recovery days
    if (dd > 0) {
      // Find when it recovers past peak
      for (let j = i + 1; j < equityCurve.length; j++) {
        const recoveryPoint = equityCurve[j];
        if (!recoveryPoint) continue;
        if (recoveryPoint.balance >= peak) {
          const recoveryDays = Math.floor((recoveryPoint.date.getTime() - peakDate.getTime()) / (1000 * 60 * 60 * 24));
          maxDrawdownRecoveryDays = Math.max(maxDrawdownRecoveryDays, recoveryDays);
          break;
        }
      }
    }
  }

  // Current drawdown from peak
  const lastBalance = equityCurve[equityCurve.length - 1]?.balance ?? firstPoint.balance;
  const allTimePeak = Math.max(...equityCurve.map((e) => e.balance));
  const currentDrawdown = allTimePeak - lastBalance;

  return {
    maxDrawdown: Math.max(maxDrawdown, 0),
    maxDrawdownRecoveryDays: Math.max(maxDrawdownRecoveryDays, 0),
    currentDrawdown: Math.max(currentDrawdown, 0),
  };
}

/**
 * Calculate standard deviation of returns
 */
function calculateProfitConsistency(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.isClosed);
  if (closedTrades.length < 2) return 0;

  const profits = closedTrades.map((t) => tradeNetPnl(t));
  const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / profits.length;

  return Math.sqrt(variance); // Lower is more consistent
}

/**
 * Calculate consistency of risk sizing
 */
function calculateRiskConsistency(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.stopLoss && t.openPrice);
  if (closedTrades.length < 2) return 100; // Perfect if no trades

  const risks = closedTrades.map((t) => Math.abs(t.openPrice! - t.stopLoss!) * t.volume);
  const mean = risks.reduce((a, b) => a + b, 0) / risks.length;

  if (mean === 0) return 100;

  const cv = (Math.sqrt(risks.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / risks.length) / mean) * 100;

  // Lower CV = more consistent
  // 0% = perfect, 100%+ = very inconsistent
  return Math.max(0, 100 - cv);
}

/**
 * Calculate payoff ratio: Average Win / Average Loss
 */
function calculatePayoffRatio(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.isClosed);
  const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
  const losses = closedTrades.filter((t) => tradeNetPnl(t) < 0);

  if (losses.length === 0) return Infinity;
  if (wins.length === 0) return 0;

  const avgWin = wins.reduce((sum, t) => sum + tradeNetPnl(t), 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((sum, t) => sum + tradeNetPnl(t), 0) / losses.length);

  if (avgLoss === 0) return Infinity;
  return avgWin / avgLoss;
}

/**
 * Calculate expectancy: Average profit per trade
 */
function calculateExpectancy(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.isClosed);
  if (closedTrades.length === 0) return 0;

  return closedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0) / closedTrades.length;
}

/**
 * Main risk analysis
 */
export function analyzeRisk(trades: Trade[], startingBalance: number = 10000): RiskProfile {
  const closedTrades = trades.filter((t) => t.isClosed);
  const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
  const losses = closedTrades.filter((t) => tradeNetPnl(t) < 0);

  const totalProfit = closedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const grossProfit = wins.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const grossLossAbs = Math.abs(losses.reduce((sum, t) => sum + tradeNetPnl(t), 0));

  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0;
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? Infinity : 0;
  const avgTrade = closedTrades.length > 0 ? totalProfit / closedTrades.length : 0;

  const sharpeRatio = calculateSharpeRatio(trades);
  const kellyCriterion = calculateKellyCriterion(trades);
  const riskOfRuin = calculateRiskOfRuin(trades, startingBalance);
  const { maxDrawdown, maxDrawdownRecoveryDays, currentDrawdown } = calculateDrawdownMetrics(trades);

  const profitConsistency = calculateProfitConsistency(trades);
  const riskConsistency = calculateRiskConsistency(trades);

  const payoffRatio = calculatePayoffRatio(trades);
  const expectancy = calculateExpectancy(trades);
  const winLossRatio = losses.length > 0 ? wins.length / losses.length : wins.length > 0 ? Infinity : 0;
  const safeProfitFactor = sanitizeRatio(profitFactor);
  const safePayoffRatio = sanitizeRatio(payoffRatio);
  const safeWinLossRatio = sanitizeRatio(winLossRatio);

  // Determine recommended risk percent
  // Kelly is theoretical max, but practical is 1/4 of Kelly
  const recommendedRiskPercent = Math.max(0.5, Math.min(2, kellyCriterion * 100 * 0.25));

  // Calculate risk score
  let riskScore: "A+" | "A" | "B" | "C" | "D" | "F" = "F";
  // EDGE CASE FIX: Handle edge cases in scoring - maxDrawdown is negative, totalProfit could be negative/zero
  const scoreValue =
    (winRate > 0.5 ? 20 : 0) +
    (profitFactor > 2 && isFinite(profitFactor) ? 20 : profitFactor > 1.5 && isFinite(profitFactor) ? 15 : 0) +
    (sharpeRatio > 2 ? 20 : sharpeRatio > 1 ? 10 : 0) +
    (totalProfit > 0 && Math.abs(maxDrawdown) < totalProfit * 0.2 ? 20 : 10) +
    (riskConsistency > 80 ? 20 : riskConsistency > 60 ? 10 : 0);

  if (scoreValue >= 95) riskScore = "A+";
  else if (scoreValue >= 85) riskScore = "A";
  else if (scoreValue >= 70) riskScore = "B";
  else if (scoreValue >= 55) riskScore = "C";
  else if (scoreValue >= 40) riskScore = "D";
  else riskScore = "F";

  // Generate summary
  const summaryParts: string[] = [];
  if (winRate >= 0.6) summaryParts.push(`Strong win rate: ${(winRate * 100).toFixed(0)}%`);
  else if (winRate < 0.4) summaryParts.push(`Low win rate: ${(winRate * 100).toFixed(0)}%`);

  // EDGE CASE FIX: Handle Infinity profitFactor display
  if (profitFactor > 2) summaryParts.push(`Excellent profit factor: ${isFinite(profitFactor) ? profitFactor.toFixed(2) : "INF"}`);
  else if (profitFactor < 1.5 && isFinite(profitFactor)) summaryParts.push(`Risk: Profit factor below 1.5 (${profitFactor.toFixed(2)})`);

  if (riskOfRuin > 0.3) summaryParts.push(`WARN Risk of Ruin: ${(riskOfRuin * 100).toFixed(1)}%`);

  if (riskConsistency < 60) summaryParts.push(`WARN Inconsistent risk sizing (${riskConsistency.toFixed(0)}%)`);

  const summary = summaryParts.length > 0 ? summaryParts.join(" | ") : "Overall risk profile is balanced";

  return {
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    totalProfit,
    avgTrade,
    winRate,
    profitFactor: safeProfitFactor,

    sharpeRatio,
    kellyCriterion,
    riskOfRuin,

    maxDrawdown,
    maxDrawdownRecoveryDays,
    currentDrawdown,

    riskConsistency,
    profitConsistency,

    payoffRatio: safePayoffRatio,
    expectancy,
    winLossRatio: safeWinLossRatio,

    recommendedRiskPercent,
    riskScore,
    summary,
  };
}


