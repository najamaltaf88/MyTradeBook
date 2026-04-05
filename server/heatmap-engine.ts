/**
 * PERFORMANCE HEATMAP ENGINE
 * Generates visual performance matrices for decision-making
 * Supported heatmaps:
 * - Symbol × Trading Session (which pairs work best in which market)
 * - Symbol × Day of Week (monday effect?)
 * - Trading Session × Day of Week (best trading time combinations)
 * - Hourly win rate (time-of-day patterns)
 */

import { resolveTradingSessionFromUtcHour } from "@shared/constants";
import type { Trade } from "@shared/schema";

export type HeatmapType =
  | "symbol_session"
  | "symbol_dayofweek"
  | "session_dayofweek"
  | "hourly";

export interface HeatmapData {
  key: string; // "EUR_USD-LONDON" or "EUR_USD-FRI"
  trades: number;
  profit: number;
  wins: number;
  losses: number;
  winRate: number;
  avgProfit: number;
  color: string; // Heat color value
  intensity: number; // 0-1 for color intensity
}

export interface HeatmapMetrics {
  type: HeatmapType;
  period: "week" | "month" | "quarter" | "year" | "all";
  data: Map<string, HeatmapData>;
  metadata: {
    totalTrades: number;
    totalProfit: number;
    positiveSetups: number; // Count of green cells
    negativeSetups: number; // Count of red cells
    bestSetup: { key: string; winRate: number };
    worstSetup: { key: string; winRate: number };
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function tradeNetPnl(trade: Trade): number {
  return Number(trade?.profit || 0) + Number(trade?.commission || 0) + Number(trade?.swap || 0);
}

export class HeatmapEngine {
  /**
   * Generate symbol × session heatmap
   * Shows which currency pairs perform best in which trading sessions
   */
  generateSymbolSessionHeatmap(trades: Trade[]): HeatmapMetrics {
    const data = new Map<string, HeatmapData>();

    // Group trades by symbol and session
    const groupedTrades: Record<string, Record<string, Trade[]>> = {};

    trades.forEach((trade) => {
      const symbol = trade.symbol || "UNKNOWN";
      const session = this.getSession(new Date(trade.openTime));

      if (!groupedTrades[symbol]) groupedTrades[symbol] = {};
      if (!groupedTrades[symbol][session]) groupedTrades[symbol][session] = [];
      groupedTrades[symbol][session].push(trade);
    });

    // Calculate metrics for each combination
    const allProfit: number[] = [];
    const allSetups: HeatmapData[] = [];

    Object.entries(groupedTrades).forEach(([symbol, sessions]) => {
      Object.entries(sessions).forEach(([session, sessionTrades]) => {
        const key = `${symbol}-${session}`;
        const wins = sessionTrades.filter((t) => tradeNetPnl(t) > 0).length;
        const losses = sessionTrades.filter((t) => tradeNetPnl(t) < 0).length;
        const totalProfit = sessionTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);

        const heatmapData: HeatmapData = {
          key,
          trades: sessionTrades.length,
          profit: totalProfit,
          wins,
          losses,
          winRate: sessionTrades.length > 0 ? wins / sessionTrades.length : 0,
          avgProfit: sessionTrades.length > 0 ? totalProfit / sessionTrades.length : 0,
          color: this.getHeatColor(totalProfit),
          intensity: this.calculateIntensity(totalProfit),
        };

        data.set(key, heatmapData);
        allProfit.push(totalProfit);
        allSetups.push(heatmapData);
      });
    });

    return {
      type: "symbol_session",
      period: "month",
      data,
      metadata: {
        totalTrades: trades.length,
        totalProfit: allProfit.reduce((a, b) => a + b, 0),
        positiveSetups: allSetups.filter((s) => s.profit > 0).length,
        negativeSetups: allSetups.filter((s) => s.profit < 0).length,
        bestSetup: this.findBestSetup(allSetups),
        worstSetup: this.findWorstSetup(allSetups),
      },
    };
  }

  /**
   * Generate symbol × day of week heatmap
   * Shows which pairs perform best on specific days
   */
  generateSymbolDayHeatmap(trades: Trade[]): HeatmapMetrics {
    const data = new Map<string, HeatmapData>();
    const groupedTrades: Record<string, Record<string, Trade[]>> = {};

    trades.forEach((trade) => {
      const symbol = trade.symbol || "UNKNOWN";
      const day = DAYS[new Date(trade.openTime).getDay()] ?? "Unknown";

      if (!groupedTrades[symbol]) groupedTrades[symbol] = {};
      if (!groupedTrades[symbol][day]) groupedTrades[symbol][day] = [];
      groupedTrades[symbol][day].push(trade);
    });

    const allProfit: number[] = [];
    const allSetups: HeatmapData[] = [];

    Object.entries(groupedTrades).forEach(([symbol, days]) => {
      Object.entries(days).forEach(([day, dayTrades]) => {
        const key = `${symbol}-${day}`;
        const wins = dayTrades.filter((t) => tradeNetPnl(t) > 0).length;
        const losses = dayTrades.filter((t) => tradeNetPnl(t) < 0).length;
        const totalProfit = dayTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);

        const heatmapData: HeatmapData = {
          key,
          trades: dayTrades.length,
          profit: totalProfit,
          wins,
          losses,
          winRate: dayTrades.length > 0 ? wins / dayTrades.length : 0,
          avgProfit: dayTrades.length > 0 ? totalProfit / dayTrades.length : 0,
          color: this.getHeatColor(totalProfit),
          intensity: this.calculateIntensity(totalProfit),
        };

        data.set(key, heatmapData);
        allProfit.push(totalProfit);
        allSetups.push(heatmapData);
      });
    });

    return {
      type: "symbol_dayofweek",
      period: "month",
      data,
      metadata: {
        totalTrades: trades.length,
        totalProfit: allProfit.reduce((a, b) => a + b, 0),
        positiveSetups: allSetups.filter((s) => s.profit > 0).length,
        negativeSetups: allSetups.filter((s) => s.profit < 0).length,
        bestSetup: this.findBestSetup(allSetups),
        worstSetup: this.findWorstSetup(allSetups),
      },
    };
  }

  /**
   * Generate hourly win rate heatmap
   * Shows performance by hour of day
   */
  generateHourlyHeatmap(trades: Trade[]): HeatmapMetrics {
    const data = new Map<string, HeatmapData>();
    const hourlyData: Record<number, Trade[]> = {};

    // Initialize all hours
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = [];
    }

    // Group trades by hour
    trades.forEach((trade) => {
      const hour = new Date(trade.openTime).getHours();
      const bucket = hourlyData[hour];
      if (bucket) {
        bucket.push(trade);
      }
    });

    const allProfit: number[] = [];
    const allSetups: HeatmapData[] = [];

    // Calculate metrics for each hour
    Object.entries(hourlyData).forEach(([hour, hourTrades]: [string, Trade[]]) => {
      const hourNum = parseInt(hour);
      const key = `${hourNum.toString().padStart(2, "0")}:00`;
      
      if (hourTrades.length === 0) return;

      const wins = hourTrades.filter((t) => tradeNetPnl(t) > 0).length;
      const losses = hourTrades.filter((t) => tradeNetPnl(t) < 0).length;
      const totalProfit = hourTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);

      const heatmapData: HeatmapData = {
        key,
        trades: hourTrades.length,
        profit: totalProfit,
        wins,
        losses,
        winRate: wins / hourTrades.length,
        avgProfit: totalProfit / hourTrades.length,
        color: this.getHeatColor(totalProfit),
        intensity: this.calculateIntensity(totalProfit),
      };

      data.set(key, heatmapData);
      allProfit.push(totalProfit);
      allSetups.push(heatmapData);
    });

    return {
      type: "hourly",
      period: "month",
      data,
      metadata: {
        totalTrades: trades.length,
        totalProfit: allProfit.reduce((a, b) => a + b, 0),
        positiveSetups: allSetups.filter((s) => s.profit > 0).length,
        negativeSetups: allSetups.filter((s) => s.profit < 0).length,
        bestSetup: this.findBestSetup(allSetups),
        worstSetup: this.findWorstSetup(allSetups),
      },
    };
  }

  /**
   * Get trading session from trade time
   */
  private getSession(date: Date): string {
    return resolveTradingSessionFromUtcHour(date.getUTCHours());
  }

  /**
   * Convert profit to heat color (red to green)
   */
  private getHeatColor(profit: number): string {
    if (profit > 0) {
      return profit > 1000 ? "#27ae60" : profit > 100 ? "#52be80" : "#abebc6";
    } else if (profit < 0) {
      return Math.abs(profit) > 1000 ? "#c0392b" : Math.abs(profit) > 100 ? "#e74c3c" : "#f5b7b1";
    }
    return "#ecf0f1"; // Gray for break even
  }

  /**
   * Calculate color intensity (0-1)
   */
  private calculateIntensity(profit: number): number {
    const maxProfit = 5000; // Normalize to typical profit
    return Math.min(Math.abs(profit) / maxProfit, 1);
  }

  /**
   * Find best performing setup
   */
  private findBestSetup(setups: HeatmapData[]) {
    if (setups.length === 0) return { key: "N/A", winRate: 0 };
    return setups.reduce((best, setup) =>
      setup.winRate > best.winRate ? setup : best
    );
  }

  /**
   * Find worst performing setup
   */
  private findWorstSetup(setups: HeatmapData[]) {
    if (setups.length === 0) return { key: "N/A", winRate: 1 };
    return setups.reduce((worst, setup) =>
      setup.winRate < worst.winRate ? setup : worst
    );
  }

  /**
   * Generate insights from heatmaps
   */
  generateInsights(heatmaps: HeatmapMetrics[]): string[] {
    const insights: string[] = [];

    heatmaps.forEach((heatmap) => {
      const { bestSetup, worstSetup, positiveSetups, negativeSetups } = heatmap.metadata;

      if (bestSetup.winRate > 0.6) {
        insights.push(
          `Focus on ${bestSetup.key} - ${(bestSetup.winRate * 100).toFixed(1)}% win rate`
        );
      }

      if (worstSetup.winRate < 0.4) {
        insights.push(`Avoid ${worstSetup.key} - only ${(worstSetup.winRate * 100).toFixed(1)}% win rate`);
      }

      if (positiveSetups > negativeSetups * 1.5) {
        insights.push("Strong overall pattern consistency - continue current approach");
      }
    });

    return insights;
  }
}

export default HeatmapEngine;
