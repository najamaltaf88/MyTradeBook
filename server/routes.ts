import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { Logger } from "./logging";
import {
  connectAccountSchema,
  updateDashboardReflectionSchema,
  insertStrategyConceptNoteSchema,
  updateStrategyConceptNoteSchema,
  insertTradeNoteSchema,
  updateTradeJournalSchema,
  insertPlaybookRuleSchema,
  updatePlaybookRuleSchema,
  insertPerformanceGoalSchema,
  updatePerformanceGoalSchema,
  webhookTradeSchema,
} from "@shared/schema";
import {
  buildScreenshotUrl,
  calculateTradePips,
  extractScreenshotFilename,
  getTradingSession,
  isPerfectProfitFactor,
  PERFECT_PROFIT_FACTOR,
} from "@shared/trade-utils";
import { z } from "zod";
import { randomBytes } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { NextFunction, Request, Response } from "express";
import { publishUserUpdate, subscribeUserStream } from "./realtime";
import { analyzePortfolio, analyzeTrade, normalizeTradingStyle } from "./ai-analyzer";
import { AIAnalysisService } from "./ai-analysis-service";
import { CalendarAIService } from "./calendar-ai-service";
import { analyzePsychology } from "./psychology-engine";
import { analyzeRisk } from "./risk-engine";
import { analyzeStrategyEdge } from "./strategy-edge-engine";
import {
  fetchSupabaseUser,
  supabaseAdmin,
  supabaseEnabled,
  SUPABASE_STORAGE_BUCKET,
} from "./supabase";
import { professionalsRouter } from "./professional-routes";

function getUserId(req: Request): string {
  return (req as any).userId || (req as any).user?.claims?.sub || process.env.LOCAL_USER_ID || "local-user";
}

function getRouteParam(param: string | string[] | undefined): string {
  if (typeof param === "string") return param;
  if (Array.isArray(param)) return param[0] ?? "";
  return "";
}

function getHeaderValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function publishRealtimeUpdateForUser(userId: string, reason: string, entity?: string) {
  if (!userId) return;
  publishUserUpdate(userId, reason, entity);
}

function localOnly(_req: Request, _res: Response, next: NextFunction) {
  next();
}

const CSRF_HEADER = "x-mytradebook-request";
function requireAppHeader(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (req.originalUrl.startsWith("/api/webhook")) return next();

  const header = getHeaderValue(req.headers[CSRF_HEADER]);
  if (header !== "1") {
    return res.status(403).json({ message: "Missing request header" });
  }

  return next();
}

async function supabaseAuth(req: Request, res: Response, next: NextFunction) {
  if (!supabaseEnabled) return next();

  const openPaths = [
    "/api/health",
    "/api/crypto/listings",
    "/api/calendar",
    "/api/downloads/ea",
    "/api/webhook",
  ];
  if (openPaths.some((path) => req.originalUrl.startsWith(path))) {
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const queryToken =
    typeof req.query.access_token === "string"
      ? req.query.access_token
      : typeof req.query.token === "string"
      ? req.query.token
      : "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : queryToken;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await fetchSupabaseUser(token);
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  (req as any).userId = user.id;
  (req as any).user = { claims: { sub: user.id }, email: user.email || null };
  return next();
}

function generateApiKey(): string {
  return "mtb_" + randomBytes(32).toString("hex");
}

function parseDateFlexible(dateStr: string): Date {
  if (!dateStr || !String(dateStr).trim()) {
    throw new Error("Invalid date string: empty value. Expected ISO 8601 or YYYY-MM-DD.");
  }
  const cleaned = dateStr.replace(/\./g, "-").replace(/\s+/g, "T");
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  const d2 = new Date(dateStr);
  if (!isNaN(d2.getTime())) return d2;
  throw new Error(`Invalid date string: "${dateStr}". Expected ISO 8601 (2026-03-12T14:30:00Z) or YYYY-MM-DD.`);
}

function inferStartingBalanceFromAccountName(
  accountName: string | null | undefined,
  currentBalance?: number,
): number | null {
  const normalized = String(accountName || "")
    .toLowerCase()
    .replace(/[, ]+/g, "");
  if (!normalized) return null;

  const match = normalized.match(/(\d+(?:\.\d+)?)([km])/i);
  if (!match) return null;

  const rawValue = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null;

  let inferred = rawValue;
  if (unit === "k") inferred *= 1000;
  if (unit === "m") inferred *= 1000000;

  if (
    typeof currentBalance === "number" &&
    Number.isFinite(currentBalance) &&
    currentBalance > 0
  ) {
    const ratio = inferred / currentBalance;
    if (ratio < 0.25 || ratio > 4) return null;
  }

  const maxAllowed = Number(process.env.MAX_STARTING_BALANCE || 1_000_000);
  if (!Number.isFinite(maxAllowed) || maxAllowed <= 0) {
    return Math.round(inferred * 100) / 100;
  }
  if (inferred <= 0 || inferred > maxAllowed) return null;

  return Math.round(inferred * 100) / 100;
}

function isRemoteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function resolveUploadsDir(): string {
  const configured = typeof process.env.LOCAL_UPLOADS_DIR === "string"
    ? process.env.LOCAL_UPLOADS_DIR.trim()
    : "";
  if (configured) {
    const resolved = path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  const dataDir = typeof process.env.LOCAL_DATA_DIR === "string"
    ? process.env.LOCAL_DATA_DIR.trim()
    : "";
  const fallbackBase = dataDir
    ? (path.isAbsolute(dataDir) ? dataDir : path.resolve(process.cwd(), dataDir))
    : process.cwd();
  const resolved = path.join(fallbackBase, "uploads");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function resolveScreenshotPath(value: unknown): string | null {
  if (isRemoteUrl(value)) return null;
  const filename = extractScreenshotFilename(value);
  return filename ? path.join(uploadsDir, filename) : null;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tradeNetPnl(trade: {
  profit?: unknown;
  commission?: unknown;
  swap?: unknown;
}): number {
  return toFiniteNumber(trade.profit) + toFiniteNumber(trade.commission) + toFiniteNumber(trade.swap);
}

function sanitizeTextInput(value: unknown, maxLength?: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!cleaned) return null;
  if (typeof maxLength === "number" && maxLength > 0) {
    return cleaned.slice(0, maxLength);
  }
  return cleaned;
}

type GoalPeriodType = "daily" | "weekly" | "monthly";

function getDatePartsInTimezone(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || "0"),
    month: Number(parts.find((part) => part.type === "month")?.value || "1"),
    day: Number(parts.find((part) => part.type === "day")?.value || "1"),
  };
}

function dateFromTimezoneParts(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function formatDayKeyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDayKeyInTimezone(value: string | Date, timezone: string) {
  return formatDayKeyFromDate(dateFromTimezoneParts(getDatePartsInTimezone(value, timezone)));
}

function getMonthKeyInTimezone(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function getWeekKeyInTimezone(value: string | Date, timezone: string) {
  const localDate = dateFromTimezoneParts(getDatePartsInTimezone(value, timezone));
  const dayOfWeek = localDate.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - mondayOffset);
  return formatDayKeyFromDate(localDate);
}

function normalizeGoalPayload<T extends {
  periodType?: GoalPeriodType;
  periodKey?: string | null;
  month?: string | null;
}>(payload: T): T & { periodType: GoalPeriodType; periodKey: string; month: string | null } {
  const periodType =
    payload.periodType === "daily" || payload.periodType === "weekly" || payload.periodType === "monthly"
      ? payload.periodType
      : "monthly";
  const nextPeriodKey =
    typeof payload.periodKey === "string" && payload.periodKey.trim()
      ? payload.periodKey.trim()
      : typeof payload.month === "string" && payload.month.trim()
      ? payload.month.trim()
      : "";
  if (!nextPeriodKey) {
    throw new Error("Goal period is required.");
  }

  return {
    ...payload,
    periodType,
    periodKey: nextPeriodKey,
    month: periodType === "monthly" ? nextPeriodKey : null,
  };
}

type ReflectionSuggestion = {
  title: string;
  detail: string;
  category: "discipline" | "execution" | "risk" | "mindset";
};

type CryptoListing = {
  id: number;
  name: string;
  symbol: string;
  rank: number;
  price: number;
  percentChange24h: number;
  marketCap: number;
  volume24h: number;
};

const REFLECTION_PATTERNS: Array<{
  category: ReflectionSuggestion["category"];
  title: string;
  patterns: RegExp[];
  detail: string;
}> = [
  {
    category: "discipline",
    title: "Overtrading Control",
    patterns: [/overtrad/i, /too many trades?/i, /impuls/i],
    detail: "Mentor note: cap the session to a fixed number of trades and require the checklist before the next entry.",
  },
  {
    category: "mindset",
    title: "FOMO Filter",
    patterns: [/fomo/i, /chase/i, /late entry/i],
    detail: "Mentor note: wait for candle close plus structure confirmation. Missing a trade is cheaper than forcing one.",
  },
  {
    category: "mindset",
    title: "Revenge Trading Reset",
    patterns: [/revenge/i, /frustrat/i, /angry/i, /tilt/i],
    detail: "Mentor note: after an emotional hit, pause and write the next setup before you take it.",
  },
  {
    category: "risk",
    title: "Risk Consistency",
    patterns: [/oversiz/i, /risk too much/i, /big size/i, /lot size/i],
    detail: "Mentor note: keep risk fixed per trade and size positions only from the planned stop distance.",
  },
  {
    category: "execution",
    title: "Stop-Loss Discipline",
    patterns: [/move[d]? my sl/i, /no sl/i, /stop loss/i, /widened stop/i],
    detail: "Mentor note: set the invalidation level before entry and never widen the stop once the trade is live.",
  },
  {
    category: "execution",
    title: "Take-Profit Patience",
    patterns: [/closed early/i, /cut winners?/i, /took profit too soon/i],
    detail: "Mentor note: predefine partials or target rules so profit taking follows a rule, not a feeling.",
  },
  {
    category: "discipline",
    title: "Session Focus",
    patterns: [/news/i, /session/i, /london/i, /new york/i, /asian/i],
    detail: "Mentor note: trade only the session where your data shows edge and avoid off-plan hours.",
  },
];

function buildReflectionSuggestions(
  reflection: {
    notes?: string | null;
    lessons?: string | null;
    mistakes?: string | null;
    weaknesses?: string | null;
  },
  trades: Array<{ isClosed?: boolean; profit?: unknown; commission?: unknown; swap?: unknown }>,
): ReflectionSuggestion[] {
  const text = [
    reflection.notes || "",
    reflection.lessons || "",
    reflection.mistakes || "",
    reflection.weaknesses || "",
  ]
    .join("\n")
    .trim();

  const suggestions: ReflectionSuggestion[] = [];
  const seen = new Set<string>();

  for (const rule of REFLECTION_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(text)) && !seen.has(rule.title)) {
      suggestions.push({
        title: rule.title,
        detail: rule.detail,
        category: rule.category,
      });
      seen.add(rule.title);
    }
  }

  const closedTrades = trades.filter((trade) => trade.isClosed);
  const netResults = closedTrades.map((trade) => tradeNetPnl(trade));
  const wins = netResults.filter((value) => value > 0);
  const losses = netResults.filter((value) => value < 0);
  const grossWins = wins.reduce((sum, value) => sum + value, 0);
  const grossLosses = Math.abs(losses.reduce((sum, value) => sum + value, 0));
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? PERFECT_PROFIT_FACTOR : 0;
  const avgWin = wins.length > 0 ? grossWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(grossLosses / losses.length) : 0;

  if (closedTrades.length >= 5 && winRate < 40 && !seen.has("Selectivity Review")) {
    suggestions.push({
      title: "Selectivity Review",
      detail: "Mentor review: win rate is under 40%. Define the setups you will skip next session.",
      category: "discipline",
    });
    seen.add("Selectivity Review");
  }

  if (closedTrades.length >= 5 && profitFactor > 0 && profitFactor < 1 && !seen.has("Risk/Reward Audit")) {
    suggestions.push({
      title: "Risk/Reward Audit",
      detail: "Mentor audit: losses outweigh gains. Pair each mistake with one rule for entry, stop placement, or exit management.",
      category: "risk",
    });
    seen.add("Risk/Reward Audit");
  }

  if (avgLoss > 0 && avgWin > 0 && avgWin < avgLoss && !seen.has("Winner Management")) {
    suggestions.push({
      title: "Winner Management",
      detail: "Mentor note: average losses beat average wins. Convert one lesson into a rule for holding winners to planned targets.",
      category: "execution",
    });
    seen.add("Winner Management");
  }

  if (!suggestions.length) {
    suggestions.push({
      title: "Keep the Reflection Loop Tight",
      detail: "Mentor loop: after each session, write one lesson, one mistake, and one weakness so the system keeps coaching what matters.",
      category: "mindset",
    });
  }

  return suggestions.slice(0, 4);
}

async function verifyTradeOwnership(tradeId: string, userId: string): Promise<boolean> {
  const trade = await storage.getTrade(tradeId);
  if (!trade) return false;
  const account = await storage.getAccount(trade.accountId);
  return !!account && account.userId === userId;
}

async function verifyPlaybookOwnership(ruleId: string, userId: string): Promise<boolean> {
  const rule = await storage.getPlaybookRule(ruleId);
  return !!rule && rule.userId === userId;
}

async function verifyGoalOwnership(goalId: string, userId: string): Promise<boolean> {
  const goal = await storage.getPerformanceGoal(goalId);
  return !!goal && goal.userId === userId;
}

const uploadsDir = resolveUploadsDir();

const CMC_CACHE_TTL_MS = 60 * 1000;
const MAX_CMC_CACHE_SIZE = Number(process.env.CMC_CACHE_MAX || 1000);
const cmcCache = new Map<string, { fetchedAt: number; payload: { fetchedAt: string; cached: boolean; coins: CryptoListing[] } }>();

const MAX_UPLOAD_SIZE_MB = Math.max(1, Number(process.env.MAX_UPLOAD_SIZE_MB || 10));

const WEBHOOK_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const WEBHOOK_RATE_LIMIT_MAX = Math.max(10, Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 120));
const webhookRateLimit = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_RATE_LIMIT_MAX = Math.max(3, Number(process.env.AI_RATE_LIMIT_MAX || 12));
const aiRateLimit = new Map<string, { count: number; resetAt: number }>();

function isWebhookRateLimited(req: Request): boolean {
  const forwarded = getHeaderValue(req.headers["x-forwarded-for"]);
  const forwardedIp = forwarded ? forwarded.split(",")[0] : undefined;
  const ip = (forwardedIp || req.ip || req.socket?.remoteAddress || "unknown").trim();
  const now = Date.now();
  const current = webhookRateLimit.get(ip);
  if (!current || now > current.resetAt) {
    webhookRateLimit.set(ip, { count: 1, resetAt: now + WEBHOOK_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  if (current.count > WEBHOOK_RATE_LIMIT_MAX) return true;
  return false;
}

function isAiRateLimited(userId: string): boolean {
  const now = Date.now();
  const current = aiRateLimit.get(userId);
  if (!current || now > current.resetAt) {
    aiRateLimit.set(userId, { count: 1, resetAt: now + AI_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  if (current.count > AI_RATE_LIMIT_MAX) return true;
  return false;
}

function makeUploadFilename(originalName: string) {
  const ext = path.extname(originalName || "").toLowerCase();
  const safeExt = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) ? ext : ".png";
  const token = randomBytes(16).toString("hex");
  return `${Date.now()}-${token}${safeExt}`;
}

function extractSupabaseObjectPath(value: string): string | null {
  const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return value.slice(idx + marker.length);
}

async function deleteStoredFile(value: unknown) {
  if (!value) return;
  if (isRemoteUrl(value)) {
    if (!supabaseEnabled) return;
    const objectPath = extractSupabaseObjectPath(value);
    if (!objectPath) return;
    try {
      await supabaseAdmin!.storage.from(SUPABASE_STORAGE_BUCKET).remove([objectPath]);
    } catch (error) {
      Logger.logError("storage_cleanup_failed", error as Error);
    }
    return;
  }

  const filePath = resolveScreenshotPath(value);
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Best effort cleanup.
    }
  }
}

async function storeUploadedFile(file: Express.Multer.File, prefix: string, userId: string) {
  const filename = makeUploadFilename(file.originalname);

  if (supabaseEnabled) {
    const objectPath = `${userId}/${prefix}/${filename}`;
    const { error } = await supabaseAdmin!.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: true });

    if (error) {
      throw new Error(error.message || "Failed to upload to Supabase storage");
    }

    const { data } = supabaseAdmin!.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return { storedValue: data.publicUrl, publicUrl: data.publicUrl };
  }

  const targetPath = path.join(uploadsDir, filename);
  fs.writeFileSync(targetPath, file.buffer);
  return { storedValue: filename, publicUrl: buildScreenshotUrl(filename) ?? filename };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    const safeMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    cb(null, allowed.test(path.extname(file.originalname)) && safeMimeTypes.has(file.mimetype));
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const aiAnalysisService = new AIAnalysisService(storage);
  const calendarAiService = new CalendarAIService();
  let calendarCache = await storage.getCalendarCache();

  async function loadCalendarFeed(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && calendarCache && (now - calendarCache.fetchedAt) < CALENDAR_CACHE_TTL) {
      return calendarCache.data;
    }

    try {
      const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json");
      if (!response.ok) {
        return calendarCache?.data ?? [];
      }
      const data = await response.json();
      calendarCache = { data, fetchedAt: now };
      await storage.setCalendarCache(calendarCache);
      return data;
    } catch {
      if (!calendarCache) {
        calendarCache = await storage.getCalendarCache();
      }
      return calendarCache?.data ?? [];
    }
  }

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.use("/api", supabaseAuth);
  app.use("/api", requireAppHeader);

  app.get("/api/crypto/listings", localOnly, async (req, res) => {
    try {
      const apiKey = process.env.CMC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "CMC_API_KEY is not configured" });
      }

      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 5), 200) : 50;
      const convert = typeof req.query.convert === "string" ? req.query.convert.toUpperCase() : "USD";
      const cacheKey = `${limit}:${convert}`;
      const cached = cmcCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CMC_CACHE_TTL_MS) {
        return res.json({ ...cached.payload, cached: true });
      }

      const url = new URL("https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("convert", convert);
      url.searchParams.set("sort", "market_cap");
      url.searchParams.set("sort_dir", "desc");
      url.searchParams.set("aux", "cmc_rank");

      const response = await fetch(url.toString(), {
        headers: {
          "X-CMC_PRO_API_KEY": apiKey,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const message = await response.text();
        return res.status(502).json({ error: message || "Failed to load CoinMarketCap data" });
      }

      const data = await response.json();
      const coins: CryptoListing[] = Array.isArray(data?.data)
        ? data.data.map((item: any) => ({
            id: Number(item.id),
            name: String(item.name),
            symbol: String(item.symbol),
            rank: Number(item.cmc_rank ?? item.rank ?? 0),
            price: Number(item.quote?.[convert]?.price ?? 0),
            percentChange24h: Number(item.quote?.[convert]?.percent_change_24h ?? 0),
            marketCap: Number(item.quote?.[convert]?.market_cap ?? 0),
            volume24h: Number(item.quote?.[convert]?.volume_24h ?? 0),
          }))
        : [];

      const payload = {
        fetchedAt: new Date().toISOString(),
        cached: false,
        coins,
      };
      cmcCache.set(cacheKey, { fetchedAt: Date.now(), payload });
      if (cmcCache.size > MAX_CMC_CACHE_SIZE) {
        const oldestKey = cmcCache.keys().next().value as string | undefined;
        if (oldestKey) cmcCache.delete(oldestKey);
      }
      res.json(payload);
    } catch (error: any) {
      res.status(502).json({ error: error?.message || "Failed to load CoinMarketCap data" });
    }
  });

  app.get("/api/downloads/ea", (_req, res) => {
    const resourcesPath = (process as any).resourcesPath as string | undefined;
    const candidates = [
      path.join(process.cwd(), "public", "MyTradebook_EA.mq5"),
      resourcesPath ? path.join(resourcesPath, "app.asar", "public", "MyTradebook_EA.mq5") : "",
      resourcesPath ? path.join(resourcesPath, "app.asar.unpacked", "public", "MyTradebook_EA.mq5") : "",
      path.join(process.cwd(), "dist", "public", "MyTradebook_EA.mq5"),
    ].filter(Boolean);

    const filePath = candidates.find((file) => fs.existsSync(file));
    if (!filePath) {
      return res.status(404).json({ message: "EA file not found" });
    }

    res.download(filePath, "MyTradebook_EA.mq5");
  });

  app.get("/api/realtime/stream", (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const unsubscribe = subscribeUserStream(userId, res);
    req.on("close", () => {
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    });
  });

  app.post("/api/accounts", localOnly, async (req, res) => {
    try {
      const parsed = connectAccountSchema.parse(req.body);
      const apiKey = generateApiKey();

      const account = await storage.createAccount({
        userId: getUserId(req),
        server: parsed.server || "",
        login: parsed.login || "",
        investorPassword: "",
        name: parsed.name,
        broker: parsed.broker || "",
        apiKey,
        balance: 0,
        equity: 0,
        currency: "USD",
        platform: parsed.platform,
        connected: false,
      });

      publishRealtimeUpdateForUser(getUserId(req), "account_created", "accounts");
      res.json(account);
    } catch (error: any) {
      Logger.logError("account_create_failed", error as Error);
      res.status(400).json({ message: error.message || "Failed to create account" });
    }
  });

  app.get("/api/accounts", localOnly, async (req, res) => {
    try {
      const accounts = await storage.getAccounts(getUserId(req));
      for (const acct of accounts) {
        if (!acct.apiKey) {
          const newKey = generateApiKey();
          await storage.updateAccount(acct.id, { apiKey: newKey });
          acct.apiKey = newKey;
        }
      }
      const safe = accounts.map(({ investorPassword, ...rest }) => rest);
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/accounts/:id", localOnly, async (req, res) => {
    try {
      const account = await storage.getAccount(getRouteParam(req.params.id));
      if (!account || account.userId !== getUserId(req)) return res.status(404).json({ message: "Account not found" });
      if (!account.apiKey) {
        const newKey = generateApiKey();
        await storage.updateAccount(account.id, { apiKey: newKey });
        account.apiKey = newKey;
      }
      const { investorPassword, ...safe } = account;
      res.json(safe);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/reflection", localOnly, async (req, res) => {
    try {
      res.json(await storage.getDashboardReflection(getUserId(req)));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/dashboard/reflection", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = updateDashboardReflectionSchema.parse(req.body);
      const updated = await storage.updateDashboardReflection(userId, {
        notes: parsed.notes,
        lessons: parsed.lessons,
        mistakes: parsed.mistakes,
        weaknesses: parsed.weaknesses,
      });
      publishRealtimeUpdateForUser(userId, "dashboard_reflection_updated", "dashboard");
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/reflection/suggestions", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const reflection = await storage.getDashboardReflection(userId);
      const accountId = req.query.accountId as string | undefined;
      const trades = await storage.getTradesByUser(userId, accountId);
      res.json({
        updatedAt: reflection.updatedAt ?? new Date().toISOString(),
        suggestions: buildReflectionSuggestions(reflection, trades),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/accounts/:id/regenerate-key", localOnly, async (req, res) => {
    try {
      const account = await storage.getAccount(getRouteParam(req.params.id));
      if (!account || account.userId !== getUserId(req)) return res.status(404).json({ message: "Account not found" });
      const newKey = generateApiKey();
      await storage.updateAccount(account.id, { apiKey: newKey });
      publishRealtimeUpdateForUser(getUserId(req), "account_api_key_regenerated", "accounts");
      res.json({ apiKey: newKey });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/accounts/:id", localOnly, async (req, res) => {
    try {
      const account = await storage.getAccount(getRouteParam(req.params.id));
      if (!account || account.userId !== getUserId(req)) return res.status(404).json({ message: "Account not found" });

      await storage.deleteAccount(getRouteParam(req.params.id));
      publishRealtimeUpdateForUser(getUserId(req), "account_deleted", "accounts");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/webhook/trades", async (req, res) => {
    try {
      if (isWebhookRateLimited(req)) {
        return res.status(429).json({ message: "Rate limit exceeded" });
      }
      const apiKey = getHeaderValue(req.headers["x-api-key"]);
      if (!apiKey) return res.status(401).json({ message: "Missing API key" });

      const account = await storage.getAccountByApiKey(apiKey);
      if (!account) return res.status(401).json({ message: "Invalid API key" });
      if (!account.userId) return res.status(400).json({ message: "Invalid account" });

      const parsed = webhookTradeSchema.parse(req.body);
      const sanitizedComment = sanitizeTextInput(parsed.comment, 5000);

      if (parsed.action === "HEARTBEAT") {
        await storage.updateAccount(account.id, { connected: true, lastSyncAt: new Date() });
        publishRealtimeUpdateForUser(account.userId || "", "account_heartbeat", "accounts");
        return res.json({ status: "ok" });
      }

      if (parsed.action === "ACCOUNT_INFO") {
        const updates: any = { connected: true, lastSyncAt: new Date() };
        if (parsed.balance !== undefined) {
          updates.balance = parsed.balance;
          if (account.startingBalance == null && parsed.balance > 0) {
            updates.startingBalance =
              inferStartingBalanceFromAccountName(account.name, parsed.balance) ??
              parsed.balance;
          }
        }
        if (parsed.equity !== undefined) updates.equity = parsed.equity;
        if (parsed.currency) updates.currency = parsed.currency;
        if (parsed.leverage) updates.leverage = parsed.leverage;
        await storage.updateAccount(account.id, updates);
        publishRealtimeUpdateForUser(account.userId || "", "account_info_updated", "accounts");
        return res.json({ status: "ok" });
      }

      if (!parsed.ticket || !parsed.symbol || !parsed.type || !parsed.openTime || parsed.openPrice === undefined || parsed.volume === undefined) {
        return res.status(400).json({ message: "Missing required trade fields: ticket, symbol, type, openTime, openPrice, volume" });
      }

      const existing = await storage.getTradeByTicket(parsed.ticket, account.id);

      if (parsed.action === "TRADE_OPEN") {
        if (existing) {
          if (existing.isClosed) {
            await storage.updateAccount(account.id, { connected: true, lastSyncAt: new Date() });
            return res.json({ status: "ok", action: "trade_already_closed" });
          }

          await storage.updateTrade(existing.id, {
            openPrice: parsed.openPrice,
            volume: parsed.volume,
            stopLoss: parsed.stopLoss ?? existing.stopLoss,
            takeProfit: parsed.takeProfit ?? existing.takeProfit,
            profit: parsed.profit ?? existing.profit ?? 0,
            commission: parsed.commission ?? existing.commission ?? 0,
            swap: parsed.swap ?? existing.swap ?? 0,
            comment: sanitizedComment ?? existing.comment,
          });
          Logger.logTrade("trade_open_updated", "success", existing.id);
        } else {
          const newTrade = await storage.createTrade({
            ticket: parsed.ticket,
            accountId: account.id,
            symbol: parsed.symbol,
            type: parsed.type,
            openTime: parseDateFlexible(parsed.openTime),
            openPrice: parsed.openPrice,
            volume: parsed.volume,
            profit: parsed.profit ?? 0,
            commission: parsed.commission ?? 0,
            swap: parsed.swap ?? 0,
            stopLoss: parsed.stopLoss ?? null,
            takeProfit: parsed.takeProfit ?? null,
            comment: sanitizedComment,
            isClosed: false,
          });
          Logger.logTrade("trade_open_created", "success", newTrade.id);
        }

        await storage.updateAccount(account.id, { connected: true, lastSyncAt: new Date() });
        publishRealtimeUpdateForUser(account.userId || "", "trade_opened", "trades");
        return res.json({ status: "ok", action: "trade_opened" });
      }

      if (parsed.action === "TRADE_CLOSE") {
        const closeTime = parsed.closeTime ? parseDateFlexible(parsed.closeTime) : new Date();
        const openTime = parseDateFlexible(parsed.openTime);
        const duration = Math.max(0, Math.floor((closeTime.getTime() - openTime.getTime()) / 1000));
        const pips =
          parsed.closePrice !== undefined
            ? calculateTradePips(parsed.symbol, parsed.type, parsed.openPrice, parsed.closePrice)
            : null;

        if (existing) {
          await storage.updateTrade(existing.id, {
            closeTime,
            closePrice: parsed.closePrice ?? null,
            profit: parsed.profit ?? 0,
            commission: parsed.commission ?? 0,
            swap: parsed.swap ?? 0,
            stopLoss: parsed.stopLoss ?? existing.stopLoss,
            takeProfit: parsed.takeProfit ?? existing.takeProfit,
            isClosed: true,
            duration,
            pips,
          });
        } else {
          await storage.createTrade({
            ticket: parsed.ticket,
            accountId: account.id,
            symbol: parsed.symbol,
            type: parsed.type,
            openTime: parseDateFlexible(parsed.openTime),
            openPrice: parsed.openPrice,
            closeTime,
            closePrice: parsed.closePrice ?? null,
            volume: parsed.volume,
            profit: parsed.profit ?? 0,
            commission: parsed.commission ?? 0,
            swap: parsed.swap ?? 0,
            stopLoss: parsed.stopLoss ?? null,
            takeProfit: parsed.takeProfit ?? null,
            pips,
            duration,
            comment: sanitizedComment,
            isClosed: true,
          });
        }

        if (parsed.balance !== undefined) {
          const accountUpdates: any = {
            balance: parsed.balance,
            equity: parsed.equity ?? parsed.balance,
            connected: true,
            lastSyncAt: new Date(),
          };
          if (account.startingBalance == null && parsed.balance > 0) {
            accountUpdates.startingBalance =
              inferStartingBalanceFromAccountName(account.name, parsed.balance) ??
              parsed.balance;
          }
          await storage.updateAccount(account.id, accountUpdates);
        } else {
          await storage.updateAccount(account.id, { connected: true, lastSyncAt: new Date() });
        }

        publishRealtimeUpdateForUser(account.userId || "", "trade_closed", "trades");
        return res.json({ status: "ok", action: "trade_closed" });
      }

      if (parsed.action === "TRADE_UPDATE") {
        if (existing) {
          const updates: any = {};
          if (parsed.stopLoss !== undefined) updates.stopLoss = parsed.stopLoss;
          if (parsed.takeProfit !== undefined) updates.takeProfit = parsed.takeProfit;
          if (parsed.profit !== undefined) updates.profit = parsed.profit;
          if (parsed.commission !== undefined) updates.commission = parsed.commission;
          if (parsed.swap !== undefined) updates.swap = parsed.swap;
          if (parsed.volume !== undefined) updates.volume = parsed.volume;
          await storage.updateTrade(existing.id, updates);
        }
        await storage.updateAccount(account.id, { connected: true, lastSyncAt: new Date() });
        publishRealtimeUpdateForUser(account.userId || "", "trade_updated", "trades");
        return res.json({ status: "ok", action: "trade_updated" });
      }

      res.status(400).json({ message: "Unknown action" });
    } catch (error: any) {
      Logger.logError("webhook_processing_failed", error as Error);
      res.status(400).json({ message: error.message || "Webhook processing failed" });
    }
  });

  app.get("/api/trades", localOnly, async (req, res) => {
    try {
      const accountId = req.query.accountId as string | undefined;
      const allTrades = await storage.getTradesByUser(getUserId(req), accountId);
      const pageRaw = typeof req.query.page === "string" ? Number(req.query.page) : NaN;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 25), 500) : NaN;
      const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : NaN;

      if (Number.isFinite(page) || Number.isFinite(limit)) {
        const safeLimit = Number.isFinite(limit) ? limit : 100;
        const safePage = Number.isFinite(page) ? page : 1;
        const offset = (safePage - 1) * safeLimit;
        const data = allTrades.slice(offset, offset + safeLimit);
        return res.json({
          data,
          page: safePage,
          limit: safeLimit,
          total: allTrades.length,
          totalPages: Math.max(1, Math.ceil(allTrades.length / safeLimit)),
        });
      }

      res.json(allTrades);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/trades/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const trade = await storage.getTrade(getRouteParam(req.params.id));
      res.json(trade);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai/trades", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accountId = req.query.accountId as string | undefined;
      const style = normalizeTradingStyle(req.query.style as string | undefined);
      const trades = await storage.getTradesByUser(userId, accountId);
      const analysis = analyzePortfolio(trades, { style });
      res.json(analysis.tradeAnalyses);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to analyze trades" });
    }
  });

  app.get("/api/ai/trades/:id", localOnly, async (req, res) => {
    try {
      const tradeId = getRouteParam(req.params.id);
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(tradeId, userId))) {
        return res.status(404).json({ message: "Trade not found" });
      }

      const trade = await storage.getTrade(tradeId);
      if (!trade) return res.status(404).json({ message: "Trade not found" });

      const accountId = req.query.accountId as string | undefined;
      const style = normalizeTradingStyle(req.query.style as string | undefined);
      const userTrades = await storage.getTradesByUser(userId, accountId);
      const portfolio = analyzePortfolio(userTrades, { style });
      const analyses = Array.isArray(portfolio.tradeAnalyses) ? portfolio.tradeAnalyses : [];
      const single =
        analyses.find((item) => item.tradeId === tradeId) ||
        analyzeTrade(trade, { trades: userTrades, style });

      await storage.updateTrade(tradeId, {
        aiGrade: single.grade,
        aiScore: single.score,
        aiAnalysisCache: JSON.stringify(single),
        aiCachedAt: new Date(),
      } as any);

      res.json(single);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to analyze trade" });
    }
  });

  app.get("/api/ai/portfolio", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accountId = req.query.accountId as string | undefined;
      const style = normalizeTradingStyle("all");
      const trades = await storage.getTradesByUser(userId, accountId);
      const analysis = analyzePortfolio(trades, { style });
      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to analyze portfolio" });
    }
  });

  app.post("/api/ai/analyze", localOnly, async (req, res) => {
    const userId = getUserId(req);
    if (isAiRateLimited(userId)) {
      return res.status(429).json({ message: "AI analysis rate limit exceeded. Please wait a minute and try again." });
    }
    const parsed = z
      .object({
        accountId: z.string().optional(),
        style: z.string().optional(),
        provider: z.enum(["grok", "gemini"]).optional(),
        forceRefresh: z.boolean().optional(),
      })
      .safeParse(req.body || {});

    const accountId = parsed.success ? parsed.data.accountId : undefined;
    const style = normalizeTradingStyle("all");
    const provider = parsed.success ? parsed.data.provider : undefined;
    const forceRefresh = parsed.success ? Boolean(parsed.data.forceRefresh) : false;
    let trades: Awaited<ReturnType<typeof storage.getTradesByUser>> = [];

    try {
      trades = await storage.getTradesByUser(userId, accountId);
      const analysis = await aiAnalysisService.generateFinalSuggestions({
        userId,
        trades,
        accountId,
        style,
        provider,
        forceRefresh,
      });
      return res.json(analysis);
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      Logger.logAi("ai_analysis_failed", "error", userId, originalError.message);
      try {
        const fallback = await aiAnalysisService.generateFinalSuggestions({
          userId,
          trades: trades,  // BUG FIX: Use original trades, not empty array
          accountId,
          style,
          provider,
          forceRefresh: true,
        });
        Logger.logAi("ai_fallback_success", "success", userId);
        return res.json(fallback);
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        Logger.logAi("ai_all_failed", "error", userId, fallbackMessage);
        Logger.logError("ai_fallback_failed", originalError, { userId, fallbackMessage });
        return res.json({
          generatedAt: new Date().toISOString(),
          source: "algorithmic",
          modelUsed: "algorithmic-v1",
          fallbackUsed: true,
          fromCache: false,
          insights: [
            {
              type: "strategy_performance",
              message:
                "AI analysis is temporarily unavailable. Basic discipline safeguards remain active.",
            },
          ],
          recommendations: [
            "Keep risk fixed per trade and continue journaling every setup.",
          ],
        });
      }
    }
  });

  app.get("/api/ai/psychology", localOnly, async (req, res) => {
    const userId = getUserId(req);
    const parsed = z
      .object({
        accountId: z.string().optional(),
      })
      .safeParse(req.query || {});

    const accountId = parsed.success ? parsed.data.accountId : undefined;

    try {
      const trades = await storage.getTradesByUser(userId, accountId);
      const report = analyzePsychology(trades);
      Logger.logAi("psychology_analysis_complete", "success", userId);
      return res.json(report);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.logAi("psychology_analysis_failed", "error", userId, errorMsg);
      return res.status(500).json({ message: errorMsg });
    }
  });

  app.get("/api/ai/risk", localOnly, async (req, res) => {
    const userId = getUserId(req);
    const parsed = z
      .object({
        accountId: z.string().optional(),
      })
      .safeParse(req.query || {});

    const accountId = parsed.success ? parsed.data.accountId : undefined;

    try {
      const trades = await storage.getTradesByUser(userId, accountId);
      const userAccounts = await storage.getAccounts(userId);
      const relevantAccounts = accountId
        ? userAccounts.filter((a) => a.id === accountId)
        : userAccounts;
      const startingBalance = relevantAccounts.reduce((sum, a) => {
        const balance = toFiniteNumber(a.balance);
        const equity = toFiniteNumber(a.equity);
        const referenceBalance = balance > 0 ? balance : equity;
        const storedStartingBalance =
          typeof a.startingBalance === "number" && Number.isFinite(a.startingBalance)
            ? a.startingBalance
            : null;
        const inferredStartingBalance = inferStartingBalanceFromAccountName(a.name, referenceBalance);
        return sum + (storedStartingBalance ?? inferredStartingBalance ?? referenceBalance);
      }, 0);
      const profile = analyzeRisk(trades, startingBalance > 0 ? startingBalance : 10000);
      Logger.logAi("risk_analysis_complete", "success", userId);
      return res.json(profile);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.logAi("risk_analysis_failed", "error", userId, errorMsg);
      return res.status(500).json({ message: errorMsg });
    }
  });

  app.get("/api/ai/strategy-edge", localOnly, async (req, res) => {
    const userId = getUserId(req);
    const parsed = z
      .object({
        accountId: z.string().optional(),
      })
      .safeParse(req.query || {});

    const accountId = parsed.success ? parsed.data.accountId : undefined;

    try {
      const trades = await storage.getTradesByUser(userId, accountId);
      const report = analyzeStrategyEdge(trades);
      Logger.logAi("strategy_edge_analysis_complete", "success", userId);
      return res.json(report);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.logAi("strategy_edge_analysis_failed", "error", userId, errorMsg);
      return res.status(500).json({ message: errorMsg });
    }
  });

  app.get("/api/strategy-edge/concepts", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accountId = req.query.accountId as string | undefined;
      res.json(await storage.getStrategyConceptNotes(userId, accountId));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to load strategy concepts" });
    }
  });

  app.post("/api/strategy-edge/concepts", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = insertStrategyConceptNoteSchema.parse(req.body);
      const created = await storage.createStrategyConceptNote({
        ...parsed,
        strategy: sanitizeTextInput(parsed.strategy, 200) || parsed.strategy,
        title: sanitizeTextInput(parsed.title, 200) || parsed.title,
        concept: sanitizeTextInput(parsed.concept, 4000) || parsed.concept,
        lesson: sanitizeTextInput(parsed.lesson, 2000),
        checklist: sanitizeTextInput(parsed.checklist, 2000),
        mistakesToAvoid: sanitizeTextInput(parsed.mistakesToAvoid, 2000),
        userId,
      });
      publishRealtimeUpdateForUser(userId, "strategy_concept_created", "strategy_edge");
      res.json(created);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create strategy concept" });
    }
  });

  app.patch("/api/strategy-edge/concepts/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getStrategyConceptNote(getRouteParam(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Strategy concept not found" });
      }
      const parsed = updateStrategyConceptNoteSchema.parse(req.body);
      const updated = await storage.updateStrategyConceptNote(existing.id, {
        ...parsed,
        strategy: parsed.strategy !== undefined ? sanitizeTextInput(parsed.strategy, 200) || parsed.strategy : undefined,
        title: parsed.title !== undefined ? sanitizeTextInput(parsed.title, 200) || parsed.title : undefined,
        concept: parsed.concept !== undefined ? sanitizeTextInput(parsed.concept, 4000) || parsed.concept : undefined,
        lesson: parsed.lesson !== undefined ? sanitizeTextInput(parsed.lesson, 2000) : undefined,
        checklist: parsed.checklist !== undefined ? sanitizeTextInput(parsed.checklist, 2000) : undefined,
        mistakesToAvoid: parsed.mistakesToAvoid !== undefined ? sanitizeTextInput(parsed.mistakesToAvoid, 2000) : undefined,
      });
      publishRealtimeUpdateForUser(userId, "strategy_concept_updated", "strategy_edge");
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update strategy concept" });
    }
  });

  app.delete("/api/strategy-edge/concepts/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getStrategyConceptNote(getRouteParam(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Strategy concept not found" });
      }
      await deleteStoredFile(existing.imageUrl);
      await storage.deleteStrategyConceptNote(existing.id);
      publishRealtimeUpdateForUser(userId, "strategy_concept_deleted", "strategy_edge");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete strategy concept" });
    }
  });

  app.post("/api/strategy-edge/concepts/:id/image", localOnly, upload.single("image"), async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getStrategyConceptNote(getRouteParam(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Strategy concept not found" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }
      await deleteStoredFile(existing.imageUrl);
      const stored = await storeUploadedFile(req.file, "strategy", userId);
      const updated = await storage.updateStrategyConceptNote(existing.id, { imageUrl: stored.storedValue });
      publishRealtimeUpdateForUser(userId, "strategy_concept_image_uploaded", "strategy_edge");
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to upload image" });
    }
  });

  app.delete("/api/strategy-edge/concepts/:id/image", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const existing = await storage.getStrategyConceptNote(getRouteParam(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Strategy concept not found" });
      }
      await deleteStoredFile(existing.imageUrl);
      const updated = await storage.updateStrategyConceptNote(existing.id, { imageUrl: null });
      publishRealtimeUpdateForUser(userId, "strategy_concept_image_deleted", "strategy_edge");
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete image" });
    }
  });

  app.get("/api/trades/:id/notes", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const notes = await storage.getTradeNotes(getRouteParam(req.params.id));
      res.json(notes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trades/:id/notes", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const parsed = insertTradeNoteSchema.parse({
        ...req.body,
        note: sanitizeTextInput(req.body?.note, 5000) || "",
        tradeId: getRouteParam(req.params.id),
      });
      const note = await storage.createTradeNote(parsed);
      publishRealtimeUpdateForUser(userId, "trade_note_created", "notes");
      res.json(note);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/notes/:id", localOnly, async (req, res) => {
    try {
      const note = await storage.getTradeNote(getRouteParam(req.params.id));
      if (!note) return res.status(404).json({ message: "Note not found" });
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(note.tradeId, userId))) return res.status(404).json({ message: "Note not found" });
      await storage.deleteTradeNote(getRouteParam(req.params.id));
      publishRealtimeUpdateForUser(userId, "trade_note_deleted", "notes");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/trades/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const trade = await storage.getTrade(getRouteParam(req.params.id));
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      const parsed = updateTradeJournalSchema.parse(req.body);
      const updateData: Partial<typeof trade> = {};
      if (parsed.reason !== undefined) updateData.reason = parsed.reason.trim() || null;
      if (parsed.logic !== undefined) updateData.logic = parsed.logic.trim() || null;
      if (parsed.emotion !== undefined) updateData.emotion = parsed.emotion || null;
      const updated = await storage.updateTrade(getRouteParam(req.params.id), updateData);
      publishRealtimeUpdateForUser(userId, "trade_journal_updated", "trades");
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/trades/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      const tradeId = getRouteParam(req.params.id);
      if (!(await verifyTradeOwnership(tradeId, userId))) return res.status(404).json({ message: "Trade not found" });
      const trade = await storage.getTrade(tradeId);
      if (!trade) return res.status(404).json({ message: "Trade not found" });

      // Clean up associated screenshot file
      if (trade.screenshotUrl) {
        await deleteStoredFile(trade.screenshotUrl);
      }

      await storage.deleteTrade(tradeId);
      publishRealtimeUpdateForUser(userId, "trade_deleted", "trades");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trades/:id/screenshot", localOnly, upload.single("screenshot"), async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const trade = await storage.getTrade(getRouteParam(req.params.id));
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      if (trade.screenshotUrl) {
        await deleteStoredFile(trade.screenshotUrl);
      }

      const stored = await storeUploadedFile(req.file, "trades", userId);
      const url = stored.publicUrl;
      await storage.updateTrade(getRouteParam(req.params.id), { screenshotUrl: stored.storedValue });
      publishRealtimeUpdateForUser(userId, "trade_screenshot_uploaded", "trades");
      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trades/:id/screenshot", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyTradeOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Trade not found" });
      const trade = await storage.getTrade(getRouteParam(req.params.id));
      if (!trade) return res.status(404).json({ message: "Trade not found" });
      if (trade.screenshotUrl) {
        await deleteStoredFile(trade.screenshotUrl);
      }
      await storage.updateTrade(getRouteParam(req.params.id), { screenshotUrl: null });
      publishRealtimeUpdateForUser(userId, "trade_screenshot_deleted", "trades");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.use(
    "/uploads",
    (await import("express")).default.static(uploadsDir, {
      etag: true,
      immutable: true,
      maxAge: "30d",
    }),
  );

  const publicDir = path.join(process.cwd(), "public");
  if (fs.existsSync(publicDir)) {
    app.use((await import("express")).default.static(publicDir));
  }

  app.get("/api/stats", localOnly, async (req, res) => {
    try {
      const accountId = req.query.accountId as string | undefined;
      const allTrades = await storage.getTradesByUser(getUserId(req), accountId);
      const closedTrades = allTrades.filter((t) => t.isClosed);
      const openTrades = allTrades.filter((t) => !t.isClosed);
      
      // Validate timezone and return a clear 400 for invalid values
      let userTz = (req.query.timezone as string) || "UTC";
      try {
        new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: userTz,
        });
      } catch {
        return res.status(400).json({
          message: "Invalid timezone",
          valid_example: "America/New_York",
        });
      }
      
      const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: userTz,
      });
      const monthKeyFormatter = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "2-digit",
        timeZone: userTz,
      });
      const getDayKey = (value: string | Date) => {
        const parts = dayKeyFormatter.formatToParts(new Date(value));
        const year = parts.find((p) => p.type === "year")?.value || "0000";
        const month = parts.find((p) => p.type === "month")?.value || "01";
        const day = parts.find((p) => p.type === "day")?.value || "01";
        return `${year}-${month}-${day}`;
      };
      const getMonthKey = (value: string | Date) => {
        const parts = monthKeyFormatter.formatToParts(new Date(value));
        const year = parts.find((p) => p.type === "year")?.value || "0000";
        const month = parts.find((p) => p.type === "month")?.value || "01";
        return `${year}-${month}`;
      };

      const wins = closedTrades.filter((t) => tradeNetPnl(t) > 0);
      const losses = closedTrades.filter((t) => tradeNetPnl(t) < 0);
      const breakeven = closedTrades.filter((t) => tradeNetPnl(t) === 0);

      const totalCommission = closedTrades.reduce((sum, t) => sum + toFiniteNumber(t.commission), 0);
      const totalSwap = closedTrades.reduce((sum, t) => sum + toFiniteNumber(t.swap), 0);
      const tradeNetProfit = closedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);

      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + tradeNetPnl(t), 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + tradeNetPnl(t), 0) / losses.length) : 0;
      const totalGrossWins = wins.reduce((s, t) => s + tradeNetPnl(t), 0);
      const totalGrossLosses = Math.abs(losses.reduce((s, t) => s + tradeNetPnl(t), 0));
      // BUG FIX: Handle zero losses correctly (perfect record sentinel)
      let profitFactor = 0;
      if (totalGrossLosses > 0) {
        profitFactor = Math.round((totalGrossWins / totalGrossLosses) * 100) / 100;
      } else if (totalGrossWins > 0) {
        profitFactor = PERFECT_PROFIT_FACTOR;
      }

      const bestTrade = closedTrades.length > 0
        ? closedTrades.reduce((best, t) => (tradeNetPnl(t) > tradeNetPnl(best) ? t : best))
        : null;
      const worstTrade = closedTrades.length > 0
        ? closedTrades.reduce((worst, t) => (tradeNetPnl(t) < tradeNetPnl(worst) ? t : worst))
        : null;

      const avgRR = (() => {
        const tradesWithSLTP = closedTrades.filter((t) => t.stopLoss && t.takeProfit && t.openPrice);
        if (tradesWithSLTP.length === 0) return null;
        const rrValues = tradesWithSLTP.map((t) => {
          const risk = Math.abs(t.openPrice - (t.stopLoss || 0));
          const reward = Math.abs((t.takeProfit || 0) - t.openPrice);
          return risk > 0 ? reward / risk : 0;
        });
        return Math.round((rrValues.reduce((s, v) => s + v, 0) / rrValues.length) * 100) / 100;
      })();

      const sortedByClose = [...closedTrades].sort((a, b) => {
        const aTime = a.closeTime ? new Date(a.closeTime).getTime() : 0;
        const bTime = b.closeTime ? new Date(b.closeTime).getTime() : 0;
        return aTime - bTime;
      });

      let currentWinStreak = 0;
      let currentLossStreak = 0;
      let maxWinStreak = 0;
      let maxLossStreak = 0;
      for (const t of sortedByClose) {
        const net = tradeNetPnl(t);
        if (net > 0) {
          currentWinStreak++;
          currentLossStreak = 0;
          maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
        } else if (net < 0) {
          currentLossStreak++;
          currentWinStreak = 0;
          maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        } else {
          currentWinStreak = 0;
          currentLossStreak = 0;
        }
      }

      // BUG FIX: Calculate max drawdown from initial balance
      let maxDrawdown = 0;
      let peak = 0;  // Start from 0 (assuming starting balance at trade 0)
      let runningPnl = 0;
      for (const t of sortedByClose) {
        runningPnl += tradeNetPnl(t);
        if (runningPnl > peak) peak = runningPnl;  // Update peak when we reach new high
        const dd = peak - runningPnl;  // Drawdown from the peak
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      const avgDuration = closedTrades.length > 0
        ? Math.round(closedTrades.reduce((s, t) => s + (t.duration || 0), 0) / closedTrades.length)
        : 0;

      const longTrades = closedTrades.filter((t) => t.type === "BUY");
      const shortTrades = closedTrades.filter((t) => t.type === "SELL");
      const longWinRate = longTrades.length > 0
        ? Math.round((longTrades.filter((t) => tradeNetPnl(t) > 0).length / longTrades.length) * 10000) / 100
        : 0;
      const shortWinRate = shortTrades.length > 0
        ? Math.round((shortTrades.filter((t) => tradeNetPnl(t) > 0).length / shortTrades.length) * 10000) / 100
        : 0;
      const longProfit = Math.round(longTrades.reduce((s, t) => s + tradeNetPnl(t), 0) * 100) / 100;
      const shortProfit = Math.round(shortTrades.reduce((s, t) => s + tradeNetPnl(t), 0) * 100) / 100;

      const symbolStats: Record<string, { count: number; profit: number; wins: number; avgDuration: number; totalDuration: number }> = {};
      for (const t of closedTrades) {
        const bucket = symbolStats[t.symbol] || { count: 0, profit: 0, wins: 0, avgDuration: 0, totalDuration: 0 };
        bucket.count += 1;
        bucket.profit += tradeNetPnl(t);
        bucket.totalDuration += t.duration || 0;
        if (tradeNetPnl(t) > 0) bucket.wins += 1;
        symbolStats[t.symbol] = bucket;
      }

      const monthlyPnl: Record<string, { profit: number; trades: number; wins: number }> = {};
      for (const t of closedTrades) {
        if (t.closeTime) {
          const key = getMonthKey(t.closeTime);
          if (!monthlyPnl[key]) monthlyPnl[key] = { profit: 0, trades: 0, wins: 0 };
          monthlyPnl[key].profit += tradeNetPnl(t);
          monthlyPnl[key].trades++;
          if (tradeNetPnl(t) > 0) monthlyPnl[key].wins++;
        }
      }

      const sessionStats: Record<string, { profit: number; trades: number; wins: number }> = {};
      for (const t of closedTrades) {
        if (t.openTime) {
          const session = getTradingSession(t.openTime);
          if (!sessionStats[session]) sessionStats[session] = { profit: 0, trades: 0, wins: 0 };
          sessionStats[session].profit += tradeNetPnl(t);
          sessionStats[session].trades++;
          if (tradeNetPnl(t) > 0) sessionStats[session].wins++;
        }
      }

      const dailyPnl: Record<string, number> = {};
      for (const t of closedTrades) {
        if (t.closeTime) {
          const day = getDayKey(t.closeTime);
          dailyPnl[day] = (dailyPnl[day] || 0) + tradeNetPnl(t);
        }
      }

      let cumulativePnl = 0;
      const equityCurve = Object.entries(dailyPnl)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, pnl]) => {
          cumulativePnl += pnl;
          return { date, pnl: Math.round(pnl * 100) / 100, cumulative: Math.round(cumulativePnl * 100) / 100 };
        });

      const hourlyStats: Record<number, { profit: number; count: number; wins: number }> = {};
      for (const t of closedTrades) {
        if (t.openTime) {
          const h = new Date(t.openTime).getUTCHours();
          if (!hourlyStats[h]) hourlyStats[h] = { profit: 0, count: 0, wins: 0 };
          hourlyStats[h].profit += tradeNetPnl(t);
          hourlyStats[h].count++;
          if (tradeNetPnl(t) > 0) hourlyStats[h].wins++;
        }
      }

      const userId = getUserId(req);
      const userAccounts = await storage.getAccounts(userId);
      const relevantAccounts = accountId
        ? userAccounts.filter(a => a.id === accountId)
        : userAccounts;
      const reportedBalanceRaw = relevantAccounts.reduce((sum, a) => {
        const balance = toFiniteNumber(a.balance);
        const equity = toFiniteNumber(a.equity);
        return sum + (balance > 0 ? balance : equity);
      }, 0);
      const accountEquityRaw = relevantAccounts.reduce((sum, a) => {
        const balance = toFiniteNumber(a.balance);
        const equity = toFiniteNumber(a.equity);
        return sum + (equity > 0 ? equity : balance);
      }, 0);
      const depositBalanceRaw = relevantAccounts.length > 0
        ? relevantAccounts.reduce((sum, a) => {
            const balance = toFiniteNumber(a.balance);
            const equity = toFiniteNumber(a.equity);
            const referenceBalance = balance > 0 ? balance : equity;
            const storedStartingBalance =
              typeof a.startingBalance === "number" && Number.isFinite(a.startingBalance)
                ? a.startingBalance
                : null;
            const inferredStartingBalance = inferStartingBalanceFromAccountName(a.name, referenceBalance);
            const startingBalance = storedStartingBalance ?? inferredStartingBalance ?? referenceBalance;
            return sum + startingBalance;
          }, 0)
        : 0;
      const realizedBalanceRaw = depositBalanceRaw + tradeNetProfit;
      const accountBalanceRaw =
        reportedBalanceRaw > 0
          ? reportedBalanceRaw
          : accountEquityRaw > 0
          ? accountEquityRaw
          : realizedBalanceRaw;
      const floatingPnl = Math.round((accountEquityRaw - accountBalanceRaw) * 100) / 100;
      const balanceProfit = accountBalanceRaw - depositBalanceRaw;
      const equityProfit = accountEquityRaw - depositBalanceRaw;
      const balanceProfitPercent = depositBalanceRaw > 0 ? (balanceProfit / depositBalanceRaw) * 100 : 0;
      const equityProfitPercent = depositBalanceRaw > 0 ? (equityProfit / depositBalanceRaw) * 100 : 0;
      const netProfit = balanceProfit;

      const todayLocal = getDayKey(new Date());
      const todayTrades = closedTrades.filter(t => {
        if (!t.closeTime) return false;
        const tDate = getDayKey(t.closeTime);
        return tDate === todayLocal;
      });
      const todayPnl = Math.round(
        todayTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0) * 100,
      ) / 100;
      const todayStartingBalance = Math.round((accountBalanceRaw - todayPnl) * 100) / 100;
      const todayProfitPercent = todayStartingBalance !== 0 ? (todayPnl / todayStartingBalance) * 100 : 0;

      const todayRef = new Date(`${todayLocal}T12:00:00Z`);
      const mondayOffset = (todayRef.getUTCDay() + 6) % 7;
      const weekStartRef = new Date(todayRef);
      weekStartRef.setUTCDate(weekStartRef.getUTCDate() - mondayOffset);
      const weekStartKey = weekStartRef.toISOString().slice(0, 10);
      const monthStartKey = `${todayLocal.slice(0, 7)}-01`;

      let weeklyPnlRaw = 0;
      let monthlyPnlToDateRaw = 0;
      for (const [day, pnl] of Object.entries(dailyPnl)) {
        if (day >= weekStartKey && day <= todayLocal) {
          weeklyPnlRaw += pnl;
        }
        if (day >= monthStartKey && day <= todayLocal) {
          monthlyPnlToDateRaw += pnl;
        }
      }
      const weeklyPnl = Math.round(weeklyPnlRaw * 100) / 100;
      const monthlyPnlToDate = Math.round(monthlyPnlToDateRaw * 100) / 100;
      const weeklyStartingBalance = Math.round((accountBalanceRaw - weeklyPnl) * 100) / 100;
      const monthlyStartingBalance = Math.round((accountBalanceRaw - monthlyPnlToDate) * 100) / 100;
      const weeklyProfitPercent = weeklyStartingBalance !== 0 ? (weeklyPnl / weeklyStartingBalance) * 100 : 0;
      const monthlyProfitPercent = monthlyStartingBalance !== 0 ? (monthlyPnlToDate / monthlyStartingBalance) * 100 : 0;

      res.json({
        totalTrades: closedTrades.length,
        openTrades: openTrades.length,
        currentBalance: Math.round(accountBalanceRaw * 100) / 100,
        accountBalance: Math.round(accountBalanceRaw * 100) / 100,
        accountEquity: Math.round(accountEquityRaw * 100) / 100,
        depositBalance: Math.round(depositBalanceRaw * 100) / 100,
        balanceProfit: Math.round(balanceProfit * 100) / 100,
        balanceProfitPercent: Math.round(balanceProfitPercent * 100) / 100,
        equityProfit: Math.round(equityProfit * 100) / 100,
        equityProfitPercent: Math.round(equityProfitPercent * 100) / 100,
        floatingPnl,
        todayPnl,
        todayStartingBalance,
        todayProfitPercent: Math.round(todayProfitPercent * 100) / 100,
        weeklyPnl,
        weeklyStartingBalance,
        weeklyProfitPercent: Math.round(weeklyProfitPercent * 100) / 100,
        monthStartKey,
        monthlyPnlToDate,
        monthlyStartingBalance,
        monthlyProfitPercent: Math.round(monthlyProfitPercent * 100) / 100,
        winRate: closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 10000) / 100 : 0,
        totalProfit: Math.round(balanceProfit * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        tradeNetProfit: Math.round(tradeNetProfit * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalSwap: Math.round(totalSwap * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        profitFactor,
        bestTrade: bestTrade ? { symbol: bestTrade.symbol, profit: tradeNetPnl(bestTrade), type: bestTrade.type, pips: bestTrade.pips, closeTime: bestTrade.closeTime } : null,
        worstTrade: worstTrade ? { symbol: worstTrade.symbol, profit: tradeNetPnl(worstTrade), type: worstTrade.type, pips: worstTrade.pips, closeTime: worstTrade.closeTime } : null,
        avgRR,
        wins: wins.length,
        losses: losses.length,
        breakeven: closedTrades.length - wins.length - losses.length,
        maxWinStreak,
        maxLossStreak,
        currentWinStreak,
        currentLossStreak,
        maxDrawdown,
        avgDuration,
        longTrades: longTrades.length,
        shortTrades: shortTrades.length,
        longWinRate,
        shortWinRate,
        longProfit,
        shortProfit,
        symbolStats: Object.entries(symbolStats).map(([symbol, s]) => ({
          symbol,
          count: s.count,
          profit: Math.round(s.profit * 100) / 100,
          wins: s.wins,
          winRate: Math.round((s.wins / s.count) * 10000) / 100,
          avgDuration: Math.round(s.totalDuration / s.count),
        })),
        equityCurve,
        monthlyPnl: Object.entries(monthlyPnl)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, d]) => ({
            month,
            profit: Math.round(d.profit * 100) / 100,
            trades: d.trades,
            winRate: Math.round((d.wins / d.trades) * 10000) / 100,
          })),
        sessionStats: Object.entries(sessionStats).map(([session, d]) => ({
          session,
          profit: Math.round(d.profit * 100) / 100,
          trades: d.trades,
          winRate: d.trades > 0 ? Math.round((d.wins / d.trades) * 10000) / 100 : 0,
        })),
        hourlyStats: Object.entries(hourlyStats)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([hour, d]) => ({
            hour: Number(hour),
            profit: Math.round(d.profit * 100) / 100,
            count: d.count,
            winRate: d.count > 0 ? Math.round((d.wins / d.count) * 10000) / 100 : 0,
          })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/playbook", localOnly, async (req, res) => {
    try {
      const rules = await storage.getPlaybookRules(getUserId(req));
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/playbook", localOnly, async (req, res) => {
    try {
      const parsed = insertPlaybookRuleSchema.parse(req.body);
      const userId = getUserId(req);
      const rule = await storage.createPlaybookRule({ ...parsed, userId });
      publishRealtimeUpdateForUser(userId, "playbook_rule_created", "playbook");
      res.json(rule);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/playbook/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyPlaybookOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Rule not found" });
      const parsed = updatePlaybookRuleSchema.parse(req.body);
      const rule = await storage.updatePlaybookRule(getRouteParam(req.params.id), parsed);
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      publishRealtimeUpdateForUser(userId, "playbook_rule_updated", "playbook");
      res.json(rule);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/playbook/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyPlaybookOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Rule not found" });
      await storage.deletePlaybookRule(getRouteParam(req.params.id));
      publishRealtimeUpdateForUser(userId, "playbook_rule_deleted", "playbook");
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/goals", localOnly, async (req, res) => {
    try {
      const goals = await storage.getPerformanceGoals(getUserId(req));
      res.json(goals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/goals", localOnly, async (req, res) => {
    try {
      const parsed = normalizeGoalPayload(insertPerformanceGoalSchema.parse(req.body));
      const userId = getUserId(req);
      const existing = await storage.getPerformanceGoalByPeriod(parsed.periodType, parsed.periodKey, userId);
      if (existing) {
        const updated = await storage.updatePerformanceGoal(existing.id, parsed);
        publishRealtimeUpdateForUser(userId, "performance_goal_updated", "goals");
        return res.json(updated);
      }
      const goal = await storage.createPerformanceGoal({ ...parsed, userId });
      publishRealtimeUpdateForUser(userId, "performance_goal_created", "goals");
      res.json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/goals/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyGoalOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Goal not found" });
      const parsed = updatePerformanceGoalSchema.parse(req.body);
      const existingGoal = await storage.getPerformanceGoal(getRouteParam(req.params.id));
      if (!existingGoal) return res.status(404).json({ message: "Goal not found" });
      const payload = normalizeGoalPayload({
        ...existingGoal,
        ...parsed,
      });
      const goal = await storage.updatePerformanceGoal(getRouteParam(req.params.id), payload);
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      publishRealtimeUpdateForUser(userId, "performance_goal_updated", "goals");
      res.json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/goals/:id", localOnly, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!(await verifyGoalOwnership(getRouteParam(req.params.id), userId))) return res.status(404).json({ message: "Goal not found" });
      await storage.deletePerformanceGoal(getRouteParam(req.params.id));
      publishRealtimeUpdateForUser(userId, "performance_goal_deleted", "goals");
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/reports", localOnly, async (req, res) => {
    try {
      const period = (req.query.period as string) || "daily";
      let userTz = (req.query.timezone as string) || "UTC";
      try {
        new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: userTz,
        });
      } catch {
        userTz = "UTC";
      }
      const reportPeriodType: GoalPeriodType =
        period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "daily";
      const dateStr = (req.query.date as string) || getDayKeyInTimezone(new Date(), userTz);
      const accountId = req.query.accountId as string | undefined;
      const userId = getUserId(req);

      const refDate = new Date(dateStr + "T12:00:00Z");
      let startDate: Date;
      let endDate: Date;
      let periodLabel: string;
      let periodKey: string;

      if (period === "weekly") {
        periodKey = getWeekKeyInTimezone(refDate, userTz);
        startDate = new Date(`${periodKey}T00:00:00.000Z`);
        endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 7);
        periodLabel = `Week of ${periodKey}`;
      } else if (period === "monthly") {
        periodKey = getMonthKeyInTimezone(refDate, userTz);
        startDate = new Date(`${periodKey}-01T00:00:00.000Z`);
        endDate = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1));
        periodLabel = startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      } else {
        periodKey = getDayKeyInTimezone(refDate, userTz);
        startDate = new Date(dateStr + "T00:00:00.000Z");
        endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        periodLabel = new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      }

      const allTrades = await storage.getTradesByUser(userId, accountId);
      const periodTrades = allTrades.filter((t) => {
        if (!t.isClosed || !t.closeTime) return false;
        const ct = new Date(t.closeTime);
        return ct >= startDate && ct < endDate;
      });

      const wins = periodTrades.filter((t) => tradeNetPnl(t) > 0);
      const losses = periodTrades.filter((t) => tradeNetPnl(t) < 0);
      const breakeven = periodTrades.filter((t) => tradeNetPnl(t) === 0);
      const grossProfit = periodTrades.reduce((s, t) => s + Math.max(0, tradeNetPnl(t)), 0);
      const grossLoss = periodTrades.reduce((s, t) => s + Math.min(0, tradeNetPnl(t)), 0);
      const netProfit = periodTrades.reduce((s, t) => s + tradeNetPnl(t), 0);
      const totalCommission = periodTrades.reduce((s, t) => s + toFiniteNumber(t.commission), 0);
      const totalSwap = periodTrades.reduce((s, t) => s + toFiniteNumber(t.swap), 0);
      const winRate = periodTrades.length > 0 ? Math.round((wins.length / periodTrades.length) * 10000) / 100 : 0;
      const avgWin = wins.length > 0 ? Math.round((grossProfit / wins.length) * 100) / 100 : 0;
      const avgLoss = losses.length > 0 ? Math.round((Math.abs(grossLoss) / losses.length) * 100) / 100 : 0;
      const profitFactor =
        Math.abs(grossLoss) > 0
          ? Math.round((grossProfit / Math.abs(grossLoss)) * 100) / 100
          : grossProfit > 0
          ? PERFECT_PROFIT_FACTOR
          : 0;

      const sortedByProfit = [...periodTrades].sort((a, b) => tradeNetPnl(b) - tradeNetPnl(a));
      const bestTrade = sortedByProfit.length > 0 ? sortedByProfit[0] : null;
      const worstTrade = sortedByProfit.length > 0 ? sortedByProfit[sortedByProfit.length - 1] : null;

      const symbolStats: Record<string, { count: number; profit: number; wins: number }> = {};
      for (const t of periodTrades) {
        const bucket = symbolStats[t.symbol] || { count: 0, profit: 0, wins: 0 };
        bucket.count += 1;
        bucket.profit += tradeNetPnl(t);
        if (tradeNetPnl(t) > 0) bucket.wins += 1;
        symbolStats[t.symbol] = bucket;
      }

      const dailyPnl: Record<string, { profit: number; trades: number; wins: number }> = {};
      for (const t of periodTrades) {
        if (t.closeTime) {
          const day = getDayKeyInTimezone(t.closeTime, userTz);
          if (!dailyPnl[day]) dailyPnl[day] = { profit: 0, trades: 0, wins: 0 };
          dailyPnl[day].profit += tradeNetPnl(t);
          dailyPnl[day].trades++;
          if (tradeNetPnl(t) > 0) dailyPnl[day].wins++;
        }
      }

      const emotionCounts: Record<string, number> = {};
      const journaledTrades = periodTrades.filter((t) => t.reason || t.logic || t.emotion);
      for (const t of periodTrades) {
        if (t.emotion) {
          emotionCounts[t.emotion] = (emotionCounts[t.emotion] || 0) + 1;
        }
      }

      const activeGoal = await storage.getPerformanceGoalByPeriod(reportPeriodType, periodKey, userId);

      let goalCompliance: any = null;
      if (activeGoal) {
        const sortedPeriodTrades = [...periodTrades].sort((a, b) => {
          const aTime = a.closeTime ? new Date(a.closeTime).getTime() : 0;
          const bTime = b.closeTime ? new Date(b.closeTime).getTime() : 0;
          return aTime - bTime;
        });
        let runningNet = 0;
        let minNet = 0;
        for (const trade of sortedPeriodTrades) {
          runningNet += tradeNetPnl(trade);
          minNet = Math.min(minNet, runningNet);
        }
        const lossFromStart = Math.abs(minNet);

        const dailyTradesCounts: Record<string, number> = {};
        const dailyNetByDay: Record<string, number> = {};
        periodTrades.forEach((t) => {
          const day = getDayKeyInTimezone(t.closeTime as string | Date, userTz);
          dailyTradesCounts[day] = (dailyTradesCounts[day] || 0) + 1;
          dailyNetByDay[day] = (dailyNetByDay[day] || 0) + tradeNetPnl(t);
        });
        const maxDailyTrades = Math.max(0, ...Object.values(dailyTradesCounts));
        const maxDailyLossActual = Object.values(dailyNetByDay).length > 0
          ? Math.max(0, ...Object.values(dailyNetByDay).map((value) => Math.max(0, -value)))
          : 0;
        const elapsedRatio = (() => {
          const now = Date.now();
          const startMs = startDate.getTime();
          const endMs = endDate.getTime();
          if (now <= startMs) return 0;
          if (now >= endMs) return 1;
          return (now - startMs) / Math.max(1, endMs - startMs);
        })();
        const metricStatuses = [
          activeGoal.profitTarget != null ? netProfit >= activeGoal.profitTarget : null,
          activeGoal.dailyTarget != null
            ? (Object.keys(dailyPnl).length > 0
              ? netProfit / Math.max(1, Object.keys(dailyPnl).length)
              : 0) >= activeGoal.dailyTarget
            : null,
          activeGoal.maxLoss != null ? lossFromStart <= activeGoal.maxLoss : null,
          activeGoal.maxDailyLoss != null ? maxDailyLossActual <= activeGoal.maxDailyLoss : null,
          activeGoal.winRateTarget != null ? winRate >= activeGoal.winRateTarget : null,
          activeGoal.maxTradesPerDay != null ? maxDailyTrades <= activeGoal.maxTradesPerDay : null,
        ].filter((value): value is boolean => value !== null);
        const periodClosed = elapsedRatio >= 1;

        goalCompliance = {
          periodType: reportPeriodType,
          periodKey,
          month: reportPeriodType === "monthly" ? periodKey : null,
          periodClosed,
          achieved: metricStatuses.length > 0 ? metricStatuses.every(Boolean) : null,
          profitTarget: activeGoal.profitTarget,
          actualProfit: Math.round(netProfit * 100) / 100,
          profitOnTrack: activeGoal.profitTarget != null ? netProfit >= (activeGoal.profitTarget * elapsedRatio) : null,
          dailyTarget: activeGoal.dailyTarget,
          actualDailyProfit: Math.round(
            ((Object.keys(dailyPnl).length > 0 ? netProfit / Math.max(1, Object.keys(dailyPnl).length) : netProfit) * 100),
          ) / 100,
          maxLoss: activeGoal.maxLoss,
          actualLoss: Math.round(lossFromStart * 100) / 100,
          lossWithinLimit: activeGoal.maxLoss != null ? lossFromStart <= activeGoal.maxLoss : null,
          maxDailyLoss: activeGoal.maxDailyLoss,
          actualMaxDailyLoss: Math.round(maxDailyLossActual * 100) / 100,
          dailyLossWithinLimit: activeGoal.maxDailyLoss != null ? maxDailyLossActual <= activeGoal.maxDailyLoss : null,
          winRateTarget: activeGoal.winRateTarget,
          actualWinRate: winRate,
          winRateMet: activeGoal.winRateTarget != null ? winRate >= activeGoal.winRateTarget : null,
          maxTradesPerDay: activeGoal.maxTradesPerDay,
          actualMaxDailyTrades: maxDailyTrades,
          tradesPerDayMet: activeGoal.maxTradesPerDay != null ? maxDailyTrades <= activeGoal.maxTradesPerDay : null,
        };
      }

      const rules = await storage.getPlaybookRules(userId);
      const activeRules = rules.filter((r) => r.isActive);
      const journalRate = periodTrades.length > 0
        ? Math.round((journaledTrades.length / periodTrades.length) * 100)
        : 0;

      const ruleCompliance = activeRules.map((rule) => ({
        id: rule.id,
        category: rule.category,
        title: rule.title,
        isActive: rule.isActive,
      }));

      const suggestions: string[] = [];

      if (periodTrades.length >= 3) {
        if (winRate < 40) {
          suggestions.push("Your win rate is below 40%. Consider being more selective with entries and only taking A+ setups that match your playbook.");
        } else if (winRate >= 65) {
          suggestions.push("Excellent win rate of " + winRate + "%! Your entry criteria is working well. Focus on optimizing your risk-reward to maximize gains.");
        }

        if (profitFactor > 0 && profitFactor < 1) {
          suggestions.push("Your profit factor is below 1.0, meaning you're losing more than you're winning in dollar terms. Review your stop loss and take profit placement.");
        } else if (isPerfectProfitFactor(profitFactor)) {
          suggestions.push("Perfect profit factor. Every closed trade in this period was profitable after costs.");
        } else if (profitFactor >= 2) {
          suggestions.push("Strong profit factor of " + profitFactor + ". Your risk management is solid. Consider if you can scale up position sizes while maintaining this edge.");
        }

        if (avgLoss > 0 && avgWin > 0 && avgWin / avgLoss < 1) {
          suggestions.push("Your average win ($" + avgWin.toFixed(2) + ") is smaller than your average loss ($" + avgLoss.toFixed(2) + "). Try letting winners run longer or tightening your stop losses.");
        }

        const longTrades = periodTrades.filter((t) => t.type === "BUY");
        const shortTrades = periodTrades.filter((t) => t.type === "SELL");
        if (longTrades.length > 0 && shortTrades.length > 0) {
          const longWR = Math.round((longTrades.filter((t) => tradeNetPnl(t) > 0).length / longTrades.length) * 100);
          const shortWR = Math.round((shortTrades.filter((t) => tradeNetPnl(t) > 0).length / shortTrades.length) * 100);
          if (Math.abs(longWR - shortWR) > 20) {
            const better = longWR > shortWR ? "long" : "short";
            const worse = longWR > shortWR ? "short" : "long";
            suggestions.push(`Your ${better} trades (${Math.max(longWR, shortWR)}% WR) significantly outperform ${worse} trades (${Math.min(longWR, shortWR)}% WR). Consider focusing more on ${better} setups.`);
          }
        }

        const symbolArr = Object.entries(symbolStats);
        if (symbolArr.length > 1) {
          const rankedSymbols = [...symbolArr].sort((a, b) => b[1].profit - a[1].profit);
          const bestSymbol = rankedSymbols[0];
          const worstSymbol = rankedSymbols[rankedSymbols.length - 1];
          if (bestSymbol && bestSymbol[1].profit > 0) {
            suggestions.push(`${bestSymbol[0]} is your most profitable instrument (+$${bestSymbol[1].profit.toFixed(2)} from ${bestSymbol[1].count} trades). Consider increasing your focus here.`);
          }
          if (worstSymbol && worstSymbol[1].profit < 0 && worstSymbol[1].count >= 2) {
            suggestions.push(`${worstSymbol[0]} is costing you money (-$${Math.abs(worstSymbol[1].profit).toFixed(2)} from ${worstSymbol[1].count} trades). Review your edge on this instrument or reduce exposure.`);
          }
        }

        const emotionArr = Object.entries(emotionCounts);
        if (emotionArr.length > 0) {
          const topEmotion = [...emotionArr].sort((a, b) => b[1] - a[1])[0];
          const negativeEmotions = ["fearful", "greedy", "anxious", "frustrated", "revenge", "fomo"];
          if (topEmotion && negativeEmotions.includes(topEmotion[0])) {
            suggestions.push(`Your most frequent trading emotion is "${topEmotion[0]}" (${topEmotion[1]} trades). This negative emotion pattern may be hurting your performance. Consider taking breaks and reviewing your psychology rules.`);
          } else if (topEmotion && (topEmotion[0] === "disciplined" || topEmotion[0] === "calm")) {
            suggestions.push(`Great mental state! "${topEmotion[0]}" was your dominant emotion (${topEmotion[1]} trades). This discipline is key to long-term profitability.`);
          }
        }

        if (journalRate < 50 && periodTrades.length >= 2) {
          suggestions.push(`Only ${journalRate}% of your trades have journal entries. Documenting your reason, logic, and emotions for every trade is essential for improvement.`);
        } else if (journalRate >= 90) {
          suggestions.push("Excellent journaling discipline! " + journalRate + "% of your trades are documented. This habit is what separates successful traders.");
        }

        if (losses.length >= 3) {
          let consecutive = 0;
          let maxConsecutive = 0;
          const sorted = [...periodTrades].sort((a, b) => new Date(a.closeTime || 0).getTime() - new Date(b.closeTime || 0).getTime());
          for (const t of sorted) {
            if (tradeNetPnl(t) < 0) { consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
            else { consecutive = 0; }
          }
          if (maxConsecutive >= 3) {
            suggestions.push(`You had ${maxConsecutive} consecutive losses in this period. Consider implementing a daily loss limit and stepping away after 3 consecutive losses.`);
          }
        }

        const dayPnlArr = Object.entries(dailyPnl);
        if (dayPnlArr.length > 0) {
          const worstDay = [...dayPnlArr].sort((a, b) => a[1].profit - b[1].profit)[0];
          if (worstDay && worstDay[1].profit < -50) {
            const dayName = new Date(worstDay[0]).toLocaleDateString("en-US", { weekday: "long" });
            suggestions.push(`Your worst day was ${dayName} with $${worstDay[1].profit.toFixed(2)}. Review what went wrong and whether you followed your playbook rules.`);
          }
        }

        if (goalCompliance) {
          if (goalCompliance.profitOnTrack === false) {
            suggestions.push(`You're behind on your ${reportPeriodType} profit target. Focus on quality over quantity and only take your highest-conviction setups.`);
          }
          if (goalCompliance.lossWithinLimit === false) {
            suggestions.push(`Warning: you've exceeded your ${reportPeriodType} max loss limit. Reduce exposure or pause until your process is stable again.`);
          }
          if (goalCompliance.tradesPerDayMet === false) {
            suggestions.push(`You exceeded your max trades per day limit (${goalCompliance.actualMaxDailyTrades} vs ${goalCompliance.maxTradesPerDay} target). Overtrading often leads to lower quality entries.`);
          }
          if (goalCompliance.dailyLossWithinLimit === false) {
            suggestions.push(`At least one day exceeded your daily loss guardrail (${goalCompliance.actualMaxDailyLoss} vs ${goalCompliance.maxDailyLoss} target). Tighten your stop-trading rule once the daily limit is hit.`);
          }
        }
      } else if (periodTrades.length === 0) {
        suggestions.push("No trades found for this period. Use this time to review your playbook, study charts, and prepare for your next trading session.");
      } else {
        suggestions.push("Limited data for this period (" + periodTrades.length + " trade" + (periodTrades.length > 1 ? "s" : "") + "). Keep trading and journaling consistently for more meaningful insights.");
      }

      res.json({
        period,
        periodLabel,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        generatedAt: new Date().toISOString(),
        summary: {
          totalTrades: periodTrades.length,
          wins: wins.length,
          losses: losses.length,
          breakeven: breakeven.length,
          winRate,
          grossProfit: Math.round(grossProfit * 100) / 100,
          grossLoss: Math.round(Math.abs(grossLoss) * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          totalCommission: Math.round(totalCommission * 100) / 100,
          totalSwap: Math.round(totalSwap * 100) / 100,
          avgWin,
          avgLoss,
          profitFactor,
          bestTrade: bestTrade ? { symbol: bestTrade.symbol, profit: tradeNetPnl(bestTrade), type: bestTrade.type } : null,
          worstTrade: worstTrade ? { symbol: worstTrade.symbol, profit: tradeNetPnl(worstTrade), type: worstTrade.type } : null,
        },
        symbolBreakdown: Object.entries(symbolStats).map(([symbol, s]) => ({
          symbol,
          count: s.count,
          profit: Math.round(s.profit * 100) / 100,
          winRate: s.count > 0 ? Math.round((s.wins / s.count) * 100) : 0,
        })),
        dailyBreakdown: Object.entries(dailyPnl)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, d]) => ({
            date,
            profit: Math.round(d.profit * 100) / 100,
            trades: d.trades,
            winRate: d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0,
          })),
        emotionSummary: Object.entries(emotionCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([emotion, count]) => ({ emotion, count })),
        journalRate,
        goalCompliance,
        ruleCompliance,
        suggestions,
        trades: periodTrades.map((t) => ({
          id: t.id,
          symbol: t.symbol,
          type: t.type,
          openTime: t.openTime,
          closeTime: t.closeTime,
          volume: t.volume,
          profit: tradeNetPnl(t),
          pips: t.pips,
          reason: t.reason,
          logic: t.logic,
          emotion: t.emotion,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const CALENDAR_CACHE_TTL = 15 * 60 * 1000;

  app.get("/api/calendar/ai", localOnly, async (req, res) => {
    try {
      const timezone = typeof req.query.timezone === "string" ? req.query.timezone : undefined;
      const date =
        typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : undefined;
      const provider =
        req.query.provider === "gemini" || req.query.provider === "grok"
          ? req.query.provider
          : undefined;
      const forceRefresh =
        String(req.query.forceRefresh || "").toLowerCase() === "true" ||
        String(req.query.forceRefresh || "") === "1";

      const events = await loadCalendarFeed(forceRefresh);
      const brief = await calendarAiService.generateDailyBrief({
        events,
        date,
        timezone,
        provider,
        forceRefresh,
      });
      return res.json(brief);
    } catch (error: any) {
      return res.status(500).json({ message: error.message || "Failed to generate calendar brief" });
    }
  });

  app.get("/api/calendar", localOnly, async (req, res) => {
    try {
      res.json(await loadCalendarFeed());
    } catch (error: any) {
      if (!calendarCache) {
        calendarCache = await storage.getCalendarCache();
      }
      if (calendarCache) {
        return res.json(calendarCache.data);
      }
      res.json([]);
    }
  });

  // Register professional routes (alerts, compliance, etc.)
  app.use("/api", professionalsRouter);

  return httpServer;
}

