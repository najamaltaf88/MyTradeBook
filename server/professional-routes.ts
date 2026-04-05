import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getTradingSession, PERFECT_PROFIT_FACTOR } from "@shared/trade-utils";
import ComplianceEngine, { type PlaybookRule as EngineRule } from "./compliance-engine";
import HeatmapEngine from "./heatmap-engine";
import PDFExportEngine from "./pdf-export-engine";
import { storage, type AlertCondition, type AlertType } from "./storage";
import { analyzePsychology } from "./psychology-engine";
import { analyzeRisk } from "./risk-engine";
import AlertEngine from "./alert-engine";

const router = Router();

function getUserId(req: Request): string {
  return (req as any).userId || (req as any).user?.claims?.sub || process.env.LOCAL_USER_ID || "local-user";
}

function routeParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function tradeNetPnl(trade: { profit?: unknown; commission?: unknown; swap?: unknown }): number {
  return toNumber(trade.profit) + toNumber(trade.commission) + toNumber(trade.swap);
}

const ALERT_TYPES: AlertType[] = [
  "loss",
  "profit",
  "drawdown",
  "trades_count",
  "rule_violation",
  "goal_missed",
];

const ALERT_CONDITIONS: AlertCondition[] = ["exceeds", "falls_below", "equals"];

const alertChannelsSchema = z
  .object({
    discord: z.object({ webhookUrl: z.string().optional(), enabled: z.boolean().optional() }).optional(),
    slack: z.object({ webhookUrl: z.string().optional(), enabled: z.boolean().optional() }).optional(),
    email: z.object({ addresses: z.array(z.string()).optional(), enabled: z.boolean().optional() }).optional(),
    push: z.object({ enabled: z.boolean().optional() }).optional(),
    webhook: z.object({ url: z.string().optional(), enabled: z.boolean().optional() }).optional(),
  })
  .default({});

const createAlertSchema = z.object({
  accountId: z.string().optional().nullable(),
  name: z.string().min(1),
  type: z.enum(ALERT_TYPES as [AlertType, ...AlertType[]]),
  condition: z.enum(ALERT_CONDITIONS as [AlertCondition, ...AlertCondition[]]),
  threshold: z.number(),
  channels: alertChannelsSchema.optional(),
  enabled: z.boolean().optional(),
});

const updateAlertSchema = createAlertSchema.partial();

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.enum(["scalp", "intraday", "swing", "custom"]),
  symbol: z.string().optional().nullable(),
  symbols: z.array(z.string()).optional(),
  type: z.enum(["BUY", "SELL"]).optional().nullable(),
  reason: z.string().optional().nullable(),
  logic: z.string().optional().nullable(),
  emotion: z.string().optional().nullable(),
  typicalRiskPips: z.number().optional().nullable(),
  typicalRewardPips: z.number().optional().nullable(),
  entryChecklist: z.array(z.string()).optional(),
  exitChecklist: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const createComplianceLogSchema = z.object({
  tradeId: z.string().min(1),
  ruleId: z.string().min(1),
  followed: z.boolean(),
  notes: z.string().optional().nullable(),
});

const reportPdfSchema = z.object({
  accountId: z.string().optional(),
  template: z.enum(["standard", "professional", "detailed", "coach"]).optional(),
  sections: z.array(z.string()).optional(),
  colorScheme: z.enum(["professional", "colorful", "minimal"]).optional(),
  includeCharts: z.boolean().optional(),
  companyName: z.string().optional(),
});

router.get("/alerts/history", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = parseLimit(req.query.limit, 50, 250);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const history = await storage.getAlertHistory(userId, limit);
    res.json(
      accountId
        ? history.filter((item) => item.accountId === accountId || item.accountId === null)
        : history,
    );
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/alerts", async (req: Request, res: Response) => {
  try {
    const parsed = createAlertSchema.parse(req.body);
    const userId = getUserId(req);
    const created = await storage.createAlertConfig({
      userId,
      accountId: parsed.accountId ?? null,
      name: parsed.name,
      type: parsed.type,
      condition: parsed.condition,
      threshold: parsed.threshold,
      channels: parsed.channels || {},
      enabled: parsed.enabled ?? true,
    });
    res.json(created);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const alerts = await storage.getAlertConfigs(userId, accountId);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.patch("/alerts/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const alertId = routeParam(req.params.id);
    const existing = await storage.getAlertConfig(alertId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const updates = updateAlertSchema.parse(req.body);
    const updated = await storage.updateAlertConfig(alertId, {
      ...updates,
      accountId: updates.accountId === undefined ? existing.accountId : updates.accountId ?? null,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.delete("/alerts/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const alertId = routeParam(req.params.id);
    const existing = await storage.getAlertConfig(alertId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Alert not found" });
    }
    await storage.deleteAlertConfig(alertId);
    res.json({ success: true, id: alertId });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/alerts/:id/test", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const alertId = routeParam(req.params.id);
    const existing = await storage.getAlertConfig(alertId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Alert not found" });
    }

    const step = Math.max(1, Math.abs(existing.threshold) * 0.1);
    const sampleValue =
      existing.condition === "equals"
        ? existing.threshold
        : existing.condition === "falls_below"
        ? existing.threshold - step
        : existing.threshold + step;

    const engine = new AlertEngine();
    let status: "sent" | "failed" = "sent";
    let message = `${existing.type} ${existing.condition} ${existing.threshold}. Current: ${sampleValue}`;
    let metadata: Record<string, unknown> = {
      test: true,
      alertType: existing.type,
      condition: existing.condition,
      threshold: existing.threshold,
      sampleValue,
    };

    try {
      await engine.triggerAlert(existing as any, sampleValue);
    } catch (error) {
      status = "failed";
      message = toErrorMessage(error, message);
      metadata = {
        ...metadata,
        error: message,
      };
    }

    const history = await storage.createAlertHistory({
      configId: existing.id,
      userId,
      accountId: existing.accountId,
      title: `${existing.name} Test Alert`,
      message,
      channels: existing.channels,
      status,
      metadata,
    });

    res.json({
      success: status === "sent",
      history,
    });
  } catch (error) {
    res.status(500).json({ error: toErrorMessage(error, "Failed to send test alert") });
  }
});

router.post("/templates", async (req: Request, res: Response) => {
  try {
    const parsed = createTemplateSchema.parse(req.body);
    const created = await storage.createTradeTemplate({
      userId: getUserId(req),
      name: parsed.name,
      description: parsed.description ?? null,
      category: parsed.category,
      symbol: parsed.symbol ?? null,
      symbols: parsed.symbols || [],
      type: parsed.type ?? null,
      reason: parsed.reason ?? null,
      logic: parsed.logic ?? null,
      emotion: parsed.emotion ?? null,
      typicalRiskPips: parsed.typicalRiskPips ?? null,
      typicalRewardPips: parsed.typicalRewardPips ?? null,
      entryChecklist: parsed.entryChecklist || [],
      exitChecklist: parsed.exitChecklist || [],
      isPublic: parsed.isPublic ?? false,
    });
    res.json(created);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.get("/templates", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const templates = await storage.getTradeTemplates(userId, category);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.patch("/templates/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const templateId = routeParam(req.params.id);
    const existing = await storage.getTradeTemplate(templateId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Template not found" });
    }

    const parsed = updateTemplateSchema.parse(req.body);
    const updated = await storage.updateTradeTemplate(templateId, {
      ...parsed,
      description: parsed.description === undefined ? existing.description : parsed.description ?? null,
      symbol: parsed.symbol === undefined ? existing.symbol : parsed.symbol ?? null,
      type: parsed.type === undefined ? existing.type : parsed.type ?? null,
      reason: parsed.reason === undefined ? existing.reason : parsed.reason ?? null,
      logic: parsed.logic === undefined ? existing.logic : parsed.logic ?? null,
      emotion: parsed.emotion === undefined ? existing.emotion : parsed.emotion ?? null,
      typicalRiskPips:
        parsed.typicalRiskPips === undefined ? existing.typicalRiskPips : parsed.typicalRiskPips ?? null,
      typicalRewardPips:
        parsed.typicalRewardPips === undefined ? existing.typicalRewardPips : parsed.typicalRewardPips ?? null,
    });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const templateId = routeParam(req.params.id);
    const existing = await storage.getTradeTemplate(templateId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Template not found" });
    }
    await storage.deleteTradeTemplate(templateId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/templates/:id/use", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const templateId = routeParam(req.params.id);
    const existing = await storage.getTradeTemplate(templateId);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Template not found" });
    }
    const updated = await storage.incrementTemplateUsage(templateId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get("/templates/public", async (_req: Request, res: Response) => {
  try {
    const templates = await storage.getPublicTradeTemplates();
    const output = templates.map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      creatorName: "Community Trader",
      usageCount: template.usageCount,
      averageWinRate: 0.5,
      reason: template.reason,
      logic: template.logic,
      emotion: template.emotion,
      typicalRiskPips: template.typicalRiskPips,
      typicalRewardPips: template.typicalRewardPips,
      symbols: template.symbols,
    }));
    res.json(output);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get("/compliance/score", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const trades = await storage.getTradesByUser(userId, accountId);
    const rules = await storage.getPlaybookRules(userId);
    const logs = await storage.getComplianceLogs(userId, accountId);

    const engine = new ComplianceEngine();
    const mappedRules: EngineRule[] = rules.map((rule) => ({
      id: rule.id,
      name: rule.title,
      category: String(rule.category || "general"),
      description: String(rule.description || ""),
      active: Boolean(rule.isActive ?? true),
    }));

    const syntheticLogs =
      logs.length > 0
        ? logs
        : trades
            .filter((trade) => trade.isClosed)
            .flatMap((trade) =>
              engine.detectViolations(
                {
                  id: trade.id,
                  symbol: trade.symbol,
                  profit: trade.profit || 0,
                  commission: trade.commission || 0,
                  swap: trade.swap || 0,
                  isClosed: Boolean(trade.isClosed),
                  reason: trade.reason || undefined,
                  logic: trade.logic || undefined,
                  emotion: trade.emotion || undefined,
                  stopLoss: trade.stopLoss || undefined,
                  takeProfit: trade.takeProfit || undefined,
                  volume: trade.volume || 0,
                  duration: trade.duration || 0,
                },
                mappedRules.filter((rule) => rule.active),
              ).map((decision) => ({
                tradeId: trade.id,
                ruleId: decision.ruleId,
                followed: !decision.violated,
              })),
            );

    const metrics = engine.calculateCompliance(
      trades.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        profit: trade.profit || 0,
        commission: trade.commission || 0,
        swap: trade.swap || 0,
        isClosed: Boolean(trade.isClosed),
        reason: trade.reason || undefined,
        logic: trade.logic || undefined,
        emotion: trade.emotion || undefined,
        stopLoss: trade.stopLoss || undefined,
        takeProfit: trade.takeProfit || undefined,
        volume: trade.volume || 0,
        duration: trade.duration || 0,
      })),
      mappedRules.filter((rule) => rule.active),
      syntheticLogs,
    );

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.post("/compliance/log", async (req: Request, res: Response) => {
  try {
    const parsed = createComplianceLogSchema.parse(req.body);
    const userId = getUserId(req);

    const trade = await storage.getTrade(parsed.tradeId);
    if (!trade) {
      return res.status(404).json({ error: "Trade not found" });
    }

    const account = await storage.getAccount(trade.accountId);
    if (!account || account.userId !== userId) {
      return res.status(404).json({ error: "Trade not found" });
    }

    const rule = await storage.getPlaybookRule(parsed.ruleId);
    if (!rule || rule.userId !== userId) {
      return res.status(404).json({ error: "Rule not found" });
    }

    const created = await storage.createComplianceLog({
      tradeId: parsed.tradeId,
      ruleId: parsed.ruleId,
      userId,
      accountId: trade.accountId,
      ruleName: rule.title,
      followed: parsed.followed,
      notes: parsed.notes ?? null,
    });

    res.json(created);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.get("/compliance/report", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const period =
      req.query.period === "daily" || req.query.period === "weekly" || req.query.period === "monthly"
        ? req.query.period
        : "monthly";

    const trades = await storage.getTradesByUser(userId, accountId);
    const rules = await storage.getPlaybookRules(userId);
    const logs = await storage.getComplianceLogs(userId, accountId);
    const engine = new ComplianceEngine();

    const metrics = engine.calculateCompliance(
      trades.map((trade) => ({
        id: trade.id,
        symbol: trade.symbol,
        profit: trade.profit || 0,
        commission: trade.commission || 0,
        swap: trade.swap || 0,
        isClosed: Boolean(trade.isClosed),
        reason: trade.reason || undefined,
        logic: trade.logic || undefined,
        emotion: trade.emotion || undefined,
        stopLoss: trade.stopLoss || undefined,
        takeProfit: trade.takeProfit || undefined,
        volume: trade.volume || 0,
        duration: trade.duration || 0,
      })),
      rules
        .filter((rule) => Boolean(rule.isActive ?? true))
        .map((rule) => ({
          id: rule.id,
          name: rule.title,
          category: String(rule.category || "general"),
          description: String(rule.description || ""),
          active: Boolean(rule.isActive ?? true),
        })),
      logs,
    );
    const report = engine.generateComplianceReport(metrics, period);

    res.json({ report, metrics });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get("/heatmaps/insights", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const trades = (await storage.getTradesByUser(userId, accountId)).filter((trade) => trade.isClosed);

    const engine = new HeatmapEngine();
    const maps = [
      engine.generateSymbolSessionHeatmap(trades),
      engine.generateSymbolDayHeatmap(trades),
      engine.generateHourlyHeatmap(trades),
    ];

    res.json({ insights: engine.generateInsights(maps) });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

router.get("/heatmaps/:type", async (req: Request, res: Response) => {
  try {
    const parsed = z
      .object({
        type: z.enum(["symbol_session", "symbol_dayofweek", "hourly"]),
      })
      .parse(req.params);

    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const trades = (await storage.getTradesByUser(userId, accountId)).filter((trade) => trade.isClosed);

    const engine = new HeatmapEngine();
    const result =
      parsed.type === "symbol_session"
        ? engine.generateSymbolSessionHeatmap(trades)
        : parsed.type === "symbol_dayofweek"
        ? engine.generateSymbolDayHeatmap(trades)
        : engine.generateHourlyHeatmap(trades);

    res.json({
      type: result.type,
      period: result.period,
      data: Object.fromEntries(Array.from(result.data.entries())),
      metadata: result.metadata,
    });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.post("/reports/pdf", async (req: Request, res: Response) => {
  try {
    const parsed = reportPdfSchema.parse(req.body);
    const userId = getUserId(req);
    const trades = await storage.getTradesByUser(userId, parsed.accountId);
    const closedTrades = trades.filter((trade) => trade.isClosed);

    const wins = closedTrades.filter((trade) => tradeNetPnl(trade) > 0);
    const losses = closedTrades.filter((trade) => tradeNetPnl(trade) < 0);
    const grossProfit = wins.reduce((sum, trade) => sum + tradeNetPnl(trade), 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + tradeNetPnl(trade), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? PERFECT_PROFIT_FACTOR : 0;
    const expectancy =
      closedTrades.length > 0
        ? closedTrades.reduce((sum, trade) => sum + tradeNetPnl(trade), 0) / closedTrades.length
        : 0;

    const monthlyProfit: Record<string, number> = {};
    const sessionStats: Record<string, { trades: number; profit: number; winRate: number }> = {};
    const symbolStats: Record<string, { trades: number; profit: number; winRate: number }> = {};

    for (const trade of closedTrades) {
      const closeTime = new Date(trade.closeTime || trade.openTime || Date.now());
      const monthKey = `${closeTime.getUTCFullYear()}-${String(closeTime.getUTCMonth() + 1).padStart(2, "0")}`;
      monthlyProfit[monthKey] = (monthlyProfit[monthKey] || 0) + tradeNetPnl(trade);

      const session = getTradingSession(trade.openTime || new Date());
      const sessionBucket = sessionStats[session] || { trades: 0, profit: 0, winRate: 0 };
      sessionBucket.trades += 1;
      sessionBucket.profit += tradeNetPnl(trade);
      sessionStats[session] = sessionBucket;

      const symbolBucket = symbolStats[trade.symbol] || { trades: 0, profit: 0, winRate: 0 };
      symbolBucket.trades += 1;
      symbolBucket.profit += tradeNetPnl(trade);
      symbolStats[trade.symbol] = symbolBucket;
    }

    for (const key of Object.keys(sessionStats)) {
      const bucket = sessionStats[key];
      if (!bucket) continue;
      const bucketTrades = closedTrades.filter((trade) => {
        const session = getTradingSession(trade.openTime || new Date());
        return session === key;
      });
      const sessionWins = bucketTrades.filter((trade) => tradeNetPnl(trade) > 0).length;
      bucket.winRate = bucketTrades.length > 0 ? sessionWins / bucketTrades.length : 0;
    }

    for (const key of Object.keys(symbolStats)) {
      const bucket = symbolStats[key];
      if (!bucket) continue;
      const bucketTrades = closedTrades.filter((trade) => trade.symbol === key);
      const symbolWins = bucketTrades.filter((trade) => tradeNetPnl(trade) > 0).length;
      bucket.winRate = bucketTrades.length > 0 ? symbolWins / bucketTrades.length : 0;
    }

    const analytics = {
      totalTrades: closedTrades.length,
      winRate: closedTrades.length > 0 ? wins.length / closedTrades.length : 0,
      profitFactor,
      maxDrawdown: 0,
      sharpeRatio: 0,
      expectancy,
      monthlyProfit,
      sessionStats,
      symbolStats,
    };

    const risk = analyzeRisk(trades);
    const psychology = analyzePsychology(trades);
    const goals = await storage.getPerformanceGoals(userId);

    const recommendations = [
      `Keep risk near ${risk.recommendedRiskPercent.toFixed(2)}% per trade for consistency.`,
      `Psychology cost impact: $${psychology.totalMistakeCost.toFixed(2)}.`,
      "Review weekly report and adjust only one variable at a time.",
    ];

    const engine = new PDFExportEngine({
      templateName: parsed.template || "professional",
      companyName: parsed.companyName,
      reportTitle: "Trading Journal Report",
      sections:
        parsed.sections ||
        ["summary", "analytics", "psychology", "risk", "goals", "recommendations"],
      includeCharts: parsed.includeCharts !== false,
      colorScheme: parsed.colorScheme || "professional",
      pageOrientation: "portrait",
    });

    const htmlContent = engine.generateReport(
      trades.map((trade) => ({
        symbol: trade.symbol,
        type: trade.type as "BUY" | "SELL",
        openTime: new Date(trade.openTime),
        closeTime: trade.closeTime ? new Date(trade.closeTime) : undefined,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice || undefined,
        profit: trade.profit || 0,
        commission: trade.commission || 0,
        swap: trade.swap || 0,
        aiGrade: trade.aiGrade || undefined,
      })),
      analytics,
      psychology,
      risk,
      { goals },
      recommendations,
    );

    res.setHeader("Content-Type", "text/html");
    res.send(htmlContent);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

router.get("/reports/templates", async (_req: Request, res: Response) => {
  res.json({
    templates: [
      {
        name: "standard",
        description: "Basic report with key metrics",
        sections: ["summary", "analytics"],
      },
      {
        name: "professional",
        description: "Comprehensive report for clients/coaches",
        sections: ["summary", "analytics", "psychology", "risk", "recommendations"],
      },
      {
        name: "detailed",
        description: "Complete analysis with all trades listed",
        sections: ["summary", "trades", "analytics", "psychology", "risk", "goals", "recommendations"],
      },
      {
        name: "coach",
        description: "Focused on improvement areas and recommendations",
        sections: ["summary", "psychology", "risk", "goals", "recommendations"],
      },
    ],
  });
});

export const professionalsRouter = router;
