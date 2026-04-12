import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";
import { Logger } from "./logging";
import { decrypt, encrypt } from "./crypto";
import type {
  Mt5Account,
  AiAnalysisLog,
  DashboardReflection,
  StrategyConceptNote,
  InsertStrategyConceptNote,
  InsertAiAnalysisLog,
  InsertTrade,
  Trade,
  TradeNote,
  InsertTradeNote,
  PlaybookRule,
  InsertPlaybookRule,
  PerformanceGoal,
  InsertPerformanceGoal,
  BacktestCandleCache,
  BacktestSymbol,
  BacktestTimeframe,
} from "@shared/schema";
import {
  calculateTradePips,
  buildScreenshotUrl,
  extractScreenshotFilename,
} from "@shared/trade-utils";
import {
  supabaseAdmin,
  supabaseEnabled,
  SUPABASE_STATE_KEY,
  SUPABASE_STATE_TABLE,
} from "./supabase";

export type LocalUserProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  timezone: string;
  dashboardNotes: string | null;
  dashboardLessons: string | null;
  dashboardMistakes: string | null;
  dashboardWeaknesses: string | null;
  dashboardUpdatedAt: string | null;
  authProvider: "local";
  createdAt: string;
  updatedAt: string;
};

export type AlertType =
  | "loss"
  | "profit"
  | "drawdown"
  | "trades_count"
  | "rule_violation"
  | "goal_missed";

export type AlertCondition = "exceeds" | "falls_below" | "equals";

export type AlertChannelConfig = {
  discord?: { webhookUrl?: string; enabled?: boolean };
  slack?: { webhookUrl?: string; enabled?: boolean };
  email?: { addresses?: string[]; enabled?: boolean };
  push?: { enabled?: boolean };
  webhook?: { url?: string; enabled?: boolean };
};

export type AlertConfigRecord = {
  id: string;
  userId: string;
  accountId: string | null;
  name: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: number;
  channels: AlertChannelConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AlertHistoryRecord = {
  id: string;
  configId: string;
  userId: string;
  accountId: string | null;
  title: string;
  message: string;
  channels: AlertChannelConfig;
  status: "sent" | "failed" | "pending";
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
};

export type TradeTemplateRecord = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: "scalp" | "intraday" | "swing" | "custom";
  symbol: string | null;
  symbols: string[];
  type: "BUY" | "SELL" | null;
  reason: string | null;
  logic: string | null;
  emotion: string | null;
  typicalRiskPips: number | null;
  typicalRewardPips: number | null;
  entryChecklist: string[];
  exitChecklist: string[];
  isPublic: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ComplianceLogRecord = {
  id: string;
  tradeId: string;
  ruleId: string;
  userId: string;
  accountId: string | null;
  ruleName: string;
  followed: boolean;
  notes: string | null;
  loggedAt: string;
};

export type BacktestResultRecord = {
  id: string;
  userId: string;
  accountId: string | null;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  strategyName: string;
  strategyDescription: string | null;
  parameters: Record<string, unknown> | null;
  initialCapital: number;
  finalCapital: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  netProfit: number;
  totalReturn: number;
  totalReturnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  recoveryFactor: number;
  profitFactor: number;
  riskRewardRatio: number;
  avgWin: number;
  avgLoss: number;
  avgHoldingTime: string;
  bestTrade: number;
  worstTrade: number;
  consecutiveLosingTrades: number;
  equityCurve: Array<{ time: string; equity: number; drawdown: number }>;
  monthlyReturns: Array<{ month: string; return: number }>;
  monthlyHeatmap: Record<string, number>;
  trades: unknown[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarCacheRecord = {
  data: unknown;
  fetchedAt: number;
};

export type StrategyConceptNoteRecord = StrategyConceptNote;

function toDashboardReflection(user: LocalUserProfile): DashboardReflection {
  return {
    userId: user.id,
    notes: user.dashboardNotes ?? null,
    lessons: user.dashboardLessons ?? null,
    mistakes: user.dashboardMistakes ?? null,
    weaknesses: user.dashboardWeaknesses ?? null,
    updatedAt: user.dashboardUpdatedAt ?? user.updatedAt,
  };
}

type LocalDatabase = {
  users: LocalUserProfile[];
  accounts: Mt5Account[];
  trades: Trade[];
  tradeNotes: TradeNote[];
  playbookRules: PlaybookRule[];
  performanceGoals: PerformanceGoal[];
  backtestCandleCache: BacktestCandleCache[];
  aiAnalysisLogs: AiAnalysisLog[];
  alertConfigs: AlertConfigRecord[];
  alertHistory: AlertHistoryRecord[];
  tradeTemplates: TradeTemplateRecord[];
  complianceLogs: ComplianceLogRecord[];
  backtestResults: BacktestResultRecord[];
  strategyConceptNotes: StrategyConceptNoteRecord[];
  calendarCache: CalendarCacheRecord | null;
};

function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/i.test(value);
}

function decryptSecret(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return isEncryptedSecret(value) ? decrypt(value) : value;
}

function encryptSecret(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return isEncryptedSecret(value) ? value : encrypt(value);
}

function isRemoteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function toStoredTrade(trade: Trade): Trade {
  const screenshotUrl = isRemoteUrl(trade.screenshotUrl)
    ? trade.screenshotUrl
    : extractScreenshotFilename(trade.screenshotUrl);
  return {
    ...trade,
    screenshotUrl,
  };
}

function toPublicTrade(trade: Trade): Trade {
  const hasClosedPrices =
    Boolean(trade.isClosed) &&
    typeof trade.openPrice === "number" &&
    Number.isFinite(trade.openPrice) &&
    typeof trade.closePrice === "number" &&
    Number.isFinite(trade.closePrice);

  return {
    ...trade,
    pips: hasClosedPrices
      ? calculateTradePips(trade.symbol, trade.type, trade.openPrice, trade.closePrice as number)
      : trade.pips ?? null,
    screenshotUrl: buildScreenshotUrl(trade.screenshotUrl),
  };
}

function toStoredStrategyConceptNote(note: StrategyConceptNoteRecord): StrategyConceptNoteRecord {
  const imageUrl = isRemoteUrl(note.imageUrl) ? note.imageUrl : extractScreenshotFilename(note.imageUrl);
  return {
    ...note,
    imageUrl,
  };
}

function toPublicStrategyConceptNote(note: StrategyConceptNoteRecord): StrategyConceptNoteRecord {
  return {
    ...note,
    imageUrl: buildScreenshotUrl(note.imageUrl),
  };
}

function toStoredAccount(account: Mt5Account): Mt5Account {
  return {
    ...account,
    investorPassword: encryptSecret(account.investorPassword) || "",
    apiKey: encryptSecret(account.apiKey),
  };
}

function toPublicAccount(account: Mt5Account): Mt5Account {
  return {
    ...account,
    investorPassword: decryptSecret(account.investorPassword) || "",
    apiKey: decryptSecret(account.apiKey),
  };
}

function normalizePerformanceGoalRecord(goal: Partial<PerformanceGoal>): PerformanceGoal {
  const rawPeriodType = typeof goal.periodType === "string" ? goal.periodType : "";
  const periodType =
    rawPeriodType === "daily" || rawPeriodType === "weekly" || rawPeriodType === "monthly"
      ? rawPeriodType
      : "monthly";
  const legacyMonth = typeof goal.month === "string" && goal.month.trim() ? goal.month.trim() : null;
  const periodKey =
    typeof goal.periodKey === "string" && goal.periodKey.trim()
      ? goal.periodKey.trim()
      : legacyMonth || nowIso().slice(0, 7);

  return {
    ...goal,
    id: String(goal.id || randomUUID()),
    userId: goal.userId ?? "local-user",
    periodType,
    periodKey,
    month: periodType === "monthly" ? legacyMonth || periodKey : null,
    createdAt: goal.createdAt ?? nowIso(),
  } as PerformanceGoal;
}

function resolveDataPath() {
  const baseDir =
    process.env.LOCAL_DATA_DIR ||
    path.join(process.cwd(), ".mytradebook-data");
  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, "data.json");
}

function nowIso() {
  return new Date().toISOString();
}

function toMillis(value: unknown) {
  if (!value) return 0;
  return new Date(value instanceof Date ? value : String(value)).getTime();
}

function defaultUser(): LocalUserProfile {
  const now = nowIso();
  return {
    id: "local-user",
    email: "local@device",
    firstName: "Local",
    lastName: "User",
    profileImageUrl: null,
    timezone: "UTC",
    dashboardNotes: null,
    dashboardLessons: null,
    dashboardMistakes: null,
    dashboardWeaknesses: null,
    dashboardUpdatedAt: null,
    authProvider: "local",
    createdAt: now,
    updatedAt: now,
  };
}

function defaultDb(): LocalDatabase {
  return {
    users: [defaultUser()],
    accounts: [],
    trades: [],
    tradeNotes: [],
    playbookRules: [],
    performanceGoals: [],
    backtestCandleCache: [],
    aiAnalysisLogs: [],
    alertConfigs: [],
    alertHistory: [],
    tradeTemplates: [],
    complianceLogs: [],
    backtestResults: [],
    strategyConceptNotes: [],
    calendarCache: null,
  };
}

class LocalDbStore {
  private readonly filePath = resolveDataPath();
  private readonly backupDir = path.join(path.dirname(this.filePath), "backups");
  private readonly backupIntervalMs = 5 * 60 * 1000;
  private readonly maxBackups = 20;
  private lastBackupAt = 0;
  private data: LocalDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private ensureLoaded() {
    if (this.data) return;

    if (!fs.existsSync(this.filePath)) {
      this.data = defaultDb();
      this.persist();
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const hydrated: LocalDatabase = {
        ...defaultDb(),
        ...parsed,
      };
      hydrated.users = (hydrated.users || []).map((user) => ({
        ...defaultUser(),
        ...user,
        authProvider: "local",
      }));
      if (!Array.isArray(hydrated.users) || hydrated.users.length === 0) {
        hydrated.users = [defaultUser()];
      }
      if (!Array.isArray(hydrated.aiAnalysisLogs)) {
        hydrated.aiAnalysisLogs = [];
      }
      if (!Array.isArray(hydrated.alertConfigs)) {
        hydrated.alertConfigs = [];
      }
      if (!Array.isArray(hydrated.alertHistory)) {
        hydrated.alertHistory = [];
      }
      if (!Array.isArray(hydrated.tradeTemplates)) {
        hydrated.tradeTemplates = [];
      }
      if (!Array.isArray(hydrated.complianceLogs)) {
        hydrated.complianceLogs = [];
      }
      if (!Array.isArray(hydrated.backtestResults)) {
        hydrated.backtestResults = [];
      }
      if (!Array.isArray(hydrated.strategyConceptNotes)) {
        hydrated.strategyConceptNotes = [];
      }
      hydrated.accounts = Array.isArray(hydrated.accounts)
        ? hydrated.accounts.map((account) => toStoredAccount(account as Mt5Account))
        : [];
      hydrated.trades = Array.isArray(hydrated.trades)
        ? hydrated.trades.map((trade) => toStoredTrade(trade as Trade))
        : [];
      hydrated.performanceGoals = Array.isArray(hydrated.performanceGoals)
        ? hydrated.performanceGoals.map((goal) => normalizePerformanceGoalRecord(goal as PerformanceGoal))
        : [];
      hydrated.strategyConceptNotes = Array.isArray(hydrated.strategyConceptNotes)
        ? hydrated.strategyConceptNotes.map((note) => toStoredStrategyConceptNote(note as StrategyConceptNoteRecord))
        : [];
      hydrated.calendarCache =
        hydrated.calendarCache &&
        typeof hydrated.calendarCache === "object" &&
        typeof hydrated.calendarCache.fetchedAt === "number"
          ? hydrated.calendarCache
          : null;
      this.data = hydrated;
      this.persist();
    } catch {
      this.data = defaultDb();
      this.persist();
    }
  }

  private maybeBackupCurrentData() {
    if (!fs.existsSync(this.filePath)) return;
    const now = Date.now();
    if (now - this.lastBackupAt < this.backupIntervalMs) return;

    fs.mkdirSync(this.backupDir, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(this.backupDir, `data-${stamp}.json`);
    fs.copyFileSync(this.filePath, backupFile);
    this.lastBackupAt = now;

    const backups = fs
      .readdirSync(this.backupDir)
      .filter((name) => name.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));

    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const remaining: string[] = [];
    for (const name of backups) {
      const target = path.join(this.backupDir, name);
      try {
        const stat = fs.statSync(target);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(target);
          continue;
        }
      } catch {
        continue;
      }
      remaining.push(name);
    }

    const removeCount = Math.max(0, remaining.length - this.maxBackups);
    for (let i = 0; i < removeCount; i++) {
      const filename = remaining[i];
      if (!filename) continue;
      const target = path.join(this.backupDir, filename);
      try {
        fs.unlinkSync(target);
      } catch {
        // Best effort.
      }
    }
  }

  private persist() {
    if (!this.data) return;
    const tmpPath = this.filePath + '.tmp';
    try {
      this.maybeBackupCurrentData();
      // Write to temporary file first
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
      // Atomic rename (overwrite) the actual file
      fs.renameSync(tmpPath, this.filePath);
    } catch (error) {
      // Clean up temp file if rename failed
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // Best effort cleanup.
        }
      }
      throw error;
    }
  }

  private async maybeBackupCurrentDataAsync() {
    if (!fs.existsSync(this.filePath)) return;
    const now = Date.now();
    if (now - this.lastBackupAt < this.backupIntervalMs) return;

    await fsp.mkdir(this.backupDir, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(this.backupDir, `data-${stamp}.json`);
    await fsp.copyFile(this.filePath, backupFile);
    this.lastBackupAt = now;

    const backups = (await fsp.readdir(this.backupDir))
      .filter((name) => name.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));

    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const remaining: string[] = [];
    for (const name of backups) {
      const target = path.join(this.backupDir, name);
      try {
        const stat = await fsp.stat(target);
        if (stat.mtimeMs < cutoff) {
          await fsp.unlink(target);
          continue;
        }
      } catch {
        continue;
      }
      remaining.push(name);
    }

    const removeCount = Math.max(0, remaining.length - this.maxBackups);
    for (let i = 0; i < removeCount; i++) {
      const filename = remaining[i];
      if (!filename) continue;
      const target = path.join(this.backupDir, filename);
      try {
        await fsp.unlink(target);
      } catch {
        // Best effort.
      }
    }
  }

  private async persistAsync() {
    if (!this.data) return;
    const tmpPath = this.filePath + ".tmp";
    try {
      await this.maybeBackupCurrentDataAsync();
      await fsp.writeFile(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
      await fsp.rename(tmpPath, this.filePath);
    } catch (error) {
      try {
        await fsp.unlink(tmpPath);
      } catch {
        // Best effort cleanup.
      }
      throw error;
    }
  }

  read(): LocalDatabase {
    this.ensureLoaded();
    return this.data!;
  }

  write(mutator: (data: LocalDatabase) => void) {
    this.ensureLoaded();
    mutator(this.data!);
    this.persist();
  }

  async writeQueued(mutator: (data: LocalDatabase) => void) {
    const nextWrite = this.writeQueue.then(() => {
      this.ensureLoaded();
      mutator(this.data!);
      return this.persistAsync();
    });

    this.writeQueue = nextWrite.catch(() => {});
    return nextWrite;
  }
}

class SupabaseDbStore {
  private data: LocalDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private initPromise: Promise<void> | null = null;

  async init() {
    if (!supabaseEnabled) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { data, error } = await supabaseAdmin!
        .from(SUPABASE_STATE_TABLE)
        .select("data")
        .eq("id", SUPABASE_STATE_KEY)
        .maybeSingle();

      if (error) {
        Logger.logError("supabase_state_fetch_failed", error.message);
      }

      if (data?.data) {
        this.data = {
          ...defaultDb(),
          ...(data.data as LocalDatabase),
        };
      } else {
        this.data = defaultDb();
        await this.persist();
      }
    })();

    return this.initPromise;
  }

  read(): LocalDatabase {
    if (!this.data) {
      throw new Error("Supabase storage not initialized. Call initStorage() before use.");
    }
    return this.data;
  }

  write(mutator: (data: LocalDatabase) => void) {
    if (!this.data) {
      throw new Error("Supabase storage not initialized. Call initStorage() before use.");
    }
    mutator(this.data);
    void this.queuePersist();
  }

  async writeQueued(mutator: (data: LocalDatabase) => void) {
    const nextWrite = this.writeQueue.then(async () => {
      if (!this.data) {
        await this.init();
      }
      if (!this.data) {
        throw new Error("Supabase storage not initialized.");
      }
      mutator(this.data);
      await this.persist();
    });

    this.writeQueue = nextWrite.catch(() => {});
    return nextWrite;
  }

  private async queuePersist() {
    const nextWrite = this.writeQueue.then(() => this.persist());
    this.writeQueue = nextWrite.catch(() => {});
    await nextWrite;
  }

  private async persist() {
    if (!this.data) return;
    const payload = {
      id: SUPABASE_STATE_KEY,
      data: this.data,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin!
      .from(SUPABASE_STATE_TABLE)
      .upsert(payload, { onConflict: "id" });

    if (error) {
      Logger.logError("supabase_state_upsert_failed", error.message);
    }
  }
}

const forceLocalStorage = process.env.FORCE_LOCAL_STORAGE === "true";

const localDb: Pick<LocalDbStore, "read" | "write" | "writeQueued"> & { init?: () => Promise<void> } =
  forceLocalStorage || !supabaseEnabled ? new LocalDbStore() : new SupabaseDbStore();

export async function initStorage() {
  if (localDb.init) {
    await localDb.init();
  }
}

export function ensureLocalUser(userId: string) {
  const db = localDb.read();
  const existing = db.users.find((u) => u.id === userId);
  if (existing) return existing;

  const now = nowIso();
  const created: LocalUserProfile = {
    id: userId,
    email: `${userId}@device.local`,
    firstName: "Local",
    lastName: "User",
    profileImageUrl: null,
    timezone: "UTC",
    dashboardNotes: null,
    dashboardLessons: null,
    dashboardMistakes: null,
    dashboardWeaknesses: null,
    dashboardUpdatedAt: null,
    authProvider: "local",
    createdAt: now,
    updatedAt: now,
  };

  localDb.write((state) => {
    state.users.push(created);
  });

  return created;
}

export function getLocalUser(userId: string) {
  const db = localDb.read();
  return db.users.find((u) => u.id === userId) || ensureLocalUser(userId);
}

export function updateLocalUserTimezone(userId: string, timezone: string) {
  ensureLocalUser(userId);
  localDb.write((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    user.timezone = timezone;
    user.updatedAt = nowIso();
  });
  return getLocalUser(userId);
}

export interface IStorage {
  createAccount(data: Partial<Mt5Account> & Pick<Mt5Account, "name">): Promise<Mt5Account>;
  getAccounts(userId: string): Promise<Mt5Account[]>;
  getAccount(id: string): Promise<Mt5Account | undefined>;
  getAccountByApiKey(apiKey: string): Promise<Mt5Account | undefined>;
  updateAccount(id: string, data: Partial<Mt5Account>): Promise<Mt5Account | undefined>;
  deleteAccount(id: string): Promise<void>;

  createTrade(data: InsertTrade): Promise<Trade>;
  createTrades(data: InsertTrade[]): Promise<Trade[]>;
  getTrades(accountId?: string): Promise<Trade[]>;
  getTradesByUser(userId: string, accountId?: string): Promise<Trade[]>;
  getTrade(id: string): Promise<Trade | undefined>;
  getTradeByTicket(ticket: string, accountId: string): Promise<Trade | undefined>;
  updateTrade(id: string, data: Partial<Trade>): Promise<Trade | undefined>;
  deleteTrade(id: string): Promise<void>;

  createTradeNote(data: InsertTradeNote): Promise<TradeNote>;
  getTradeNote(id: string): Promise<TradeNote | undefined>;
  getTradeNotes(tradeId: string): Promise<TradeNote[]>;
  deleteTradeNote(id: string): Promise<void>;

  getPlaybookRules(userId: string): Promise<PlaybookRule[]>;
  getPlaybookRule(id: string): Promise<PlaybookRule | undefined>;
  createPlaybookRule(data: InsertPlaybookRule & { userId: string }): Promise<PlaybookRule>;
  updatePlaybookRule(id: string, data: Partial<PlaybookRule>): Promise<PlaybookRule | undefined>;
  deletePlaybookRule(id: string): Promise<void>;

  getPerformanceGoals(userId: string): Promise<PerformanceGoal[]>;
  getPerformanceGoal(id: string): Promise<PerformanceGoal | undefined>;
  getPerformanceGoalByMonth(month: string, userId: string): Promise<PerformanceGoal | undefined>;
  getPerformanceGoalByPeriod(
    periodType: PerformanceGoal["periodType"],
    periodKey: string,
    userId: string,
  ): Promise<PerformanceGoal | undefined>;
  createPerformanceGoal(data: InsertPerformanceGoal & { userId: string }): Promise<PerformanceGoal>;
  updatePerformanceGoal(
    id: string,
    data: Partial<PerformanceGoal>,
  ): Promise<PerformanceGoal | undefined>;
  deletePerformanceGoal(id: string): Promise<void>;

  getBacktestCandleCache(
    userId: string,
    symbol: BacktestSymbol,
    timeframe: BacktestTimeframe,
    date: string,
    limit: number,
  ): Promise<BacktestCandleCache | undefined>;
  upsertBacktestCandleCache(
    data: Omit<BacktestCandleCache, "id" | "createdAt" | "updatedAt">,
  ): Promise<BacktestCandleCache>;

  createAiAnalysisLog(
    data: InsertAiAnalysisLog,
  ): Promise<AiAnalysisLog>;
  getAiAnalysisLogs(
    userId: string,
    limit?: number,
  ): Promise<AiAnalysisLog[]>;
  getDashboardReflection(userId: string): Promise<DashboardReflection>;
  updateDashboardReflection(
    userId: string,
    data: Partial<Omit<DashboardReflection, "userId" | "updatedAt">>,
  ): Promise<DashboardReflection>;

  createStrategyConceptNote(data: Omit<InsertStrategyConceptNote, "userId"> & { userId: string }): Promise<StrategyConceptNoteRecord>;
  getStrategyConceptNotes(userId: string, accountId?: string): Promise<StrategyConceptNoteRecord[]>;
  getStrategyConceptNote(id: string): Promise<StrategyConceptNoteRecord | undefined>;
  updateStrategyConceptNote(
    id: string,
    data: Partial<StrategyConceptNoteRecord>,
  ): Promise<StrategyConceptNoteRecord | undefined>;
  deleteStrategyConceptNote(id: string): Promise<void>;

  getCalendarCache(): Promise<CalendarCacheRecord | null>;
  setCalendarCache(data: CalendarCacheRecord): Promise<CalendarCacheRecord>;

  createAlertConfig(
    data: Omit<AlertConfigRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<AlertConfigRecord>;
  getAlertConfigs(userId: string, accountId?: string): Promise<AlertConfigRecord[]>;
  getAlertConfig(id: string): Promise<AlertConfigRecord | undefined>;
  updateAlertConfig(
    id: string,
    data: Partial<AlertConfigRecord>,
  ): Promise<AlertConfigRecord | undefined>;
  deleteAlertConfig(id: string): Promise<void>;
  createAlertHistory(
    data: Omit<AlertHistoryRecord, "id" | "triggeredAt">,
  ): Promise<AlertHistoryRecord>;
  getAlertHistory(userId: string, limit?: number): Promise<AlertHistoryRecord[]>;

  createTradeTemplate(
    data: Omit<TradeTemplateRecord, "id" | "createdAt" | "updatedAt" | "usageCount">,
  ): Promise<TradeTemplateRecord>;
  getTradeTemplates(userId: string, category?: string): Promise<TradeTemplateRecord[]>;
  getPublicTradeTemplates(): Promise<TradeTemplateRecord[]>;
  getTradeTemplate(id: string): Promise<TradeTemplateRecord | undefined>;
  updateTradeTemplate(
    id: string,
    data: Partial<TradeTemplateRecord>,
  ): Promise<TradeTemplateRecord | undefined>;
  deleteTradeTemplate(id: string): Promise<void>;
  incrementTemplateUsage(id: string): Promise<TradeTemplateRecord | undefined>;

  createComplianceLog(
    data: Omit<ComplianceLogRecord, "id" | "loggedAt">,
  ): Promise<ComplianceLogRecord>;
  getComplianceLogs(userId: string, accountId?: string): Promise<ComplianceLogRecord[]>;
  deleteComplianceLogsForTrade(tradeId: string): Promise<void>;

  createBacktestResult(
    data: Omit<BacktestResultRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<BacktestResultRecord>;
  getBacktestResults(userId: string, symbol?: string): Promise<BacktestResultRecord[]>;
  getBacktestResult(id: string): Promise<BacktestResultRecord | undefined>;
  updateBacktestResult(
    id: string,
    data: Partial<BacktestResultRecord>,
  ): Promise<BacktestResultRecord | undefined>;
  deleteBacktestResult(id: string): Promise<void>;
}

export class LocalFileStorage implements IStorage {
  private async withWrite<T>(mutator: (db: LocalDatabase) => T): Promise<T> {
    let result!: T;
    await localDb.writeQueued((db) => {
      result = mutator(db);
    });
    return result;
  }

  async createAccount(data: Partial<Mt5Account> & Pick<Mt5Account, "name">): Promise<Mt5Account> {
    ensureLocalUser(data.userId || "local-user");
    const account = toStoredAccount({
      id: randomUUID(),
      userId: data.userId || "local-user",
      server: data.server || "",
      login: data.login || "",
      investorPassword: data.investorPassword || "",
      metaapiAccountId: data.metaapiAccountId || null,
      apiKey: data.apiKey || null,
      name: data.name,
      broker: data.broker || null,
      balance: data.balance ?? 0,
      startingBalance: data.startingBalance ?? null,
      equity: data.equity ?? 0,
      currency: data.currency ?? "USD",
      leverage: data.leverage ?? null,
      platform: data.platform ?? "mt5",
      connected: data.connected ?? false,
      lastSyncAt: data.lastSyncAt ?? null,
      createdAt: data.createdAt ?? nowIso(),
    } as Mt5Account);

    await this.withWrite((db) => {
      db.accounts.push(account);
    });

    return toPublicAccount(account);
  }

  async getAccounts(userId: string): Promise<Mt5Account[]> {
    const db = localDb.read();
    return db.accounts
      .filter((a) => a.userId === userId)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .map(toPublicAccount);
  }

  async getAccount(id: string): Promise<Mt5Account | undefined> {
    const db = localDb.read();
    const account = db.accounts.find((a) => a.id === id);
    return account ? toPublicAccount(account) : undefined;
  }

  async getAccountByApiKey(apiKey: string): Promise<Mt5Account | undefined> {
    const db = localDb.read();
    const account = db.accounts.find((a) => decryptSecret(a.apiKey) === apiKey);
    return account ? toPublicAccount(account) : undefined;
  }

  async updateAccount(id: string, data: Partial<Mt5Account>): Promise<Mt5Account | undefined> {
    let updated: Mt5Account | undefined;
    await this.withWrite((db) => {
      const idx = db.accounts.findIndex((a) => a.id === id);
      if (idx === -1) return;
      db.accounts[idx] = toStoredAccount({ ...db.accounts[idx], ...data } as Mt5Account);
      updated = db.accounts[idx];
    });
    return updated ? toPublicAccount(updated) : undefined;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.withWrite((db) => {
      const tradeIds = db.trades.filter((t) => t.accountId === id).map((t) => t.id);
      db.tradeNotes = db.tradeNotes.filter((n) => !tradeIds.includes(n.tradeId));
      db.trades = db.trades.filter((t) => t.accountId !== id);
      db.complianceLogs = db.complianceLogs.filter((log) => log.accountId !== id);
      db.alertConfigs = db.alertConfigs.filter((config) => config.accountId !== id);
      db.alertHistory = db.alertHistory.filter((item) => item.accountId !== id);
      db.backtestResults = db.backtestResults.filter((item) => item.accountId !== id);
      db.accounts = db.accounts.filter((a) => a.id !== id);
    });
  }

  async createTrade(data: InsertTrade): Promise<Trade> {
    const trade = toStoredTrade({
      ...data,
      id: randomUUID(),
    } as unknown as Trade);

    await this.withWrite((db) => {
      db.trades.push(trade);
    });

    return toPublicTrade(trade);
  }

  async createTrades(data: InsertTrade[]): Promise<Trade[]> {
    const trades = data.map((item) => toStoredTrade({ ...item, id: randomUUID() } as unknown as Trade));
    await this.withWrite((db) => {
      db.trades.push(...trades);
    });
    return trades.map(toPublicTrade);
  }

  async getTrades(accountId?: string): Promise<Trade[]> {
    const db = localDb.read();
    const list = accountId ? db.trades.filter((t) => t.accountId === accountId) : db.trades;
    return [...list]
      .sort((a, b) => toMillis(b.openTime) - toMillis(a.openTime))
      .map(toPublicTrade);
  }

  async getTradesByUser(userId: string, accountId?: string): Promise<Trade[]> {
    const db = localDb.read();
    const accountIds = db.accounts.filter((a) => a.userId === userId).map((a) => a.id);
    const filtered = db.trades.filter((t) =>
      accountId ? t.accountId === accountId && accountIds.includes(accountId) : accountIds.includes(t.accountId),
    );
    return filtered.sort((a, b) => toMillis(b.openTime) - toMillis(a.openTime)).map(toPublicTrade);
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const db = localDb.read();
    const trade = db.trades.find((t) => t.id === id);
    return trade ? toPublicTrade(trade) : undefined;
  }

  async getTradeByTicket(ticket: string, accountId: string): Promise<Trade | undefined> {
    const db = localDb.read();
    const trade = db.trades.find((t) => t.ticket === ticket && t.accountId === accountId);
    return trade ? toPublicTrade(trade) : undefined;
  }

  async updateTrade(id: string, data: Partial<Trade>): Promise<Trade | undefined> {
    let updated: Trade | undefined;
    await this.withWrite((db) => {
      const idx = db.trades.findIndex((t) => t.id === id);
      if (idx === -1) return;
      db.trades[idx] = toStoredTrade({ ...db.trades[idx], ...data } as Trade);
      updated = db.trades[idx];
    });
    return updated ? toPublicTrade(updated) : undefined;
  }

  async deleteTrade(id: string): Promise<void> {
    await this.withWrite((db) => {
      const idx = db.trades.findIndex((t) => t.id === id);
      if (idx !== -1) {
        db.trades.splice(idx, 1);
      }
      // Also delete associated notes
      db.tradeNotes = db.tradeNotes.filter((n) => n.tradeId !== id);
      db.complianceLogs = db.complianceLogs.filter((log) => log.tradeId !== id);
    });
  }

  async createTradeNote(data: InsertTradeNote): Promise<TradeNote> {
    const note = {
      ...data,
      id: randomUUID(),
      createdAt: nowIso(),
    } as unknown as TradeNote;

    await this.withWrite((db) => {
      db.tradeNotes.push(note);
    });
    return note;
  }

  async getTradeNote(id: string): Promise<TradeNote | undefined> {
    const db = localDb.read();
    return db.tradeNotes.find((n) => n.id === id);
  }

  async getTradeNotes(tradeId: string): Promise<TradeNote[]> {
    const db = localDb.read();
    return db.tradeNotes
      .filter((n) => n.tradeId === tradeId)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }

  async deleteTradeNote(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.tradeNotes = db.tradeNotes.filter((n) => n.id !== id);
    });
  }

  async getPlaybookRules(userId: string): Promise<PlaybookRule[]> {
    const db = localDb.read();
    return db.playbookRules
      .filter((r) => r.userId === userId)
      .sort((a, b) => {
        if (a.category === b.category) return (a.sortOrder || 0) - (b.sortOrder || 0);
        return String(a.category).localeCompare(String(b.category));
      });
  }

  async getPlaybookRule(id: string): Promise<PlaybookRule | undefined> {
    const db = localDb.read();
    return db.playbookRules.find((r) => r.id === id);
  }

  async createPlaybookRule(data: InsertPlaybookRule & { userId: string }): Promise<PlaybookRule> {
    const rule = {
      ...data,
      id: randomUUID(),
      createdAt: nowIso(),
    } as unknown as PlaybookRule;

    await this.withWrite((db) => {
      db.playbookRules.push(rule);
    });
    return rule;
  }

  async updatePlaybookRule(
    id: string,
    data: Partial<PlaybookRule>,
  ): Promise<PlaybookRule | undefined> {
    let updated: PlaybookRule | undefined;
    await this.withWrite((db) => {
      const idx = db.playbookRules.findIndex((r) => r.id === id);
      if (idx === -1) return;
      db.playbookRules[idx] = { ...db.playbookRules[idx], ...data } as PlaybookRule;
      updated = db.playbookRules[idx];
    });
    return updated;
  }

  async deletePlaybookRule(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.playbookRules = db.playbookRules.filter((r) => r.id !== id);
    });
  }

  async getPerformanceGoals(userId: string): Promise<PerformanceGoal[]> {
    const db = localDb.read();
    return db.performanceGoals
      .filter((g) => g.userId === userId)
      .map((goal) => normalizePerformanceGoalRecord(goal))
      .sort((a, b) => {
        const keyDiff = String(b.periodKey).localeCompare(String(a.periodKey));
        if (keyDiff !== 0) return keyDiff;
        return toMillis(b.createdAt) - toMillis(a.createdAt);
      });
  }

  async getPerformanceGoal(id: string): Promise<PerformanceGoal | undefined> {
    const db = localDb.read();
    const goal = db.performanceGoals.find((g) => g.id === id);
    return goal ? normalizePerformanceGoalRecord(goal) : undefined;
  }

  async getPerformanceGoalByMonth(
    month: string,
    userId: string,
  ): Promise<PerformanceGoal | undefined> {
    return this.getPerformanceGoalByPeriod("monthly", month, userId);
  }

  async getPerformanceGoalByPeriod(
    periodType: PerformanceGoal["periodType"],
    periodKey: string,
    userId: string,
  ): Promise<PerformanceGoal | undefined> {
    const db = localDb.read();
    const goal = db.performanceGoals.find(
      (g) => g.userId === userId && g.periodType === periodType && g.periodKey === periodKey,
    );
    return goal ? normalizePerformanceGoalRecord(goal) : undefined;
  }

  async createPerformanceGoal(
    data: InsertPerformanceGoal & { userId: string },
  ): Promise<PerformanceGoal> {
    const goal = normalizePerformanceGoalRecord({
      ...data,
      id: randomUUID(),
      createdAt: nowIso(),
    });

    await this.withWrite((db) => {
      db.performanceGoals.push(goal);
    });

    return goal;
  }

  async updatePerformanceGoal(
    id: string,
    data: Partial<PerformanceGoal>,
  ): Promise<PerformanceGoal | undefined> {
    let updated: PerformanceGoal | undefined;
    await this.withWrite((db) => {
      const idx = db.performanceGoals.findIndex((g) => g.id === id);
      if (idx === -1) return;
      db.performanceGoals[idx] = normalizePerformanceGoalRecord({
        ...db.performanceGoals[idx],
        ...data,
      });
      updated = db.performanceGoals[idx];
    });
    return updated;
  }

  async deletePerformanceGoal(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.performanceGoals = db.performanceGoals.filter((g) => g.id !== id);
    });
  }

  async getBacktestCandleCache(
    userId: string,
    symbol: BacktestSymbol,
    timeframe: BacktestTimeframe,
    date: string,
    limit: number,
  ): Promise<BacktestCandleCache | undefined> {
    const db = localDb.read();
    return db.backtestCandleCache.find((item) =>
      item.userId === userId &&
      item.symbol === symbol &&
      item.timeframe === timeframe &&
      item.date === date &&
      item.limit === limit,
    );
  }

  async upsertBacktestCandleCache(
    data: Omit<BacktestCandleCache, "id" | "createdAt" | "updatedAt">,
  ): Promise<BacktestCandleCache> {
    let saved: BacktestCandleCache | undefined;
    await this.withWrite((db) => {
      const now = nowIso();
      const idx = db.backtestCandleCache.findIndex((item) =>
        item.userId === data.userId &&
        item.symbol === data.symbol &&
        item.timeframe === data.timeframe &&
        item.date === data.date &&
        item.limit === data.limit,
      );

      if (idx >= 0) {
        db.backtestCandleCache[idx] = {
          ...db.backtestCandleCache[idx],
          ...data,
          updatedAt: now,
        } as BacktestCandleCache;
        saved = db.backtestCandleCache[idx];
        return;
      }

      const created = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      } as BacktestCandleCache;
      db.backtestCandleCache.push(created);
      if (db.backtestCandleCache.length > 100) {
        db.backtestCandleCache = db.backtestCandleCache
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
          .slice(0, 100);
      }
      saved = created;
    });
    return saved!;
  }

  async createAiAnalysisLog(
    data: InsertAiAnalysisLog,
  ): Promise<AiAnalysisLog> {
    const created = {
      ...data,
      id: randomUUID(),
      createdAt: nowIso(),
    } as unknown as AiAnalysisLog;

    await this.withWrite((db) => {
      db.aiAnalysisLogs.push(created);
      if (db.aiAnalysisLogs.length > 200) {
        db.aiAnalysisLogs = db.aiAnalysisLogs
          .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
          .slice(-200);
      }
    });

    return created;
  }

  async getAiAnalysisLogs(
    userId: string,
    limit = 20,
  ): Promise<AiAnalysisLog[]> {
    const db = localDb.read();
    return db.aiAnalysisLogs
      .filter((item) => item.userId === userId)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, Math.max(1, limit));
  }

  async getDashboardReflection(userId: string): Promise<DashboardReflection> {
    return toDashboardReflection(getLocalUser(userId));
  }

  async updateDashboardReflection(
    userId: string,
    data: Partial<Omit<DashboardReflection, "userId" | "updatedAt">>,
  ): Promise<DashboardReflection> {
    ensureLocalUser(userId);
    const updatedAt = nowIso();
    await this.withWrite((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) return;
      if (data.notes !== undefined) user.dashboardNotes = data.notes ?? null;
      if (data.lessons !== undefined) user.dashboardLessons = data.lessons ?? null;
      if (data.mistakes !== undefined) user.dashboardMistakes = data.mistakes ?? null;
      if (data.weaknesses !== undefined) user.dashboardWeaknesses = data.weaknesses ?? null;
      user.dashboardUpdatedAt = updatedAt;
      user.updatedAt = updatedAt;
    });
    return toDashboardReflection(getLocalUser(userId));
  }

  async createStrategyConceptNote(
    data: Omit<InsertStrategyConceptNote, "userId"> & { userId: string },
  ): Promise<StrategyConceptNoteRecord> {
    ensureLocalUser(data.userId);
    const created = toStoredStrategyConceptNote({
      ...data,
      id: randomUUID(),
      accountId: data.accountId ?? null,
      lesson: data.lesson ?? null,
      checklist: data.checklist ?? null,
      mistakesToAvoid: data.mistakesToAvoid ?? null,
      imageUrl: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    } as StrategyConceptNoteRecord);

    await this.withWrite((db) => {
      db.strategyConceptNotes.push(created);
    });

    return toPublicStrategyConceptNote(created);
  }

  async getStrategyConceptNotes(userId: string, accountId?: string): Promise<StrategyConceptNoteRecord[]> {
    const db = localDb.read();
    return db.strategyConceptNotes
      .filter((item) => item.userId === userId && (!accountId || item.accountId === accountId || item.accountId === null))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
      .map(toPublicStrategyConceptNote);
  }

  async getStrategyConceptNote(id: string): Promise<StrategyConceptNoteRecord | undefined> {
    const db = localDb.read();
    const note = db.strategyConceptNotes.find((item) => item.id === id);
    return note ? toPublicStrategyConceptNote(note) : undefined;
  }

  async updateStrategyConceptNote(
    id: string,
    data: Partial<StrategyConceptNoteRecord>,
  ): Promise<StrategyConceptNoteRecord | undefined> {
    let updated: StrategyConceptNoteRecord | undefined;
    await this.withWrite((db) => {
      const idx = db.strategyConceptNotes.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const existing = db.strategyConceptNotes[idx];
      if (!existing) return;
      db.strategyConceptNotes[idx] = toStoredStrategyConceptNote({
        ...existing,
        ...data,
        id: existing.id,
        userId: existing.userId,
        updatedAt: nowIso(),
      } as StrategyConceptNoteRecord);
      updated = db.strategyConceptNotes[idx];
    });
    return updated ? toPublicStrategyConceptNote(updated) : undefined;
  }

  async deleteStrategyConceptNote(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.strategyConceptNotes = db.strategyConceptNotes.filter((item) => item.id !== id);
    });
  }

  async getCalendarCache(): Promise<CalendarCacheRecord | null> {
    return localDb.read().calendarCache ?? null;
  }

  async setCalendarCache(data: CalendarCacheRecord): Promise<CalendarCacheRecord> {
    await this.withWrite((db) => {
      db.calendarCache = data;
    });
    return data;
  }

  async createAlertConfig(
    data: Omit<AlertConfigRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<AlertConfigRecord> {
    const now = nowIso();
    const created: AlertConfigRecord = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.withWrite((db) => {
      db.alertConfigs.push(created);
    });
    return created;
  }

  async getAlertConfigs(userId: string, accountId?: string): Promise<AlertConfigRecord[]> {
    const db = localDb.read();
    return db.alertConfigs
      .filter((item) => item.userId === userId && (!accountId || item.accountId === accountId))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  }

  async getAlertConfig(id: string): Promise<AlertConfigRecord | undefined> {
    const db = localDb.read();
    return db.alertConfigs.find((item) => item.id === id);
  }

  async updateAlertConfig(
    id: string,
    data: Partial<AlertConfigRecord>,
  ): Promise<AlertConfigRecord | undefined> {
    let updated: AlertConfigRecord | undefined;
    await this.withWrite((db) => {
      const idx = db.alertConfigs.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const existing = db.alertConfigs[idx];
      if (!existing) return;
      db.alertConfigs[idx] = {
        ...existing,
        ...data,
        id: existing.id,
        updatedAt: nowIso(),
      } as AlertConfigRecord;
      updated = db.alertConfigs[idx];
    });
    return updated;
  }

  async deleteAlertConfig(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.alertConfigs = db.alertConfigs.filter((item) => item.id !== id);
      db.alertHistory = db.alertHistory.filter((item) => item.configId !== id);
    });
  }

  async createAlertHistory(
    data: Omit<AlertHistoryRecord, "id" | "triggeredAt">,
  ): Promise<AlertHistoryRecord> {
    const created: AlertHistoryRecord = {
      ...data,
      id: randomUUID(),
      triggeredAt: nowIso(),
    };
    await this.withWrite((db) => {
      db.alertHistory.push(created);
    });
    return created;
  }

  async getAlertHistory(userId: string, limit = 50): Promise<AlertHistoryRecord[]> {
    const db = localDb.read();
    return db.alertHistory
      .filter((item) => item.userId === userId)
      .sort((a, b) => toMillis(b.triggeredAt) - toMillis(a.triggeredAt))
      .slice(0, Math.max(1, limit));
  }

  async createTradeTemplate(
    data: Omit<TradeTemplateRecord, "id" | "createdAt" | "updatedAt" | "usageCount">,
  ): Promise<TradeTemplateRecord> {
    const now = nowIso();
    const created: TradeTemplateRecord = {
      ...data,
      id: randomUUID(),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.withWrite((db) => {
      db.tradeTemplates.push(created);
    });
    return created;
  }

  async getTradeTemplates(userId: string, category?: string): Promise<TradeTemplateRecord[]> {
    const db = localDb.read();
    return db.tradeTemplates
      .filter((item) => item.userId === userId && (!category || item.category === category))
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
  }

  async getPublicTradeTemplates(): Promise<TradeTemplateRecord[]> {
    const db = localDb.read();
    return db.tradeTemplates
      .filter((item) => item.isPublic)
      .sort((a, b) => {
        if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
        return toMillis(b.updatedAt) - toMillis(a.updatedAt);
      });
  }

  async getTradeTemplate(id: string): Promise<TradeTemplateRecord | undefined> {
    const db = localDb.read();
    return db.tradeTemplates.find((item) => item.id === id);
  }

  async updateTradeTemplate(
    id: string,
    data: Partial<TradeTemplateRecord>,
  ): Promise<TradeTemplateRecord | undefined> {
    let updated: TradeTemplateRecord | undefined;
    await this.withWrite((db) => {
      const idx = db.tradeTemplates.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const existing = db.tradeTemplates[idx];
      if (!existing) return;
      db.tradeTemplates[idx] = {
        ...existing,
        ...data,
        id: existing.id,
        updatedAt: nowIso(),
      } as TradeTemplateRecord;
      updated = db.tradeTemplates[idx];
    });
    return updated;
  }

  async deleteTradeTemplate(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.tradeTemplates = db.tradeTemplates.filter((item) => item.id !== id);
    });
  }

  async incrementTemplateUsage(id: string): Promise<TradeTemplateRecord | undefined> {
    let updated: TradeTemplateRecord | undefined;
    await this.withWrite((db) => {
      const idx = db.tradeTemplates.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const existing = db.tradeTemplates[idx];
      if (!existing) return;
      db.tradeTemplates[idx] = {
        ...existing,
        usageCount: (existing.usageCount || 0) + 1,
        updatedAt: nowIso(),
      } as TradeTemplateRecord;
      updated = db.tradeTemplates[idx];
    });
    return updated;
  }

  async createComplianceLog(
    data: Omit<ComplianceLogRecord, "id" | "loggedAt">,
  ): Promise<ComplianceLogRecord> {
    const created: ComplianceLogRecord = {
      ...data,
      id: randomUUID(),
      loggedAt: nowIso(),
    };
    await this.withWrite((db) => {
      db.complianceLogs.push(created);
    });
    return created;
  }

  async getComplianceLogs(userId: string, accountId?: string): Promise<ComplianceLogRecord[]> {
    const db = localDb.read();
    return db.complianceLogs
      .filter((item) => item.userId === userId && (!accountId || item.accountId === accountId))
      .sort((a, b) => toMillis(b.loggedAt) - toMillis(a.loggedAt));
  }

  async deleteComplianceLogsForTrade(tradeId: string): Promise<void> {
    await this.withWrite((db) => {
      db.complianceLogs = db.complianceLogs.filter((item) => item.tradeId !== tradeId);
    });
  }

  async createBacktestResult(
    data: Omit<BacktestResultRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<BacktestResultRecord> {
    const now = nowIso();
    const created: BacktestResultRecord = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.withWrite((db) => {
      db.backtestResults.push(created);
    });
    return created;
  }

  async getBacktestResults(userId: string, symbol?: string): Promise<BacktestResultRecord[]> {
    const db = localDb.read();
    return db.backtestResults
      .filter((item) => item.userId === userId && (!symbol || item.symbol === symbol))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }

  async getBacktestResult(id: string): Promise<BacktestResultRecord | undefined> {
    const db = localDb.read();
    return db.backtestResults.find((item) => item.id === id);
  }

  async updateBacktestResult(
    id: string,
    data: Partial<BacktestResultRecord>,
  ): Promise<BacktestResultRecord | undefined> {
    let updated: BacktestResultRecord | undefined;
    await this.withWrite((db) => {
      const idx = db.backtestResults.findIndex((item) => item.id === id);
      if (idx < 0) return;
      const existing = db.backtestResults[idx];
      if (!existing) return;
      db.backtestResults[idx] = {
        ...existing,
        ...data,
        id: existing.id,
        updatedAt: nowIso(),
      } as BacktestResultRecord;
      updated = db.backtestResults[idx];
    });
    return updated;
  }

  async deleteBacktestResult(id: string): Promise<void> {
    await this.withWrite((db) => {
      db.backtestResults = db.backtestResults.filter((item) => item.id !== id);
    });
  }
}

export const storage = new LocalFileStorage();
