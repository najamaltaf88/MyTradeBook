import { z } from "zod";

export * from "./models/auth";

const dateLikeSchema = z.union([z.string(), z.date()]);

export const mt5Accounts = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  server: z.string(),
  login: z.string(),
  investorPassword: z.string().default(""),
  metaapiAccountId: z.string().nullable().optional(),
  apiKey: z.string().nullable().optional(),
  name: z.string(),
  broker: z.string().nullable().optional(),
  balance: z.number().optional().default(0),
  startingBalance: z.number().nullable().optional(),
  equity: z.number().optional().default(0),
  currency: z.string().optional().default("USD"),
  leverage: z.string().nullable().optional(),
  platform: z.string().optional().default("mt5"),
  connected: z.boolean().optional().default(false),
  lastSyncAt: dateLikeSchema.nullable().optional(),
  createdAt: dateLikeSchema.optional(),
});

export const trades = z.object({
  id: z.string(),
  accountId: z.string(),
  ticket: z.string(),
  symbol: z.string().max(24),
  type: z.enum(["BUY", "SELL"]),
  openTime: dateLikeSchema,
  closeTime: dateLikeSchema.nullable().optional(),
  openPrice: z.number(),
  closePrice: z.number().nullable().optional(),
  volume: z.number(),
  profit: z.number().optional().default(0),
  commission: z.number().optional().default(0),
  swap: z.number().optional().default(0),
  stopLoss: z.number().nullable().optional(),
  takeProfit: z.number().nullable().optional(),
  pips: z.number().nullable().optional(),
  duration: z.number().int().nullable().optional(),
  comment: z.string().max(5000).nullable().optional(),
  isClosed: z.boolean().optional().default(false),
  reason: z.string().max(500).nullable().optional(),
  logic: z.string().max(2000).nullable().optional(),
  emotion: z.string().max(32).nullable().optional(),
  screenshotUrl: z.string().nullable().optional(),
  aiGrade: z.string().nullable().optional(),
  aiScore: z.number().nullable().optional(),
  aiAnalysisCache: z.string().nullable().optional(),
  aiCachedAt: dateLikeSchema.nullable().optional(),
});

export const tradeNotes = z.object({
  id: z.string(),
  tradeId: z.string(),
  note: z.string().max(5000),
  createdAt: dateLikeSchema.optional(),
});

export const playbookRules = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  category: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  createdAt: dateLikeSchema.optional(),
});

export const goalPeriodTypeSchema = z.enum(["daily", "weekly", "monthly"]);

export const performanceGoals = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  periodType: goalPeriodTypeSchema.default("monthly"),
  periodKey: z.string().min(1),
  month: z.string().nullable().optional(),
  profitTarget: z.number().nullable().optional(),
  dailyTarget: z.number().nullable().optional(),
  maxLoss: z.number().nullable().optional(),
  maxDailyLoss: z.number().nullable().optional(),
  winRateTarget: z.number().nullable().optional(),
  maxTradesPerDay: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: dateLikeSchema.optional(),
});

export const aiAnalysisLogs = z.object({
  id: z.string(),
  userId: z.string(),
  analysisJson: z.string(),
  modelUsed: z.string(),
  fallbackUsed: z.boolean().optional().default(false),
  createdAt: dateLikeSchema.optional(),
});

export const dashboardReflection = z.object({
  userId: z.string(),
  notes: z.string().nullable().optional(),
  lessons: z.string().nullable().optional(),
  mistakes: z.string().nullable().optional(),
  weaknesses: z.string().nullable().optional(),
  updatedAt: dateLikeSchema.optional(),
});

export const strategyConceptNotes = z.object({
  id: z.string(),
  userId: z.string(),
  accountId: z.string().nullable().optional(),
  strategy: z.string(),
  title: z.string(),
  concept: z.string(),
  lesson: z.string().nullable().optional(),
  checklist: z.string().nullable().optional(),
  mistakesToAvoid: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  createdAt: dateLikeSchema.optional(),
  updatedAt: dateLikeSchema.optional(),
});

export const insertPlaybookRuleSchema = playbookRules.omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertPerformanceGoalSchema = performanceGoals.omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertAiAnalysisLogSchema = aiAnalysisLogs.omit({
  id: true,
  createdAt: true,
});

export const updateDashboardReflectionSchema = dashboardReflection
  .omit({
    userId: true,
    updatedAt: true,
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const insertStrategyConceptNoteSchema = strategyConceptNotes.omit({
  id: true,
  userId: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
});

export const updateStrategyConceptNoteSchema = z
  .object({
    accountId: z.string().nullable().optional(),
    strategy: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    concept: z.string().min(1).optional(),
    lesson: z.string().nullable().optional(),
    checklist: z.string().nullable().optional(),
    mistakesToAvoid: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const updatePlaybookRuleSchema = z
  .object({
    category: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

export const updatePerformanceGoalSchema = z
  .object({
    periodType: goalPeriodTypeSchema.optional(),
    periodKey: z.string().min(1).optional(),
    month: z.string().nullable().optional(),
    profitTarget: z.number().nullable().optional(),
    dailyTarget: z.number().nullable().optional(),
    maxLoss: z.number().nullable().optional(),
    maxDailyLoss: z.number().nullable().optional(),
    winRateTarget: z.number().nullable().optional(),
    maxTradesPerDay: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const TRADE_EMOTIONS = [
  "confident",
  "calm",
  "fearful",
  "greedy",
  "anxious",
  "frustrated",
  "revenge",
  "fomo",
  "neutral",
  "disciplined",
] as const;

export const updateTradeJournalSchema = z.object({
  reason: z.string().max(500).optional(),
  logic: z.string().max(2000).optional(),
  emotion: z
    .string()
    .max(32)
    .optional()
    .refine((value) => value === undefined || value === "" || TRADE_EMOTIONS.includes(value as typeof TRADE_EMOTIONS[number]), {
      message: `Invalid emotion. Must be one of: ${TRADE_EMOTIONS.join(", ")}`,
    }),
});

export type PlaybookRule = z.infer<typeof playbookRules>;
export type InsertPlaybookRule = z.infer<typeof insertPlaybookRuleSchema>;
export type PerformanceGoal = z.infer<typeof performanceGoals>;
export type InsertPerformanceGoal = z.infer<typeof insertPerformanceGoalSchema>;
export type AiAnalysisLog = z.infer<typeof aiAnalysisLogs>;
export type InsertAiAnalysisLog = z.infer<typeof insertAiAnalysisLogSchema>;
export type DashboardReflection = z.infer<typeof dashboardReflection>;
export type StrategyConceptNote = z.infer<typeof strategyConceptNotes>;
export type InsertStrategyConceptNote = z.infer<typeof insertStrategyConceptNoteSchema>;

export const insertMt5AccountSchema = mt5Accounts.omit({
  id: true,
  metaapiAccountId: true,
  apiKey: true,
  balance: true,
  startingBalance: true,
  equity: true,
  currency: true,
  leverage: true,
  connected: true,
  lastSyncAt: true,
  createdAt: true,
});

export const connectAccountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  server: z.string().optional().default(""),
  login: z.string().optional().default(""),
  broker: z.string().optional().default(""),
  platform: z.string().default("mt5"),
});

export const webhookTradeSchema = z.object({
  action: z.enum(["TRADE_OPEN", "TRADE_CLOSE", "TRADE_UPDATE", "ACCOUNT_INFO", "HEARTBEAT"]),
  ticket: z.string().optional(),
  symbol: z.string().max(24).optional(),
  type: z.enum(["BUY", "SELL"]).optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  openPrice: z.number().positive("Open price must be positive").optional(),
  closePrice: z.number().positive("Close price must be positive").optional(),
  volume: z.number().positive("Volume must be positive").optional(),
  profit: z.number().optional(),
  commission: z.number().optional(),
  swap: z.number().optional(),
  stopLoss: z.number().optional(),
  takeProfit: z.number().optional(),
  comment: z.string().max(5000).optional(),
  balance: z.number().optional(),
  equity: z.number().optional(),
  currency: z.string().optional(),
  leverage: z.string().optional(),
});

export const insertTradeSchema = trades.omit({
  id: true,
});

export const insertTradeNoteSchema = tradeNotes.omit({
  id: true,
  createdAt: true,
});

export type Mt5Account = z.infer<typeof mt5Accounts>;
export type InsertMt5Account = z.infer<typeof insertMt5AccountSchema>;
export type Trade = z.infer<typeof trades>;
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type TradeNote = z.infer<typeof tradeNotes>;
export type InsertTradeNote = z.infer<typeof insertTradeNoteSchema>;

export const BACKTEST_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D"] as const;
export type BacktestTimeframe = typeof BACKTEST_TIMEFRAMES[number];

export const BACKTEST_SUPPORTED_SYMBOLS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CAD",
  "NZD/USD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
  "XAU/USD",
] as const;
export type BacktestSymbol = typeof BACKTEST_SUPPORTED_SYMBOLS[number];

export const backtestCandleSchema = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullable().optional(),
});
export type BacktestCandle = z.infer<typeof backtestCandleSchema>;

export type BacktestCandleCache = {
  id: string;
  userId: string;
  symbol: BacktestSymbol;
  timeframe: BacktestTimeframe;
  date: string;
  limit: number;
  candles: BacktestCandle[];
  source: "yahoo" | "twelvedata";
  fetchedAt: string;
  createdAt: string;
  updatedAt: string;
};
