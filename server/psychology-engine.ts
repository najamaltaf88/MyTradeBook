import type { Trade } from "@shared/schema";

/**
 * Psychology Engine - Detects trader psychology mistakes mathematically
 * Analyzes patterns that indicate emotional decision-making or poor discipline
 */

export interface TraderMistake {
  type: string;
  label: string;
  count: number;
  cost: number;
  instances: MistakeInstance[];
  percentage: number; // percentage of total trades
}

export interface MistakeInstance {
  tradeIds: string[];
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  cost: number;
  timestamp: Date;
}

export interface PsychologyReport {
  totalTrades: number;
  closedTrades: number;
  mistakeCategories: {
    revengeTrading: TraderMistake;
    lossChasing: TraderMistake;
    panicClosing: TraderMistake;
    overtrading: TraderMistake;
    inconsistentRiskSizing: TraderMistake;
  };
  totalMistakeCost: number;
  mistakePercentage: number;
  summary: string;
}

function tradeNetPnl(trade: Trade): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

/**
 * Detect revenge trading: After a loss, immediately opening a larger trade
 * Signature: Loss > threshold, followed within 30 mins by trade with larger risk
 */
function detectRevengeTrading(trades: Trade[]): TraderMistake {
  const instances: MistakeInstance[] = [];
  const sortedTrades = [...trades]
    .filter((t) => t.isClosed && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());
  const closedTradeCount = sortedTrades.length;

  for (let i = 0; i < sortedTrades.length - 1; i++) {
    const currentTrade = sortedTrades[i];
    const nextTrade = sortedTrades[i + 1];
    if (!currentTrade || !nextTrade) continue;
    const currentTradeNet = tradeNetPnl(currentTrade);
    const nextTradeNet = tradeNetPnl(nextTrade);

    if (!nextTrade.openTime || !currentTrade.closeTime) continue;

    // Loss detection
    if (currentTradeNet < -50) {
      const timeDiff = new Date(nextTrade.openTime).getTime() - new Date(currentTrade.closeTime).getTime();
      const thirtyMinsMs = 30 * 60 * 1000;

      // Check if next trade is larger in size or risk
      if (timeDiff < thirtyMinsMs) {
        const currentSize = currentTrade.volume;
        const nextSize = nextTrade.volume;

        // Revenge if size increased by >20% AND occurred within 30 mins of loss
        if (nextSize > currentSize * 1.2) {
          instances.push({
            tradeIds: [currentTrade.id, nextTrade.id],
            severity: currentTradeNet < -200 ? "critical" : "high",
            description: `Loss of $${Math.abs(currentTradeNet).toFixed(2)} followed by ${((nextSize / currentSize - 1) * 100).toFixed(0)}% larger trade within ${(timeDiff / 60000).toFixed(0)} min`,
            cost: Math.abs(currentTradeNet + nextTradeNet),
            timestamp: new Date(nextTrade.openTime),
          });
        }
      }
    }
  }

  const totalCost = instances.reduce((sum, inst) => sum + inst.cost, 0);

  return {
    type: "revengeTrading",
    label: "Revenge Trading",
    count: instances.length,
    cost: totalCost,
    instances,
    percentage: closedTradeCount > 0 ? (instances.length / closedTradeCount) * 100 : 0,
  };
}

/**
 * Detect loss chasing: Multiple losing trades in quick succession
 * Signature: 3+ closed trades within 1 hour, total loss > 100
 */
function detectLossChasing(trades: Trade[]): TraderMistake {
  const instances: MistakeInstance[] = [];
  const sortedTrades = [...trades]
    .filter((t) => t.isClosed && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());

  const oneHourMs = 60 * 60 * 1000;

  for (let i = 0; i < sortedTrades.length; i++) {
    const startTrade = sortedTrades[i];
    if (!startTrade?.closeTime) continue;
    const window: Trade[] = [startTrade];
    let j = i + 1;

    // Collect trades within 1 hour window
    while (j < sortedTrades.length) {
      const candidateTrade = sortedTrades[j];
      if (!candidateTrade?.closeTime) break;
      if (new Date(candidateTrade.closeTime).getTime() - new Date(startTrade.closeTime).getTime() >= oneHourMs) {
        break;
      }
      window.push(candidateTrade);
      j++;
    }

    // Check for loss chasing pattern: 3+ trades, mostly losing
    if (window.length >= 3) {
      const closedWindow = window.filter((t) => t.isClosed);
      const losses = closedWindow.filter((t) => tradeNetPnl(t) < 0);
      const totalLoss = closedWindow.reduce((sum, t) => sum + Math.abs(Math.min(tradeNetPnl(t), 0)), 0);

      // Trigger if: 3+ trades AND >60% are losses AND total loss > $100
      if (losses.length >= 2 && losses.length / closedWindow.length > 0.6 && totalLoss > 100) {
        const lastTrade = window[window.length - 1];
        if (!lastTrade?.closeTime || !window[0]?.closeTime) continue;
        const duration = (new Date(lastTrade.closeTime).getTime() - new Date(window[0].closeTime).getTime()) / 60000;

        instances.push({
          tradeIds: window.map((t) => t.id),
          severity: totalLoss > 300 ? "critical" : totalLoss > 200 ? "high" : "medium",
          description: `${closedWindow.length} trades in ${duration.toFixed(0)} min, ${losses.length} losses, total cost $${totalLoss.toFixed(2)}`,
          cost: totalLoss,
          timestamp: new Date(window[0].closeTime),
        });

        i = j - 1; // Skip past this window
      }
    }
  }

  const totalCost = instances.reduce((sum, inst) => sum + inst.cost, 0);

  return {
    type: "lossChasing",
    label: "Loss Chasing",
    count: instances.length,
    cost: totalCost,
    instances,
    percentage: sortedTrades.length > 0 ? (instances.length * 3 / sortedTrades.length) * 100 : 0,
  };
}

/**
 * Detect panic closing: Closing a profitable trade early, then opening another immediately
 * Signature: Profitable trade closed, immediately followed by new trade within 5 minutes
 */
function detectPanicClosing(trades: Trade[]): TraderMistake {
  const instances: MistakeInstance[] = [];
  const sortedTrades = [...trades]
    .filter((t) => t.isClosed && t.closeTime)
    .sort((a, b) => new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime());

  for (let i = 0; i < sortedTrades.length - 1; i++) {
    const closedTrade = sortedTrades[i];
    const nextTrade = sortedTrades[i + 1];
    if (!closedTrade?.closeTime || !nextTrade?.openTime) continue;
    const closedTradeNet = tradeNetPnl(closedTrade);

    // Check if closed trade was profitable but small, and immediately replaced
    if (closedTradeNet > 0 && closedTradeNet < 100) {
      const closedTradeMaxP = closedTrade.takeProfit ? Math.abs(closedTrade.takeProfit - closedTrade.openPrice) * closedTrade.volume : 1000;
      const actualProfit = closedTradeNet;

      // Panic if closed at <50% of potential TP
      if (actualProfit < closedTradeMaxP * 0.5) {
        const timeDiff = new Date(nextTrade.openTime).getTime() - new Date(closedTrade.closeTime).getTime();
        const fiveMinsMs = 5 * 60 * 1000;

        if (timeDiff < fiveMinsMs) {
          // Check if next trade is a loss (confirming emotional replacement)
          const nextTradeProfit = tradeNetPnl(nextTrade);

          instances.push({
            tradeIds: [closedTrade.id, nextTrade.id],
            severity: nextTradeProfit < -100 ? "critical" : nextTradeProfit < 0 ? "high" : "medium",
            description: `Closed $${closedTradeNet.toFixed(2)} profit early (closed at 50% of TP), replaced in ${(timeDiff / 60000).toFixed(0)} min with ${nextTradeProfit < 0 ? "loss" : "trade"}`,
            cost: Math.max(0, closedTradeMaxP * 0.5 - actualProfit) + Math.abs(Math.min(nextTradeProfit, 0)),
            timestamp: new Date(nextTrade.openTime),
          });
        }
      }
    }
  }

  const totalCost = instances.reduce((sum, inst) => sum + inst.cost, 0);

  return {
    type: "panicClosing",
    label: "Panic Closing",
    count: instances.length,
    cost: totalCost,
    instances,
    percentage: sortedTrades.length > 0 ? (instances.length * 2 / sortedTrades.length) * 100 : 0,
  };
}

/**
 * Detect overtrading: Too many trades in a single day
 * Signature: >5 trades per day, or >10 total
 */
function detectOvertrading(trades: Trade[]): TraderMistake {
  const instances: MistakeInstance[] = [];
  const tradesByDay: { [key: string]: Trade[] } = {};

  trades.forEach((trade) => {
    if (trade.openTime) {
      const day = new Date(trade.openTime).toISOString().split("T")[0] ?? "unknown";
      if (!tradesByDay[day]) tradesByDay[day] = [];
      tradesByDay[day].push(trade);
    }
  });

  Object.entries(tradesByDay).forEach(([day, dayTrades]) => {
    if (dayTrades.length >= 6) {
      const cost = dayTrades.reduce((sum, t) => sum + Math.abs(Math.min(tradeNetPnl(t), 0)), 0);

      instances.push({
        tradeIds: dayTrades.map((t) => t.id),
        severity: dayTrades.length > 10 ? "critical" : dayTrades.length > 8 ? "high" : "medium",
        description: `${dayTrades.length} trades on ${day} (${(dayTrades.filter((t) => tradeNetPnl(t) < 0).length / dayTrades.length * 100).toFixed(0)}% losers)`,
        cost,
        timestamp: new Date(day),
      });
    }
  });

  const totalCost = instances.reduce((sum, inst) => sum + inst.cost, 0);

  return {
    type: "overtrading",
    label: "Overtrading",
    count: instances.length,
    cost: totalCost,
    instances,
    percentage: trades.length > 0 ? (instances.length / Object.keys(tradesByDay).length) * 100 : 0,
  };
}

/**
 * Detect inconsistent risk sizing: Risk varies wildly day-to-day
 * Signature: Risk multiplier > 2.0 (trade risk is 2x average trade risk)
 */
function detectInconsistentRiskSizing(trades: Trade[]): TraderMistake {
  const instances: MistakeInstance[] = [];
  
  // Calculate risk per trade
  const risksPerTrade = trades
    .filter((t) => t.stopLoss && t.openPrice && t.volume)
    .map((t) => ({
      trade: t,
      risk: Math.abs(t.openPrice! - t.stopLoss!) * t.volume,
    }));

  if (risksPerTrade.length < 3) return { type: "inconsistentRiskSizing", label: "Inconsistent Risk Sizing", count: 0, cost: 0, instances: [], percentage: 0 };

  const avgRisk = risksPerTrade.reduce((sum, r) => sum + r.risk, 0) / risksPerTrade.length;
  
  // EDGE CASE FIX: If avgRisk is 0 or nearly 0, skip analysis
  if (avgRisk < 0.01) {
    return { type: "inconsistentRiskSizing", label: "Inconsistent Risk Sizing", count: 0, cost: 0, instances: [], percentage: 0 };
  }
  
  const riskThreshold = avgRisk * 2.0; // 2x average = inconsistent

  risksPerTrade.forEach((r) => {
    if (r.risk > riskThreshold) {
      // Check if this high-risk trade was a loser (confirming bad sizing)
      const tradeCost = Math.abs(Math.min(tradeNetPnl(r.trade), 0));
      const severity = r.risk > avgRisk * 4 ? "critical" : r.risk > avgRisk * 3 ? "high" : "medium";
      
      // EDGE CASE FIX: Use current trade's volume instead of assuming risksPerTrade[0] exists
      const avgRiskPerLot = avgRisk > 0 ? avgRisk / r.trade.volume : 0;

      instances.push({
        tradeIds: [r.trade.id],
        severity,
        description: `Risk $${(r.risk / r.trade.volume).toFixed(0)}/lot vs avg $${avgRiskPerLot.toFixed(0)}/lot (${((r.risk / avgRisk - 1) * 100).toFixed(0)}% over)${tradeCost > 0 ? ` - Lost $${tradeCost.toFixed(2)}` : ""}`,
        cost: tradeCost,
        timestamp: new Date(r.trade.openTime!),
      });
    }
  });

  const totalCost = instances.reduce((sum, inst) => sum + inst.cost, 0);

  return {
    type: "inconsistentRiskSizing",
    label: "Inconsistent Risk Sizing",
    count: instances.length,
    cost: totalCost,
    instances,
    percentage: risksPerTrade.length > 0 ? (instances.length / risksPerTrade.length) * 100 : 0,
  };
}

/**
 * Main analysis function
 */
export function analyzePsychology(trades: Trade[]): PsychologyReport {
  const closedTrades = trades.filter((t) => t.isClosed);

  const revengeTrading = detectRevengeTrading(trades);
  const lossChasing = detectLossChasing(trades);
  const panicClosing = detectPanicClosing(trades);
  const overtrading = detectOvertrading(trades);
  const inconsistentRiskSizing = detectInconsistentRiskSizing(trades);

  const totalMistakeCost =
    revengeTrading.cost +
    lossChasing.cost +
    panicClosing.cost +
    overtrading.cost +
    inconsistentRiskSizing.cost;

  const closedTradeProfit = closedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);
  const mistakePercentage = closedTradeProfit > 0 ? (totalMistakeCost / closedTradeProfit) * 100 : 0;

  // Generate summary
  const activeMistakes = [revengeTrading, lossChasing, panicClosing, overtrading, inconsistentRiskSizing].filter(
    (m) => m.count > 0,
  );

  const summary =
    activeMistakes.length === 0
      ? "No significant psychology issues detected. Trading discipline is strong."
      : `${activeMistakes.map((m) => `${m.label}: ${m.count} instances (cost: $${m.cost.toFixed(2)})`).join(" | ")}`;

  return {
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    mistakeCategories: {
      revengeTrading,
      lossChasing,
      panicClosing,
      overtrading,
      inconsistentRiskSizing,
    },
    totalMistakeCost,
    mistakePercentage,
    summary,
  };
}
