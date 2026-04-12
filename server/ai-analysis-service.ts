import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { z } from "zod";
import type { Trade } from "@shared/schema";
import { resolveTradingSessionFromUtcHour } from "@shared/constants";
import {
  analyzePortfolio,
  filterTradesByStyle,
  normalizeTradingStyle,
  type TradingStyle,
} from "./ai-analyzer";
import type { IStorage } from "./storage";
import { Logger } from "./logging";

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
  source: "grok" | "gemini" | "algorithmic";
  modelUsed: string;
  fallbackUsed: boolean;
  fromCache: boolean;
  mentorSummary: string;
  priorityFocus: string;
  insights: CoachingInsight[];
  recommendations: string[];
  sessionPlan: string[];
  reviewChecklist: string[];
  providerMessage?: string;
}

export type GenerateSuggestionsInput = {
  userId: string;
  trades: Trade[];
  accountId?: string;
  style?: string;
  provider?: "grok" | "gemini";
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
  style_scope: {
    matched_trades: number;
    total_trades: number;
  };
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
const GROK_MODEL = process.env.GROK_MODEL || "grok-4";
const GROK_TIMEOUT_MS = 45000;
const GEMINI_ENDPOINT = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 45000;
const CACHE_LOOKUP_LIMIT = 40;

const AIJsonSchema = z.object({
  mentorSummary: z.string().min(1),
  priorityFocus: z.string().min(1),
  insights: z.array(z.object({
    type: z.string().min(1),
    message: z.string().min(1),
  })).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
  sessionPlan: z.array(z.string().min(1)).default([]),
  reviewChecklist: z.array(z.string().min(1)).default([]),
});

const CachedResultSchema = z.object({
  generatedAt: z.string(),
  source: z.enum(["grok", "gemini", "algorithmic"]),
  modelUsed: z.string().min(1),
  fallbackUsed: z.boolean(),
  mentorSummary: z.string().min(1),
  priorityFocus: z.string().min(1),
  insights: z.array(z.object({
    type: z.enum(["trading_discipline", "risk_management", "psychology", "strategy_performance"]),
    message: z.string().min(1),
  })),
  recommendations: z.array(z.string().min(1)),
  sessionPlan: z.array(z.string().min(1)).default([]),
  reviewChecklist: z.array(z.string().min(1)).default([]),
  providerMessage: z.string().optional(),
});

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

function formatPromptNumber(value: number | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return round(value, digits).toString();
}

function formatPromptFlag(value: boolean | null): string {
  if (value === null) return "none";
  return value ? "✓" : "✗";
}

function formatPromptResult(pnl: number): "WIN" | "LOSS" | "BE" {
  if (pnl > 0) return "WIN";
  if (pnl < 0) return "LOSS";
  return "BE";
}

function formatTradePromptLine(trade: NormalizedTrade, index: number): string {
  return [
    `T${index + 1}: ${trade.symbol}`,
    `status ${trade.is_closed ? "closed" : "open"}`,
    `result ${formatPromptResult(trade.pnl)}`,
    `lot ${formatPromptNumber(trade.lot_size, 2)}`,
    `RR ${formatPromptNumber(trade.rr_ratio, 2)}`,
    `SL ${formatPromptFlagLabel(trade.discipline_scores.sl_respected)}`,
    `TP ${formatPromptFlagLabel(trade.discipline_scores.tp_respected)}`,
    `strategy ${trade.strategy_tag || "none"}`,
    `emotion ${trade.emotion_tag || "none"}`,
    `duration ${formatPromptNumber(trade.trade_duration_minutes, 1)}m`,
    `revenge ${trade.discipline_scores.revenge_trade ? "FLAG" : "clear"}`,
  ].join(" | ");
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

function findNearestEnvPath(): string | undefined {
  const explicitCandidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.MYTRADEBOOK_ENV_PATH,
    path.join(process.cwd(), ".env"),
    path.join(path.dirname(process.execPath || ""), ".env"),
    path.join(process.resourcesPath || "", ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const envPath of explicitCandidates) {
    if (fs.existsSync(envPath)) return envPath;
  }

  let currentDir = process.cwd();
  while (true) {
    const envPath = path.join(currentDir, ".env");
    if (fs.existsSync(envPath)) return envPath;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return undefined;
}

function resolveGrokApiKey(): string | undefined {
  const direct = [
    process.env.GROK_API_KEY,
    process.env.GROK_APIKEY,
    process.env.grokAPI_key,
    process.env.XAI_API_KEY,
  ]
    .map((item) => (item ? sanitizeEnvValue(item) : ""))
    .find((item) => Boolean(item));

  if (direct) {
    return direct;
  }

  const envPath = findNearestEnvPath();
  if (!envPath) {
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
      return value;
    }
  }

  return undefined;
}

function resolveGeminiApiKey(): string | undefined {
  const direct = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
  ]
    .map((item) => (item ? sanitizeEnvValue(item) : ""))
    .find((item) => Boolean(item));

  if (direct) {
    return direct;
  }

  const envPath = findNearestEnvPath();
  if (!envPath) {
    return undefined;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const key of ["GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
      const regex = new RegExp(`^${key}\\s*[:=]\\s*(.+)$`, "i");
      const match = trimmed.match(regex);
      if (!match?.[1]) continue;
      const value = sanitizeEnvValue(match[1]);
      if (!value) continue;
      return value;
    }
  }

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

function formatPromptFlagLabel(value: boolean | null): string {
  if (value === null) return "none";
  return value ? "yes" : "no";
}

function sanitizeProviderMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown AI provider error");
  const sanitized = message
    .replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/Incorrect API key provided:\s*[^.]+/i, "Incorrect API key provided");

  if (/API key not configured/i.test(sanitized)) {
    return "AI provider is unavailable because its API key is not configured. Internal coaching fallback is being used.";
  }

  return sanitized;
}

export class AIAnalysisService {
  constructor(private readonly storage: IStorage) {}

  async generateFinalSuggestions(input: GenerateSuggestionsInput): Promise<CoachingAnalysisResult> {
    const style = normalizeTradingStyle(input.style);
    const provider = input.provider === "gemini" ? "gemini" : "grok";
    const dataset = this.buildDataset({ ...input, style });
    const cacheKey = this.buildCacheKey(dataset, provider);

    if (!input.forceRefresh) {
      const cached = await this.getCachedResult(input.userId, cacheKey, provider);
      if (cached) return { ...cached, fromCache: true };
    }

    let result: CoachingAnalysisResult;
    try {
      const ai = await this.getAISuggestions(dataset, provider);
      result = {
        generatedAt: new Date().toISOString(),
        source: provider,
        modelUsed: provider === "gemini" ? GEMINI_MODEL : GROK_MODEL,
        fallbackUsed: false,
        fromCache: false,
        mentorSummary: ai.mentorSummary,
        priorityFocus: ai.priorityFocus,
        insights: ai.insights,
        recommendations: ai.recommendations,
        sessionPlan: ai.sessionPlan,
        reviewChecklist: ai.reviewChecklist,
      };
    } catch (error) {
      const providerMessage = sanitizeProviderMessage(error);
      Logger.logAi(`${provider}_provider_failed`, "error", input.userId, providerMessage);
      const fallback = this.getAlgorithmicSuggestions(dataset);
      result = {
        generatedAt: new Date().toISOString(),
        source: "algorithmic",
        modelUsed: MODEL_FALLBACK,
        fallbackUsed: true,
        fromCache: false,
        mentorSummary: fallback.mentorSummary,
        priorityFocus: fallback.priorityFocus,
        insights: fallback.insights,
        recommendations: fallback.recommendations,
        sessionPlan: fallback.sessionPlan,
        reviewChecklist: fallback.reviewChecklist,
        providerMessage,
      };
    }

    await this.persistAnalysis(input.userId, cacheKey, dataset, result);
    return result;
  }

  async getAISuggestions(dataset: Dataset, provider: "grok" | "gemini"): Promise<{
    mentorSummary: string;
    priorityFocus: string;
    insights: CoachingInsight[];
    recommendations: string[];
    sessionPlan: string[];
    reviewChecklist: string[];
  }> {
    const apiKey = provider === "gemini" ? resolveGeminiApiKey() : resolveGrokApiKey();
    if (!apiKey) {
      throw new Error(`${provider === "gemini" ? "Gemini" : "Grok"} API key not configured.`);
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return provider === "gemini"
          ? await this.callGemini(apiKey, dataset)
          : await this.callGrok(apiKey, dataset);
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
      : new Error(`${provider === "gemini" ? "Gemini" : "Grok"} API failed.`);
  }

  getAlgorithmicSuggestions(dataset: Dataset): {
    mentorSummary: string;
    priorityFocus: string;
    insights: CoachingInsight[];
    recommendations: string[];
    sessionPlan: string[];
    reviewChecklist: string[];
  } {
    const insights: CoachingInsight[] = [];
    const recommendations: string[] = [];
    const sessionPlan: string[] = [];
    const reviewChecklist: string[] = [];
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
    const addSessionPlan = (message: string) => {
      if (!message.trim()) return;
      if (sessionPlan.includes(message)) return;
      sessionPlan.push(message);
    };
    const addReviewCheck = (message: string) => {
      if (!message.trim()) return;
      if (reviewChecklist.includes(message)) return;
      reviewChecklist.push(message);
    };

    const closed = dataset.trades.filter((trade) => trade.is_closed);
    const last20Closed = closed.slice(-20);
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
      addReviewCheck("Do not change the strategy based on this sample alone. Build a bigger style-specific sample first.");
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
        addSessionPlan("If two losses happen back-to-back, stop live execution and switch to review mode for 15 minutes.");
        break;
      }
    }

    if (dataset.discipline_scores.max_trades_per_day > 10 || dataset.discipline_scores.overtrading_days > 0) {
      addInsight(
        "trading_discipline",
        `Selectivity broke down on at least one day, with as many as ${dataset.discipline_scores.max_trades_per_day} trades taken.`,
      );
      addRecommendation("Set a hard daily trade cap and decide the cut-off before the session opens, not after the account is emotional.");
      addSessionPlan(`Respect the ${dataset.style} trade-frequency cap before the session begins.`);
    }

    if (dataset.discipline_scores.sl_respected_pct < 80) {
      addInsight(
        "trading_discipline",
        `Stop-loss discipline is leaking: SL was respected on only ${dataset.discipline_scores.sl_respected_pct.toFixed(1)}% of evaluable trades.`,
      );
      addRecommendation("Make stop placement part of the entry checklist and ban widening the stop once you are in the trade.");
      addReviewCheck("Mark every trade where the stop was moved, widened, or missing.");
    }

    if (dataset.discipline_scores.tp_respected_pct < 60) {
      addInsight(
        "trading_discipline",
        `Take-profit execution is inconsistent: TP was respected on ${dataset.discipline_scores.tp_respected_pct.toFixed(1)}% of evaluable trades.`,
      );
      addRecommendation("Write one exit rule for the next session and follow it for every qualified setup instead of improvising mid-trade.");
      addReviewCheck("Compare actual exits against planned TP or management rule for the next 10 trades.");
    }

    if (dataset.risk_stability_scores.risk_variance > 2 || dataset.risk_stability_scores.stability_index < 60) {
      addInsight(
        "risk_management",
        `Risk per trade is unstable (variance ${dataset.risk_stability_scores.risk_variance.toFixed(2)}), which makes the P&L harder to trust.`,
      );
      addRecommendation("Reduce complexity: use one fixed sizing model for the next 20 trades so the journal measures execution instead of random size changes.");
      addSessionPlan("Lock one position-sizing formula for the next review cycle. No discretionary size changes.");
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
      addSessionPlan("Trade reduced size until drawdown stabilizes and one clean week of execution is logged.");
    }

    if (dataset.psychology_patterns.panic_exit_score >= 35) {
      addInsight(
        "psychology",
        "Winners appear to be cut early relative to your normal winning-trade duration.",
      );
      addRecommendation("Create one objective hold or trail rule for winners so fear does not close the trade before the setup has room to work.");
      addReviewCheck("Review the last winners and mark which ones were closed before the plan was fully invalidated.");
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
      addSessionPlan("After a losing trade, write the next setup before taking it. No instant revenge entries.");
    }

    if (dataset.psychology_patterns.recency_bias_score >= 60) {
      addInsight(
        "psychology",
        "Recent trades are dominating decision weight more than the broader sample.",
      );
      addRecommendation("Before changing strategy rules, review the last 20 trades so one bad week does not rewrite the whole plan.");
      addReviewCheck("Anchor decisions to the last 20 style-matched trades, not the last 2 or 3 outcomes.");
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
      addSessionPlan(`Lead the next session with ${bestStrategy.key} only if the exact checklist is present.`);
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

    const emotionalLosses = last20Closed.filter((trade) => trade.pnl < 0 && trade.emotion_tag);
    if (emotionalLosses.length >= 2) {
      const emotions = dedupe(
        emotionalLosses
          .map((trade) => trade.emotion_tag || "")
          .filter(Boolean),
      );
      addInsight(
        "psychology",
        `In the last 20 closed trades, ${emotionalLosses.length} losing trades were tagged with emotion: ${emotions.join(", ")}. That suggests emotional state is showing up directly in the losses.`,
      );
      addRecommendation("If you notice an emotional state before entry, pause the trade and complete a reset before placing any order.");
    }

    const noSlClosedTrades = closed.filter(
      (trade) => trade.is_closed && trade.discipline_scores.sl_respected === null,
    );
    if (noSlClosedTrades.length > 0) {
      addInsight(
        "trading_discipline",
        `${noSlClosedTrades.length} closed trades had no measurable stop-loss protection set. That removes one of the core discipline controls in the journal.`,
      );
      addRecommendation("Make a hard rule that every trade must have a stop loss defined before entry, with no exceptions.");
    }

    const weakStrategies = dataset.strategy_performance.by_strategy
      .filter((item) => item.trades >= 2 && item.winRate < 35 && item.pnl < 0)
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 2);
    for (const strategy of weakStrategies) {
      addInsight(
        "strategy_performance",
        `${strategy.key} is currently a weak setup: ${strategy.trades} trades, ${strategy.winRate.toFixed(1)}% win rate, ${strategy.pnl.toFixed(2)} PnL.`,
      );
      addRecommendation(`Stop trading ${strategy.key} for now until you can define a better entry trigger for that setup.`);
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

    if (dataset.style_scope.matched_trades === 0) {
      addInsight(
        "strategy_performance",
        `No trades in the current dataset were classified as ${dataset.style}. Add more ${dataset.style} examples or check trade durations/tags.`,
      );
      addRecommendation(`Log or import more ${dataset.style} trades so the mentor can analyze the correct style bucket.`);
      addReviewCheck("Confirm trade duration and notes are accurate so style classification stays reliable.");
    }

    const mentorSummary =
      dataset.style_scope.matched_trades === 0
        ? `No ${dataset.style} trades matched the current dataset, so the coach cannot make a reliable style-specific read yet.`
        : `Mentor read: ${dataset.style} style shows ${dataset.summary.win_rate.toFixed(1)}% win rate across ${dataset.summary.closed_trades} closed trades. The priority is to protect capital first, then reinforce the strongest repeatable edge.`;

    const priorityFocus =
      recommendations[0] ||
      `Stay disciplined inside the ${dataset.style} bucket and only review style-matched trades before changing rules.`;

    if (!sessionPlan.length) {
      addSessionPlan("Take only setups that fully match your checklist and base risk model.");
    }
    if (!reviewChecklist.length) {
      addReviewCheck("Review whether entry, stop, and exit all matched the written plan.");
    }

    return {
      mentorSummary,
      priorityFocus,
      insights: insights.slice(0, 8),
      recommendations: dedupe(recommendations).slice(0, 8),
      sessionPlan: dedupe(sessionPlan).slice(0, 5),
      reviewChecklist: dedupe(reviewChecklist).slice(0, 5),
    };
  }

  private async callGrok(
    apiKey: string,
    dataset: Dataset,
  ): Promise<{
    mentorSummary: string;
    priorityFocus: string;
    insights: CoachingInsight[];
    recommendations: string[];
    sessionPlan: string[];
    reviewChecklist: string[];
  }> {
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
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "trading_mentor_response",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  mentorSummary: { type: "string" },
                  priorityFocus: { type: "string" },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: {
                          type: "string",
                          enum: [
                            "trading_discipline",
                            "risk_management",
                            "psychology",
                            "strategy_performance",
                          ],
                        },
                        message: { type: "string" },
                      },
                      required: ["type", "message"],
                    },
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                  },
                  sessionPlan: {
                    type: "array",
                    items: { type: "string" },
                  },
                  reviewChecklist: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: [
                  "mentorSummary",
                  "priorityFocus",
                  "insights",
                  "recommendations",
                  "sessionPlan",
                  "reviewChecklist",
                ],
              },
            },
          },
          messages: [
            {
              role: "system",
              content: "You are an elite trading mentor, performance coach, and risk manager. Be direct, evidence-based, and practical. Return only strict JSON.",
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
        const message = await response.text();
        throw new Error(`Grok API failed with status ${response.status}: ${message}`);
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
      const sessionPlan = dedupe(validated.data.sessionPlan);
      const reviewChecklist = dedupe(validated.data.reviewChecklist);
      if (!insights.length || !recommendations.length) {
        return this.getAlgorithmicSuggestions(dataset);
      }

      return {
        mentorSummary: validated.data.mentorSummary.trim(),
        priorityFocus: validated.data.priorityFocus.trim(),
        insights: insights.slice(0, 8),
        recommendations: recommendations.slice(0, 8),
        sessionPlan: sessionPlan.slice(0, 5),
        reviewChecklist: reviewChecklist.slice(0, 5),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGemini(
    apiKey: string,
    dataset: Dataset,
  ): Promise<{
    mentorSummary: string;
    priorityFocus: string;
    insights: CoachingInsight[];
    recommendations: string[];
    sessionPlan: string[];
    reviewChecklist: string[];
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: this.buildPrompt(dataset) }],
              },
            ],
            systemInstruction: {
              parts: [
                {
                  text: "You are an elite trading mentor, performance coach, and risk manager. Be direct, evidence-based, and practical. Return only strict JSON.",
                },
              ],
            },
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Gemini API failed with status ${response.status}: ${message}`);
      }

      const payload = (await response.json()) as unknown;
      if (!isRecord(payload) || !Array.isArray(payload.candidates) || payload.candidates.length === 0) {
        throw new Error("Malformed Gemini API response.");
      }

      const first = payload.candidates[0];
      if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
        throw new Error("Malformed Gemini candidate.");
      }

      const textContent = first.content.parts
        .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
        .join("\n")
        .trim();

      if (!textContent) {
        throw new Error("Empty Gemini API content.");
      }

      const parsed = JSON.parse(extractJson(textContent)) as unknown;
      const validated = AIJsonSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error("Invalid Gemini JSON schema.");
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
      const sessionPlan = dedupe(validated.data.sessionPlan);
      const reviewChecklist = dedupe(validated.data.reviewChecklist);
      if (!insights.length || !recommendations.length) {
        return this.getAlgorithmicSuggestions(dataset);
      }

      return {
        mentorSummary: validated.data.mentorSummary.trim(),
        priorityFocus: validated.data.priorityFocus.trim(),
        insights: insights.slice(0, 8),
        recommendations: recommendations.slice(0, 8),
        sessionPlan: sessionPlan.slice(0, 5),
        reviewChecklist: reviewChecklist.slice(0, 5),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(dataset: Dataset): string {
    const aggregatePayload = {
      summary: dataset.summary,
      discipline_scores: dataset.discipline_scores,
      psychology_patterns: dataset.psychology_patterns,
      risk_stability_scores: dataset.risk_stability_scores,
      strategy_performance: dataset.strategy_performance,
      backtests: dataset.backtests,
    };
    const recentTrades = dataset.trades.slice(-20);
    const recentTradeBreakdown = recentTrades.length
      ? recentTrades.map((trade, index) => formatTradePromptLine(trade, index)).join("\n")
      : "No recent trades available.";
    const scopeLines =
      dataset.style === "all"
        ? [
            "Analyze all imported trades for this account scope. Do not segment by scalping, intraday, or swing.",
            `You are reviewing all ${dataset.style_scope.matched_trades} imported trades in scope.`,
          ]
        : [
            `Only analyze trades already classified as ${dataset.style}. Ignore any other style.`,
            `You are reviewing ${dataset.style_scope.matched_trades} matched trades out of ${dataset.style_scope.total_trades} total imported trades.`,
          ];

    return [
      "Analyze this trading data and provide advanced personalized coaching suggestions.",
      ...scopeLines,
      "Focus on discipline, risk management, psychology, and strategy performance.",
      "Use the aggregate stats JSON and the recent trade breakdown as evidence.",
      "Reference specific trade numbers like T3 or T14 whenever you spot a pattern in the recent trades.",
      "Avoid generic advice, avoid filler, and only comment on what the actual data shows.",
      "Be explicit about uncertainty when the sample is small or inconclusive.",
      "Write like a strict but helpful mentor preparing the trader for the next session.",
      "mentorSummary should be a short mentor-style overview.",
      "priorityFocus should name the single most important correction or edge to protect next.",
      "Each insight should explain what is happening, how confident you are, and why it matters.",
      "Recommendations should be actionable, concrete, and written like a coach preparing the next trading session or review drill.",
      "sessionPlan should contain concrete next-session actions.",
      "reviewChecklist should contain post-session review checks.",
      "Include a mix of protect-capital advice and exploit-edge advice when the data supports it.",
      "Return strict JSON only in this shape:",
      "{\"mentorSummary\":\"...\",\"priorityFocus\":\"...\",\"insights\":[{\"type\":\"trading_discipline|risk_management|psychology|strategy_performance\",\"message\":\"...\"}],\"recommendations\":[\"...\"],\"sessionPlan\":[\"...\"],\"reviewChecklist\":[\"...\"]}",
      "Aggregate stats JSON:",
      JSON.stringify(aggregatePayload),
      `Recent trade breakdown (${recentTrades.length} trades):`,
      recentTradeBreakdown,
    ].join("\n");
  }

  private buildDataset(input: GenerateSuggestionsInput & { style: TradingStyle }): Dataset {
    const scopedTrades = filterTradesByStyle(input.trades, input.style);
    const ordered = [...scopedTrades].sort((a, b) => openMs(a) - openMs(b));
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
      style_scope: {
        matched_trades: scopedTrades.length,
        total_trades: input.trades.length,
      },
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

  private buildCacheKey(dataset: Dataset, provider: "grok" | "gemini"): string {
    const fingerprint = {
      provider,
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
    provider: "grok" | "gemini",
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
      if (validated.data.fallbackUsed) continue;
      if (validated.data.source !== provider) continue;
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
        mentorSummary: result.mentorSummary,
        priorityFocus: result.priorityFocus,
        insights: result.insights,
        recommendations: result.recommendations,
        sessionPlan: result.sessionPlan,
        reviewChecklist: result.reviewChecklist,
        providerMessage: result.providerMessage,
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
