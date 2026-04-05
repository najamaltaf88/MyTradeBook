import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { z } from "zod";
import type { Trade } from "@shared/schema";
import { resolveTradingSessionFromUtcHour } from "@shared/constants";
import {
  analyzePortfolio,
  normalizeTradingStyle,
  type TradingStyle,
} from "./ai-analyzer";
import type { IStorage } from "./storage";

type InsightType =
  | "trading_discipline"
  | "risk_management"
  | "psychology"
  | "strategy_performance";

export interface CoachingInsight {
  type: InsightType;
  message: string;
}

export interface CoachingAnalysisResult {
  generatedAt: string;
  source: "grok" | "algorithmic";
  modelUsed: string;
  fallbackUsed: boolean;
  fromCache: boolean;
  insights: CoachingInsight[];
  recommendations: string[];
}

export type GenerateSuggestionsInput = {
  userId: string;
  trades: Trade[];
  accountId?: string;
  style?: string;
  forceRefresh?: boolean;
};

type NormalizedTrade = {
  id: string;
  is_closed: boolean;
  symbol: string;
  lot_size: number;
  pnl: number;
  rr_ratio: number | null;
  risk_percent: number | null;
  session_tag: string;
  strategy_tag: string | null;
  emotion_tag: string | null;
  trade_duration_minutes: number | null;
  open_time: string | null;
  close_time: string | null;
  discipline_scores: {
    discipline_score: number;
    sl_respected: boolean | null;
    tp_respected: boolean | null;
    revenge_trade: boolean;
  };
};

type Dataset = {
  user_id: string;
  account_id: string | null;
  style: TradingStyle;
  summary: {
    total_trades: number;
    closed_trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    profit_factor: number;
    net_profit: number;
    max_drawdown: number;
  };
  discipline_scores: {
    discipline_score: number;
    sl_respected_pct: number;
    tp_respected_pct: number;
    revenge_trade_count: number;
    overtrading_days: number;
    max_trades_per_day: number;
  };
  psychology_patterns: {
    loss_chasing_score: number;
    overconfidence_score: number;
    panic_exit_score: number;
    sizing_inconsistency_score: number;
    recency_bias_score: number;
  };
  risk_stability_scores: {
    risk_variance: number;
    stability_index: number;
  };
  strategy_performance: {
    by_symbol: Array<{ key: string; trades: number; winRate: number; pnl: number }>;
    by_strategy: Array<{ key: string; trades: number; winRate: number; pnl: number }>;
    by_session: Array<{ session: string; trades: number; winRate: number; pnl: number }>;
  };
  backtests: Array<{
    strategy_name: string;
    win_rate: number;
    max_drawdown: number;
    profit_factor: number;
    expectancy: number;
  }>;
  trades: NormalizedTrade[];
  portfolio: ReturnType<typeof analyzePortfolio>;
};

const MODEL_FALLBACK = "algorithmic-v1";
const GROK_ENDPOINT = process.env.GROK_API_URL || "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = process.env.GROK_MODEL || "grok-2-latest";
const GROK_TIMEOUT_MS = 5000;
const CACHE_LOOKUP_LIMIT = 40;

const AIJsonSchema = z.object({
  insights: z.array(z.object({
    type: z.string().min(1),
    message: z.string().min(1),
  })).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
});

const CachedResultSchema = z.object({
  generatedAt: z.string(),
  source: z.enum(["grok", "algorithmic"]),
  modelUsed: z.string().min(1),
  fallbackUsed: z.boolean(),
  insights: z.array(z.object({
    type: z.enum(["trading_discipline", "risk_management", "psychology", "strategy_performance"]),
    message: z.string().min(1),
  })),
  recommendations: z.array(z.string().min(1)),
});

let cachedEnvApiKey: string | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  if (!values.length) return 0;
  const mean = average(values);
  return average(values.map((value) => (value - mean) ** 2));
}

function stdDev(values: number[]): number {
  return Math.sqrt(variance(values));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const current = sorted[mid] ?? 0;
  const previous = sorted[mid - 1] ?? current;
  return sorted.length % 2 === 0
    ? (previous + current) / 2
    : current;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function openMs(trade: Trade): number {
  const iso = toIso(trade.openTime);
  return iso ? new Date(iso).getTime() : 0;
}

function netPnl(trade: Trade): number {
  return toNumber(trade.profit, 0) + toNumber(trade.commission, 0) + toNumber(trade.swap, 0);
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  for (const item of values) {
    const value = item.trim();
    if (!value) continue;
    if (!out.some((current) => current.toLowerCase() === value.toLowerCase())) {
      out.push(value);
    }
  }
  return out;
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const chunks: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    if (!isRecord(item)) continue;
    if (typeof item.text === "string") {
      chunks.push(item.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const first = content.indexOf("{");
  const last = content.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("AI response did not include valid JSON.");
  }
  return content.slice(first, last + 1);
}

function sanitizeEnvValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function resolveGrokApiKey(): string | undefined {
  if (cachedEnvApiKey !== undefined) {
    return cachedEnvApiKey || undefined;
  }

  const direct = [
    process.env.GROK_API_KEY,
    process.env.GROK_APIKEY,
    process.env.grokAPI_key,
    process.env.XAI_API_KEY,
  ]
    .map((item) => (item ? sanitizeEnvValue(item) : ""))
    .find((item) => Boolean(item));

  if (direct) {
    cachedEnvApiKey = direct;
    return direct;
  }

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    cachedEnvApiKey = null;
    return undefined;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const key of ["GROK_API_KEY", "grokAPI_key", "XAI_API_KEY"]) {
      const regex = new RegExp(`^${key}\\s*[:=]\\s*(.+)$`, "i");
      const match = trimmed.match(regex);
      if (!match?.[1]) continue;
      const value = sanitizeEnvValue(match[1]);
      if (!value) continue;
      cachedEnvApiKey = value;
      return value;
    }
  }

  cachedEnvApiKey = null;
  return undefined;
}

function sessionTag(trade: Trade): string {
  const iso = toIso(trade.openTime);
  if (!iso) return "off_hours";
  const hour = new Date(iso).getUTCHours();
  const session = resolveTradingSessionFromUtcHour(hour);
  switch (session) {
    case "Asian":
      return "asian";
    case "London":
      return "london";
    case "London/NY Overlap":
      return "overlap";
    case "New York":
      return "new_york";
    default:
      return "off_hours";
  }
}

function rrRatio(trade: Trade): number | null {
  const open = toNumber(trade.openPrice, 0);
  const sl = toNumber(trade.stopLoss, 0);
  const tp = toNumber(trade.takeProfit, 0);
  if (!open || !sl || !tp) return null;
  const risk = Math.abs(open - sl);
  const reward = Math.abs(tp - open);
  if (!risk || !reward) return null;
  return round(reward / risk, 2);
}

function durationMinutes(trade: Trade): number | null {
  const explicit = toNumber(trade.duration, 0);
  if (explicit > 0) return round(explicit / 60, 1);
  const open = openMs(trade);
  const close = toIso(trade.closeTime);
  if (!open || !close) return null;
  const closeMs = new Date(close).getTime();
  if (closeMs <= open) return null;
  return round((closeMs - open) / 60000, 1);
}

function strategyTag(trade: Trade): string | null {
  const source = String(trade.logic || trade.reason || trade.comment || "").trim();
  return source ? source.slice(0, 60) : null;
}

function slRespected(trade: Trade, pnl: number): boolean | null {
  if (!trade.isClosed) return null;
  const sl = toNumber(trade.stopLoss, 0);
  const close = toNumber(trade.closePrice, 0);
  if (!sl || !close) return null;
  if (pnl >= 0) return true;
  const tol = 0.0015;
  if (trade.type === "BUY") return close >= sl * (1 - tol);
  return close <= sl * (1 + tol);
}

function tpRespected(trade: Trade, pnl: number): boolean | null {
  if (!trade.isClosed) return null;
  const tp = toNumber(trade.takeProfit, 0);
  const close = toNumber(trade.closePrice, 0);
  if (!tp || !close) return null;
  if (pnl <= 0) return true;
  const tol = 0.0015;
  if (trade.type === "BUY") return close >= tp * (1 - tol);
  return close <= tp * (1 + tol);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AIAnalysisService {
  constructor(private readonly storage: IStorage) {}

  async generateFinalSuggestions(input: GenerateSuggestionsInput): Promise<CoachingAnalysisResult> {
    const style = normalizeTradingStyle(input.style);
    const dataset = this.buildDataset({ ...input, style });
    const cacheKey = this.buildCacheKey(dataset);

    if (!input.forceRefresh) {
      const cached = await this.getCachedResult(input.userId, cacheKey);
      if (cached) return { ...cached, fromCache: true };
    }

    let result: CoachingAnalysisResult;
    try {
      const ai = await this.getAISuggestions(dataset);
      result = {
        generatedAt: new Date().toISOString(),
        source: "grok",
        modelUsed: GROK_MODEL,
        fallbackUsed: false,
        fromCache: false,
        insights: ai.insights,
        recommendations: ai.recommendations,
      };
    } catch {
      const fallback = this.getAlgorithmicSuggestions(dataset);
      result = {
        generatedAt: new Date().toISOString(),
        source: "algorithmic",
        modelUsed: MODEL_FALLBACK,
        fallbackUsed: true,
        fromCache: false,
        insights: fallback.insights,
        recommendations: fallback.recommendations,
      };
    }

    await this.persistAnalysis(input.userId, cacheKey, dataset, result);
    return result;
  }

  async getAISuggestions(dataset: Dataset): Promise<{
    insights: CoachingInsight[];
    recommendations: string[];
  }> {
    const apiKey = resolveGrokApiKey();
    if (!apiKey) {
      throw new Error("Grok API key not configured.");
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.callGrok(apiKey, dataset);
      } catch (error) {
        lastError = error;
        if (attempt < 2) {
          await sleep(250);
          continue;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Grok API failed.");
  }

  getAlgorithmicSuggestions(dataset: Dataset): {
    insights: CoachingInsight[];
    recommendations: string[];
  } {
    const insights: CoachingInsight[] = [];
    const recommendations: string[] = [];
    const addInsight = (type: InsightType, message: string) => {
      if (!message.trim()) return;
      if (insights.some((item) => item.type === type && item.message === message)) return;
      insights.push({ type, message });
    };
    const addRecommendation = (message: string) => {
      if (!message.trim()) return;
      if (recommendations.includes(message)) return;
      recommendations.push(message);
    };

    const closed = dataset.trades.filter((trade) => trade.is_closed);
    const bestStrategy = dataset.strategy_performance.by_strategy
      .filter((item) => item.trades >= 3)
      .sort((a, b) => b.pnl - a.pnl)[0];
    const weakestStrategy = dataset.strategy_performance.by_strategy
      .filter((item) => item.trades >= 3)
      .sort((a, b) => a.pnl - b.pnl)[0];
    const strongestSession = dataset.strategy_performance.by_session
      .filter((item) => item.trades >= 3)
      .sort((a, b) => b.pnl - a.pnl)[0];

    if (dataset.summary.closed_trades < 10) {
      addInsight(
        "strategy_performance",
        `The sample is still small (${dataset.summary.closed_trades} closed trades), so treat any edge reading as provisional rather than proven.`,
      );
      addRecommendation("Keep size steady and keep tagging setups until you have at least 20 closed trades for stronger pattern confidence.");
    }

    for (let i = 3; i < closed.length; i++) {
      const window = closed.slice(i - 3, i);
      const current = closed[i];
      if (!current) continue;
      if (!window.every((trade) => trade.pnl < 0)) continue;
      const avgLot = average(window.map((trade) => trade.lot_size));
      if (avgLot > 0 && current.lot_size > avgLot * 1.2) {
        addInsight(
          "trading_discipline",
          "There is a revenge-trading risk signal here: position size increased after a three-loss streak.",
        );
        addRecommendation("Next session: stop after 2 consecutive losses, review the last setup, and only resume at base size.");
        addRecommendation("After a loss streak, do not allow the next trade to exceed your normal risk until a checklist is completed.");
        break;
      }
    }

    if (dataset.discipline_scores.max_trades_per_day > 10 || dataset.discipline_scores.overtrading_days > 0) {
      addInsight(
        "trading_discipline",
        `Selectivity broke down on at least one day, with as many as ${dataset.discipline_scores.max_trades_per_day} trades taken.`,
      );
      addRecommendation("Set a hard daily trade cap and decide the cut-off before the session opens, not after the account is emotional.");
    }

    if (dataset.discipline_scores.sl_respected_pct < 80) {
      addInsight(
        "trading_discipline",
        `Stop-loss discipline is leaking: SL was respected on only ${dataset.discipline_scores.sl_respected_pct.toFixed(1)}% of evaluable trades.`,
      );
      addRecommendation("Make stop placement part of the entry checklist and ban widening the stop once you are in the trade.");
    }

    if (dataset.discipline_scores.tp_respected_pct < 60) {
      addInsight(
        "trading_discipline",
        `Take-profit execution is inconsistent: TP was respected on ${dataset.discipline_scores.tp_respected_pct.toFixed(1)}% of evaluable trades.`,
      );
      addRecommendation("Write one exit rule for the next session and follow it for every qualified setup instead of improvising mid-trade.");
    }

    if (dataset.risk_stability_scores.risk_variance > 2 || dataset.risk_stability_scores.stability_index < 60) {
      addInsight(
        "risk_management",
        `Risk per trade is unstable (variance ${dataset.risk_stability_scores.risk_variance.toFixed(2)}), which makes the P&L harder to trust.`,
      );
      addRecommendation("Reduce complexity: use one fixed sizing model for the next 20 trades so the journal measures execution instead of random size changes.");
    }

    if (dataset.psychology_patterns.sizing_inconsistency_score >= 35) {
      addInsight(
        "risk_management",
        "Position sizing inconsistency is elevated and likely hurting expectancy.",
      );
      addRecommendation("Use a fixed position-sizing formula for every trade.");
    }

    if (dataset.summary.max_drawdown < -500) {
      addInsight(
        "risk_management",
        `Large drawdown pattern detected (${dataset.summary.max_drawdown.toFixed(2)}).`,
      );
      addRecommendation("Reduce position size during drawdown recovery and focus on A+ setups.");
    }

    if (dataset.psychology_patterns.panic_exit_score >= 35) {
      addInsight(
        "psychology",
        "Winners appear to be cut early relative to your normal winning-trade duration.",
      );
      addRecommendation("Create one objective hold or trail rule for winners so fear does not close the trade before the setup has room to work.");
    }

    if (dataset.psychology_patterns.overconfidence_score >= 35) {
      addInsight(
        "psychology",
        "Confidence appears to expand after win streaks and then bleed into position sizing.",
      );
      addRecommendation("After 3 wins in a row, freeze size at base risk for the next 2 trades to stop hot-hand bias from taking over.");
    }

    if (dataset.psychology_patterns.loss_chasing_score >= 35) {
      addInsight(
        "psychology",
        "There is evidence of loss-chasing after losing trades.",
      );
      addRecommendation("Use a short post-loss reset checklist before any re-entry so the next trade starts from process, not frustration.");
    }

    if (dataset.psychology_patterns.recency_bias_score >= 60) {
      addInsight(
        "psychology",
        "Recent trades are dominating decision weight more than the broader sample.",
      );
      addRecommendation("Before changing strategy rules, review the last 20 trades so one bad week does not rewrite the whole plan.");
    }

    const weakestSymbol = dataset.strategy_performance.by_symbol
      .filter((item) => item.trades >= 3)
      .sort((a, b) => a.pnl - b.pnl)[0];
    if (weakestSymbol && weakestSymbol.pnl < 0) {
      addInsight(
        "strategy_performance",
        `${weakestSymbol.key} is underperforming (${weakestSymbol.trades} trades, ${weakestSymbol.pnl.toFixed(2)} PnL).`,
      );
      addRecommendation(`Reduce exposure to ${weakestSymbol.key} until performance improves.`);
    }

    const weakestSession = dataset.strategy_performance.by_session
      .filter((item) => item.trades >= 3)
      .sort((a, b) => a.pnl - b.pnl)[0];
    if (weakestSession && weakestSession.pnl < 0) {
      addInsight(
        "strategy_performance",
        `${weakestSession.session} session shows weak results (${weakestSession.pnl.toFixed(2)} PnL).`,
      );
      addRecommendation(`Avoid ${weakestSession.session} session until execution quality improves.`);
    }

    if (bestStrategy && bestStrategy.pnl > 0) {
      addInsight(
        "strategy_performance",
        `${bestStrategy.key} is your strongest tagged setup so far (${bestStrategy.trades} trades, ${bestStrategy.winRate.toFixed(1)}% win rate, ${bestStrategy.pnl.toFixed(2)} PnL).`,
      );
      addRecommendation(`Build a stricter checklist around ${bestStrategy.key} and prioritize it before lower-conviction setups.`);
    }

    if (weakestStrategy && weakestStrategy.pnl < 0) {
      addInsight(
        "strategy_performance",
        `${weakestStrategy.key} is dragging results (${weakestStrategy.trades} trades, ${weakestStrategy.winRate.toFixed(1)}% win rate, ${weakestStrategy.pnl.toFixed(2)} PnL).`,
      );
      addRecommendation(`Pause or heavily filter ${weakestStrategy.key} until you can define what invalidates the setup before entry.`);
    }

    if (strongestSession && strongestSession.pnl > 0) {
      addRecommendation(`Protect your edge during ${strongestSession.session}. That session is currently your cleanest profit window.`);
    }

    if (dataset.summary.closed_trades >= 12 && dataset.summary.win_rate >= 55 && dataset.summary.profit_factor >= 1.4) {
      addInsight(
        "strategy_performance",
        `The recent data shows constructive quality: ${dataset.summary.win_rate.toFixed(1)}% win rate with ${dataset.summary.profit_factor.toFixed(2)} profit factor.`,
      );
      addRecommendation("This is improving, but do not rush size. Let the same quality hold for another 20 closed trades before calling it proven.");
    }

    for (const improvement of dataset.portfolio.topImprovements.slice(0, 2)) {
      addRecommendation(improvement);
    }

    for (const strength of dataset.portfolio.topStrengths.slice(0, 2)) {
      addRecommendation(`Keep reinforcing this edge: ${strength}`);
    }

    if (!insights.length) {
      addInsight(
        "strategy_performance",
        "No dominant behavioral weakness stands out in the current sample, but the edge still needs continued review.",
      );
      addRecommendation("Keep journaling every trade and run a weekly review so small drifts are caught before they become expensive habits.");
    }

    return {
      insights: insights.slice(0, 8),
      recommendations: dedupe(recommendations).slice(0, 8),
    };
  }

  private async callGrok(
    apiKey: string,
    dataset: Dataset,
  ): Promise<{ insights: CoachingInsight[]; recommendations: string[] }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT_MS);

    try {
      const response = await fetch(GROK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: "You are a professional trading psychologist and risk manager. Return only strict JSON.",
            },
            {
              role: "user",
              content: this.buildPrompt(dataset),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Grok API failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as unknown;
      if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
        throw new Error("Malformed Grok API response.");
      }

      const first = payload.choices[0];
      if (!isRecord(first) || !isRecord(first.message)) {
        throw new Error("Malformed Grok API message.");
      }
      const content = normalizeContent(first.message.content);
      if (!content) {
        throw new Error("Empty Grok API content.");
      }

      const parsed = JSON.parse(extractJson(content)) as unknown;
      const validated = AIJsonSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error("Invalid Grok JSON schema.");
      }

      const insights = validated.data.insights
        .map((item): CoachingInsight | null => {
          const type = String(item.type || "").trim().toLowerCase();
          const safeType: InsightType =
            type === "trading_discipline" ||
            type === "risk_management" ||
            type === "psychology" ||
            type === "strategy_performance"
              ? (type as InsightType)
              : "strategy_performance";
          const message = item.message.trim();
          if (!message) return null;
          return { type: safeType, message };
        })
        .filter((item): item is CoachingInsight => Boolean(item));

      const recommendations = dedupe(validated.data.recommendations);
      if (!insights.length || !recommendations.length) {
        return this.getAlgorithmicSuggestions(dataset);
      }

      return {
        insights: insights.slice(0, 8),
        recommendations: recommendations.slice(0, 8),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(dataset: Dataset): string {
    const payload = {
      summary: dataset.summary,
      discipline_scores: dataset.discipline_scores,
      psychology_patterns: dataset.psychology_patterns,
      risk_stability_scores: dataset.risk_stability_scores,
      strategy_performance: dataset.strategy_performance,
      backtests: dataset.backtests,
      recent_trades: dataset.trades.slice(-120),
    };

    return [
      "Analyze this trading data and provide advanced personalized coaching suggestions.",
      "Focus on discipline, risk management, psychology, and strategy performance.",
      "Use the numbers in the payload as evidence. Avoid generic filler and avoid praise that is not earned by the data.",
      "Be explicit about uncertainty when the sample is small or inconclusive.",
      "Each insight should explain what is happening, how confident you are, and why it matters.",
      "Recommendations should be actionable, concrete, and written like a coach preparing the next trading session or review drill.",
      "Include a mix of protect-capital advice and exploit-edge advice when the data supports it.",
      "Return strict JSON only in this shape:",
      "{\"insights\":[{\"type\":\"trading_discipline|risk_management|psychology|strategy_performance\",\"message\":\"...\"}],\"recommendations\":[\"...\"]}",
      JSON.stringify(payload),
    ].join("\n");
  }

  private buildDataset(input: GenerateSuggestionsInput & { style: TradingStyle }): Dataset {
    const ordered = [...input.trades].sort((a, b) => openMs(a) - openMs(b));
    const volumes = ordered
      .map((trade) => toNumber(trade.volume, 0))
      .filter((value) => value > 0);
    const medianVolume = median(volumes) || 1;

    const normalized: NormalizedTrade[] = [];
    let prevClosed: NormalizedTrade | null = null;

    for (const trade of ordered) {
      const pnl = round(netPnl(trade), 2);
      const lotSize = toNumber(trade.volume, 0);
      const riskPercent = lotSize > 0
        ? round((lotSize / medianVolume) * 1, 2)
        : null;
      const rr = rrRatio(trade);
      const openIso = toIso(trade.openTime);
      const closeIso = toIso(trade.closeTime);
      const revengeTrade = (() => {
        if (!prevClosed || prevClosed.pnl >= 0) return false;
        if (!openIso || !prevClosed.close_time) return false;
        const openTs = new Date(openIso).getTime();
        const prevCloseTs = new Date(prevClosed.close_time).getTime();
        if (!Number.isFinite(openTs) || !Number.isFinite(prevCloseTs)) return false;
        if (openTs <= prevCloseTs) return false;
        const gapSec = (openTs - prevCloseTs) / 1000;
        return gapSec <= 45 * 60 && lotSize > prevClosed.lot_size * 1.15;
      })();

      const slOk = slRespected(trade, pnl);
      const tpOk = tpRespected(trade, pnl);
      let disciplinePoints = 0;
      if (toNumber(trade.stopLoss, 0) > 0) disciplinePoints += 1;
      if (toNumber(trade.takeProfit, 0) > 0) disciplinePoints += 1;
      if (rr !== null && rr >= 1) disciplinePoints += 1;
      if (slOk !== false) disciplinePoints += 1;
      if (!revengeTrade) disciplinePoints += 1;

      const row: NormalizedTrade = {
        id: trade.id,
        is_closed: Boolean(trade.isClosed),
        symbol: String(trade.symbol || "UNKNOWN").toUpperCase(),
        lot_size: lotSize,
        pnl,
        rr_ratio: rr,
        risk_percent: riskPercent,
        session_tag: sessionTag(trade),
        strategy_tag: strategyTag(trade),
        emotion_tag: trade.emotion ? String(trade.emotion) : null,
        trade_duration_minutes: durationMinutes(trade),
        open_time: openIso,
        close_time: closeIso,
        discipline_scores: {
          discipline_score: round((disciplinePoints / 5) * 100, 1),
          sl_respected: slOk,
          tp_respected: tpOk,
          revenge_trade: revengeTrade,
        },
      };

      normalized.push(row);
      if (row.is_closed) prevClosed = row;
    }

    const portfolio = analyzePortfolio(input.trades, { style: input.style });
    const closed = normalized.filter((trade) => trade.is_closed);
    const wins = closed.filter((trade) => trade.pnl > 0).length;
    const losses = closed.filter((trade) => trade.pnl < 0).length;

    const slEvaluable = normalized.filter((trade) => trade.discipline_scores.sl_respected !== null);
    const tpEvaluable = normalized.filter((trade) => trade.discipline_scores.tp_respected !== null);
    const slOkCount = slEvaluable.filter((trade) => trade.discipline_scores.sl_respected === true).length;
    const tpOkCount = tpEvaluable.filter((trade) => trade.discipline_scores.tp_respected === true).length;

    const tradesPerDay = new Map<string, number>();
    for (const trade of normalized) {
      if (!trade.open_time) continue;
      const day = trade.open_time.slice(0, 10);
      tradesPerDay.set(day, (tradesPerDay.get(day) || 0) + 1);
    }
    const overtradingDays = Array.from(tradesPerDay.values()).filter((count) => count > 10).length;
    const maxTradesPerDay = Math.max(0, ...Array.from(tradesPerDay.values()));

    const riskValues = normalized
      .map((trade) => trade.risk_percent)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const riskVariance = round(variance(riskValues), 2);
    const stabilityIndex = round(clamp(100 - stdDev(riskValues) * 25, 0, 100), 1);

    const lossChasingEvents = (() => {
      let count = 0;
      for (let i = 1; i < closed.length; i++) {
        const previous = closed[i - 1];
        const current = closed[i];
        if (!previous || !current) continue;
        if (previous.pnl < 0 && current.lot_size > previous.lot_size * 1.1) {
          count += 1;
        }
      }
      return count;
    })();
    const overconfidenceEvents = (() => {
      let count = 0;
      for (let i = 3; i < closed.length; i++) {
        const prior = closed.slice(i - 3, i);
        const current = closed[i];
        if (!current) continue;
        if (!prior.every((trade) => trade.pnl > 0)) continue;
        const avgSize = average(prior.map((trade) => trade.lot_size));
        if (current.pnl < 0 && current.lot_size > avgSize * 1.25) {
          count += 1;
        }
      }
      return count;
    })();
    const winnerDurations = closed
      .filter((trade) => trade.pnl > 0 && typeof trade.trade_duration_minutes === "number")
      .map((trade) => trade.trade_duration_minutes as number);
    const medianWinner = median(winnerDurations);
    const panicExitEvents = closed.filter((trade) => {
      if (trade.pnl <= 0 || typeof trade.trade_duration_minutes !== "number") return false;
      if (medianWinner <= 0) return false;
      return trade.trade_duration_minutes < medianWinner * 0.45;
    }).length;

    const recencyBiasScore = (() => {
      if (!normalized.length) return 0;
      const now = Date.now();
      const in7 = normalized.filter((trade) => {
        if (!trade.open_time) return false;
        const ts = new Date(trade.open_time).getTime();
        return now - ts <= 7 * 24 * 60 * 60 * 1000;
      }).length;
      const in30 = normalized.filter((trade) => {
        if (!trade.open_time) return false;
        const ts = new Date(trade.open_time).getTime();
        return now - ts <= 30 * 24 * 60 * 60 * 1000;
      }).length;
      if (!in30) return 0;
      return round(clamp((in7 / in30) * 100, 0, 100), 1);
    })();

    const symbolMap = new Map<string, { trades: number; wins: number; pnl: number }>();
    const strategyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
    for (const trade of closed) {
      const symbolKey = trade.symbol || "UNKNOWN";
      const symbolValue = symbolMap.get(symbolKey) || { trades: 0, wins: 0, pnl: 0 };
      symbolValue.trades += 1;
      symbolValue.pnl += trade.pnl;
      if (trade.pnl > 0) symbolValue.wins += 1;
      symbolMap.set(symbolKey, symbolValue);

      const strategyKey = trade.strategy_tag || "unlabeled";
      const strategyValue = strategyMap.get(strategyKey) || { trades: 0, wins: 0, pnl: 0 };
      strategyValue.trades += 1;
      strategyValue.pnl += trade.pnl;
      if (trade.pnl > 0) strategyValue.wins += 1;
      strategyMap.set(strategyKey, strategyValue);
    }

    const bySymbol = Array.from(symbolMap.entries())
      .map(([key, value]) => ({
        key,
        trades: value.trades,
        winRate: round(value.trades ? (value.wins / value.trades) * 100 : 0, 1),
        pnl: round(value.pnl, 2),
      }))
      .sort((a, b) => b.pnl - a.pnl);

    const byStrategy = Array.from(strategyMap.entries())
      .map(([key, value]) => ({
        key,
        trades: value.trades,
        winRate: round(value.trades ? (value.wins / value.trades) * 100 : 0, 1),
        pnl: round(value.pnl, 2),
      }))
      .sort((a, b) => b.pnl - a.pnl);

    return {
      user_id: input.userId,
      account_id: input.accountId || null,
      style: input.style,
      summary: {
        total_trades: normalized.length,
        closed_trades: closed.length,
        wins,
        losses,
        win_rate: round(portfolio.summary.winRate, 1),
        profit_factor: round(portfolio.summary.profitFactor, 2),
        net_profit: round(portfolio.summary.netProfit, 2),
        max_drawdown: round(portfolio.summary.maxDrawdown, 2),
      },
      discipline_scores: {
        discipline_score: round(average(normalized.map((trade) => trade.discipline_scores.discipline_score)), 1),
        sl_respected_pct: round(slEvaluable.length ? (slOkCount / slEvaluable.length) * 100 : 0, 1),
        tp_respected_pct: round(tpEvaluable.length ? (tpOkCount / tpEvaluable.length) * 100 : 0, 1),
        revenge_trade_count: normalized.filter((trade) => trade.discipline_scores.revenge_trade).length,
        overtrading_days: overtradingDays,
        max_trades_per_day: maxTradesPerDay,
      },
      psychology_patterns: {
        loss_chasing_score: round(clamp((lossChasingEvents / Math.max(1, losses)) * 100, 0, 100), 1),
        overconfidence_score: round(clamp((overconfidenceEvents / Math.max(1, closed.length)) * 300, 0, 100), 1),
        panic_exit_score: round(clamp((panicExitEvents / Math.max(1, wins)) * 100, 0, 100), 1),
        sizing_inconsistency_score: round(
          clamp((stdDev(volumes) / Math.max(0.0001, average(volumes))) * 100, 0, 100),
          1,
        ),
        recency_bias_score: recencyBiasScore,
      },
      risk_stability_scores: {
        risk_variance: riskVariance,
        stability_index: stabilityIndex,
      },
      strategy_performance: {
        by_symbol: bySymbol,
        by_strategy: byStrategy,
        by_session: portfolio.sessionAnalysis.sessions.map((session) => ({
          session: session.session,
          trades: session.trades,
          winRate: round(session.winRate, 1),
          pnl: round(session.pnl, 2),
        })),
      },
      backtests: [],
      trades: normalized,
      portfolio,
    };
  }

  private buildCacheKey(dataset: Dataset): string {
    const fingerprint = {
      user_id: dataset.user_id,
      account_id: dataset.account_id,
      style: dataset.style,
      summary: dataset.summary,
      discipline_scores: dataset.discipline_scores,
      psychology_patterns: dataset.psychology_patterns,
      risk_stability_scores: dataset.risk_stability_scores,
      trades: dataset.trades.map((trade) => ({
        id: trade.id,
        lot_size: trade.lot_size,
        pnl: trade.pnl,
        rr_ratio: trade.rr_ratio,
        risk_percent: trade.risk_percent,
        open_time: trade.open_time,
        close_time: trade.close_time,
      })),
    };
    return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
  }

  private async getCachedResult(
    userId: string,
    cacheKey: string,
  ): Promise<CoachingAnalysisResult | null> {
    const logs = await this.storage.getAiAnalysisLogs(userId, CACHE_LOOKUP_LIMIT);
    for (const log of logs) {
      const raw = String(log.analysisJson || "").trim();
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;
      if (parsed.cacheKey !== cacheKey) continue;
      const validated = CachedResultSchema.safeParse(parsed.result);
      if (!validated.success) continue;
      return {
        ...validated.data,
        fromCache: true,
      };
    }
    return null;
  }

  private async persistAnalysis(
    userId: string,
    cacheKey: string,
    dataset: Dataset,
    result: CoachingAnalysisResult,
  ): Promise<void> {
    const payload = {
      version: 1,
      cacheKey,
      generatedAt: new Date().toISOString(),
      summary: dataset.summary,
      discipline_scores: dataset.discipline_scores,
      psychology_patterns: dataset.psychology_patterns,
      risk_stability_scores: dataset.risk_stability_scores,
      result: {
        generatedAt: result.generatedAt,
        source: result.source,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        insights: result.insights,
        recommendations: result.recommendations,
      },
    };

    try {
      await this.storage.createAiAnalysisLog({
        userId,
        analysisJson: JSON.stringify(payload),
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
      });
    } catch {
      // Never fail user path because of logging.
    }
  }
}
