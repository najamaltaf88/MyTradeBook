import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { z } from "zod";

type Direction = "bullish" | "bearish" | "mixed" | "neutral";
type Confidence = "high" | "medium" | "low";
type VolatilityLevel = "high" | "medium" | "low";
type Provider = "grok" | "gemini";
type Source = Provider | "algorithmic";

export type CalendarEvent = {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
};

export interface CalendarAiBrief {
  generatedAt: string;
  source: Source;
  modelUsed: string;
  fallbackUsed: boolean;
  fromCache: boolean;
  dayKey: string;
  timezone: string;
  overview: string;
  sentiment: {
    label: string;
    bias: Direction;
    confidence: Confidence;
    driver: string;
  };
  volatility: {
    level: VolatilityLevel;
    driver: string;
  };
  topThemes: string[];
  pairBiases: Array<{
    symbol: string;
    bias: Direction;
    driver: string;
  }>;
  eventFocus: Array<{
    time: string;
    currency: string;
    title: string;
    impact: string;
    bias: Direction;
    summary: string;
  }>;
  tradingPlan: string[];
  riskNotes: string[];
  providerMessage?: string;
}

type GenerateDailyBriefInput = {
  events: CalendarEvent[];
  date?: string;
  timezone?: string;
  provider?: Provider;
  forceRefresh?: boolean;
};

const GROK_ENDPOINT = process.env.GROK_API_URL || "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4";
const GROK_TIMEOUT_MS = 45000;
const GEMINI_ENDPOINT = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_TIMEOUT_MS = 45000;
const CACHE_TTL_MS = 20 * 60 * 1000;

const BriefSchema = z.object({
  overview: z.string().min(1),
  sentiment: z.object({
    label: z.string().min(1),
    bias: z.enum(["bullish", "bearish", "mixed", "neutral"]),
    confidence: z.enum(["high", "medium", "low"]),
    driver: z.string().min(1),
  }),
  volatility: z.object({
    level: z.enum(["high", "medium", "low"]),
    driver: z.string().min(1),
  }),
  topThemes: z.array(z.string().min(1)).default([]),
  pairBiases: z.array(z.object({
    symbol: z.string().min(1),
    bias: z.enum(["bullish", "bearish", "mixed", "neutral"]),
    driver: z.string().min(1),
  })).default([]),
  eventFocus: z.array(z.object({
    time: z.string().min(1),
    currency: z.string().min(1),
    title: z.string().min(1),
    impact: z.string().min(1),
    bias: z.enum(["bullish", "bearish", "mixed", "neutral"]),
    summary: z.string().min(1),
  })).default([]),
  tradingPlan: z.array(z.string().min(1)).default([]),
  riskNotes: z.array(z.string().min(1)).default([]),
});

const higherIsBullishPatterns = [
  /gdp/i,
  /pmi/i,
  /employment/i,
  /non[- ]farm/i,
  /payroll/i,
  /retail sales/i,
  /industrial production/i,
  /consumer confidence/i,
  /business confidence/i,
  /sentiment/i,
  /home sales/i,
  /trade balance/i,
  /building permits/i,
  /housing starts/i,
  /wage/i,
  /inflation/i,
  /\bcpi\b/i,
  /\bppi\b/i,
  /core pce/i,
  /money supply/i,
];

const lowerIsBullishPatterns = [
  /unemployment/i,
  /jobless claims/i,
  /continuing claims/i,
  /claimant count/i,
];

const cache = new Map<string, { fetchedAt: number; data: CalendarAiBrief }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidTimezone(timezone: string | undefined): timezone is string {
  if (!timezone) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function formatDayKey(dateValue: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(dateValue));
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function formatEventTime(dateValue: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(dateValue));
}

function impactWeight(impact: string): number {
  if (impact === "High") return 3;
  if (impact === "Medium") return 2;
  if (impact === "Low") return 1;
  return 0;
}

function parseNumericToken(value: string): number | null {
  if (!value) return null;
  const source = value.split("|")[0]?.trim() || value.trim();
  const match = source.match(/[-+]?\d*\.?\d+\s*([KMBT])?/i);
  if (!match?.[0]) return null;

  const numberMatch = match[0].match(/[-+]?\d*\.?\d+/);
  if (!numberMatch?.[0]) return null;
  let parsed = Number(numberMatch[0]);
  if (!Number.isFinite(parsed)) return null;

  const unit = match[1]?.toUpperCase();
  if (unit === "K") parsed *= 1_000;
  if (unit === "M") parsed *= 1_000_000;
  if (unit === "B") parsed *= 1_000_000_000;
  if (unit === "T") parsed *= 1_000_000_000_000;

  return parsed;
}

function inferDirectionalRule(title: string): "higher_bullish" | "lower_bullish" | null {
  if (lowerIsBullishPatterns.some((pattern) => pattern.test(title))) return "lower_bullish";
  if (higherIsBullishPatterns.some((pattern) => pattern.test(title))) return "higher_bullish";
  return null;
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  for (const item of values) {
    const clean = item.trim();
    if (!clean) continue;
    if (!out.some((current) => current.toLowerCase() === clean.toLowerCase())) {
      out.push(clean);
    }
  }
  return out;
}

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value != null);
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

function sanitizeProviderMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Unknown provider error");
  const sanitized = message.replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted-key]");

  if (/API key not configured/i.test(sanitized)) {
    return "AI provider is unavailable because its API key is not configured. Internal coaching fallback is being used.";
  }

  return sanitized;
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
    .map((item) => (item || "").trim().replace(/^['"]|['"]$/g, ""))
    .find(Boolean);

  if (direct) return direct;

  const envPath = findNearestEnvPath();
  if (!envPath) return undefined;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const key of ["GROK_API_KEY", "grokAPI_key", "XAI_API_KEY"]) {
      const regex = new RegExp(`^${key}\\s*[:=]\\s*(.+)$`, "i");
      const match = trimmed.match(regex);
      if (!match?.[1]) continue;
      const value = trimmed.match(/['"]?(.*?)['"]?$/)?.[1]?.trim() || "";
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
    .map((item) => (item || "").trim().replace(/^['"]|['"]$/g, ""))
    .find(Boolean);

  if (direct) return direct;

  const envPath = findNearestEnvPath();
  if (!envPath) return undefined;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    for (const key of ["GEMINI_API_KEY", "GOOGLE_API_KEY"]) {
      const regex = new RegExp(`^${key}\\s*[:=]\\s*(.+)$`, "i");
      const match = trimmed.match(regex);
      if (!match?.[1]) continue;
      const value = trimmed.match(/['"]?(.*?)['"]?$/)?.[1]?.trim() || "";
      if (!value) continue;
      return value;
    }
  }

  return undefined;
}

function describeTheme(title: string): string {
  if (/cpi|ppi|inflation|pce/i.test(title)) return "Inflation";
  if (/employment|payroll|jobless|unemployment|claims/i.test(title)) return "Labor";
  if (/powell|lagarde|bailey|governor|speaks|statement|minutes|meeting/i.test(title)) return "Central Bank";
  if (/pmi|manufacturing|services|industrial|production/i.test(title)) return "Growth";
  if (/consumer confidence|sentiment|confidence/i.test(title)) return "Confidence";
  if (/trade|current account/i.test(title)) return "External Balance";
  if (/housing|building|permits|home sales/i.test(title)) return "Housing";
  return "Macro";
}

function getCurrencyPair(currency: string): { symbol: string; inverted: boolean } | null {
  switch (currency) {
    case "EUR":
      return { symbol: "EUR/USD", inverted: false };
    case "GBP":
      return { symbol: "GBP/USD", inverted: false };
    case "AUD":
      return { symbol: "AUD/USD", inverted: false };
    case "NZD":
      return { symbol: "NZD/USD", inverted: false };
    case "JPY":
      return { symbol: "USD/JPY", inverted: true };
    case "CHF":
      return { symbol: "USD/CHF", inverted: true };
    case "CAD":
      return { symbol: "USD/CAD", inverted: true };
    case "CNY":
      return { symbol: "USD/CNH", inverted: true };
    case "USD":
      return { symbol: "EUR/USD", inverted: true };
    default:
      return null;
  }
}

function convertBiasForPair(bias: Direction, inverted: boolean): Direction {
  if (!inverted || bias === "mixed" || bias === "neutral") return bias;
  return bias === "bullish" ? "bearish" : "bullish";
}

function clamp<T>(values: T[], limit: number): T[] {
  return values.slice(0, limit);
}

function buildNoEventsBrief(dayKey: string, timezone: string): CalendarAiBrief {
  return {
    generatedAt: new Date().toISOString(),
    source: "algorithmic",
    modelUsed: "calendar-algorithmic-v1",
    fallbackUsed: false,
    fromCache: false,
    dayKey,
    timezone,
    overview: "The docket is light for this day, so price action may lean more on technical levels and any unscheduled headlines.",
    sentiment: {
      label: "Low-Event Day",
      bias: "neutral",
      confidence: "low",
      driver: "No scheduled economic releases were found for the selected date.",
    },
    volatility: {
      level: "low",
      driver: "Without scheduled catalysts, volatility usually comes from unscheduled news or session flows.",
    },
    topThemes: ["Low calendar risk"],
    pairBiases: [],
    eventFocus: [],
    tradingPlan: [
      "Lean more on clean technical structure than macro timing.",
      "Keep a headline alert on because unscheduled news can move a quiet session quickly.",
    ],
    riskNotes: [
      "Thin-event days can still produce sharp moves if central bank commentary or geopolitical headlines hit.",
    ],
  };
}

function buildAlgorithmicBrief(
  allEvents: CalendarEvent[],
  dayEvents: CalendarEvent[],
  dayKey: string,
  timezone: string,
): CalendarAiBrief {
  if (!dayEvents.length) {
    return buildNoEventsBrief(dayKey, timezone);
  }

  const now = new Date();
  const weightedByCurrency = new Map<string, { weight: number; directionalScore: number; events: number }>();
  const highImpactCount = dayEvents.filter((event) => event.impact === "High").length;
  const mediumImpactCount = dayEvents.filter((event) => event.impact === "Medium").length;
  const speechCount = dayEvents.filter((event) => /speaks|statement|minutes|meeting/i.test(event.title)).length;

  const eventFocus = clamp(
    dayEvents
      .slice()
      .sort((a, b) => {
        const impactDelta = impactWeight(b.impact) - impactWeight(a.impact);
        if (impactDelta !== 0) return impactDelta;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
      .map((event) => {
        const weight = impactWeight(event.impact);
        const rule = inferDirectionalRule(event.title);
        const forecast = parseNumericToken(event.forecast);
        const previous = parseNumericToken(event.previous);
        let bias: Direction = "mixed";
        let summary = "This release looks more important for volatility than for a clean directional pre-bias.";

        if (
          rule &&
          typeof forecast === "number" &&
          typeof previous === "number" &&
          forecast !== previous
        ) {
          const bullishForCurrency =
            rule === "higher_bullish"
              ? forecast > previous
              : forecast < previous;
          bias = bullishForCurrency ? "bullish" : "bearish";
          summary = bullishForCurrency
            ? `Forecast is stronger than the previous print, so this leans supportive for ${event.country} if the release confirms it.`
            : `Forecast is softer than the previous print, so this can lean against ${event.country} if the weakness is confirmed.`;
        } else if (/speaks|statement|minutes|meeting/i.test(event.title)) {
          bias = "mixed";
          summary = "Central bank communication often drives repricing quickly, so tone matters more than the calendar number itself.";
        } else if (weight >= 3) {
          summary = "This is a top-tier release for the session, so even an in-line result can create sharp volatility.";
        }

        const entry = weightedByCurrency.get(event.country) || { weight: 0, directionalScore: 0, events: 0 };
        entry.weight += weight;
        entry.events += 1;
        if (bias === "bullish") entry.directionalScore += weight;
        if (bias === "bearish") entry.directionalScore -= weight;
        weightedByCurrency.set(event.country, entry);

        return {
          time: formatEventTime(event.date, timezone),
          currency: event.country,
          title: event.title,
          impact: event.impact || "Low",
          bias,
          summary,
        };
      }),
    5,
  );

  const topThemes = clamp(
    dedupe(
      eventFocus.map((event) => describeTheme(event.title)),
    ),
    4,
  );

  const currencyLeaders = Array.from(weightedByCurrency.entries())
    .map(([currency, stats]) => ({
      currency,
      weight: stats.weight,
      directionalScore: stats.directionalScore,
      events: stats.events,
    }))
    .sort((a, b) => {
      const absDelta = Math.abs(b.directionalScore) - Math.abs(a.directionalScore);
      if (absDelta !== 0) return absDelta;
      return b.weight - a.weight;
    });

  const dominant = currencyLeaders[0];
  let overallBias: Direction = "mixed";
  let sentimentLabel = "Mixed Macro Board";
  let confidence: Confidence = "medium";
  let sentimentDriver = `${highImpactCount} high-impact and ${mediumImpactCount} medium-impact events keep the session catalyst-driven.`;

  if (dominant && Math.abs(dominant.directionalScore) >= 2) {
    overallBias = dominant.directionalScore > 0 ? "bullish" : "bearish";
    sentimentLabel = `${dominant.currency} ${overallBias === "bullish" ? "Bullish" : "Bearish"} Watch`;
    confidence = Math.abs(dominant.directionalScore) >= 5 ? "high" : "medium";
    sentimentDriver = `${dominant.currency} carries the heaviest directional setup on the board with ${dominant.events} scheduled release${dominant.events > 1 ? "s" : ""}.`;
  } else if (highImpactCount === 0 && mediumImpactCount <= 1) {
    overallBias = "neutral";
    sentimentLabel = "Balanced Day";
    confidence = "low";
    sentimentDriver = "The schedule is light enough that traders may struggle to build a clean macro bias before price reacts.";
  }

  const totalWeightedRisk = dayEvents.reduce((sum, event) => sum + impactWeight(event.impact), 0);
  const volatility: VolatilityLevel =
    highImpactCount >= 3 || totalWeightedRisk >= 12
      ? "high"
      : highImpactCount >= 1 || totalWeightedRisk >= 6
      ? "medium"
      : "low";

  const volatilityDriver =
    volatility === "high"
      ? "Multiple high-impact releases are stacked into the same day, so headline-to-headline repricing can stay elevated."
      : volatility === "medium"
      ? "There is enough event risk on the board to create bursts of movement around key times."
      : "Scheduled risk is limited, so volatility may concentrate around session opens or unscheduled headlines.";

  const pairBiases = clamp(
    compact(
      currencyLeaders.map((leader) => {
        if (Math.abs(leader.directionalScore) < 2) return null;
        const pair = getCurrencyPair(leader.currency);
        if (!pair) return null;
        const currencyBias: Direction = leader.directionalScore > 0 ? "bullish" : "bearish";
        return {
          symbol: pair.symbol,
          bias: convertBiasForPair(currencyBias, pair.inverted),
          driver: `${leader.currency} has the clearest scheduled directional tilt from forecast-versus-previous event expectations.`,
        };
      }),
    ),
    4,
  );

  const firstHighImpact = dayEvents.find((event) => event.impact === "High");
  const nextEvent = dayEvents.find((event) => new Date(event.date).getTime() > now.getTime());
  const overview = [
    `${dayEvents.length} scheduled releases land on ${dayKey} in ${timezone}.`,
    highImpactCount > 0
      ? `${highImpactCount} of them are high impact, so traders should expect the clearest movement around the major releases.`
      : "The board is lighter on tier-one data, so a cleaner directional move may need confirmation from price action.",
    speechCount > 0
      ? `${speechCount} central-bank communication item${speechCount > 1 ? "s" : ""} can shift rate expectations without warning.`
      : "Most of the risk sits in the printed releases rather than surprise commentary.",
  ].join(" ");

  const tradingPlan = dedupe(compact([
    firstHighImpact
      ? `Reduce size or wait for confirmation around ${formatEventTime(firstHighImpact.date, timezone)} when ${firstHighImpact.country} ${firstHighImpact.title} prints.`
      : null,
    nextEvent
      ? `Mark ${formatEventTime(nextEvent.date, timezone)} as the next reaction window and avoid forcing entries just before the release.`
      : "Treat the session as a technical-first day until a scheduled catalyst hits.",
    pairBiases[0]
      ? `Keep ${pairBiases[0].symbol} on the front screen because it carries the cleanest calendar-driven setup.`
      : "Focus on the pairs tied to the highest-impact currencies on your board.",
    volatility === "high"
      ? "Expect fake first moves around top-tier releases and let the initial spike settle before chasing."
      : "Use session highs and lows as the main validation points before leaning on the calendar narrative.",
  ]));

  const riskNotes = dedupe(compact([
    speechCount > 0 ? "Speaker events can flip the market tone even when the scheduled numbers look clear." : null,
    highImpactCount >= 2 ? "Back-to-back red-folder events can create whipsaw conditions across correlated USD pairs." : null,
    allEvents.some((event) => formatDayKey(event.date, timezone) === dayKey && /holiday/i.test(event.impact))
      ? "Holiday liquidity can distort normal reaction quality and widen spreads." : null,
  ]));

  return {
    generatedAt: new Date().toISOString(),
    source: "algorithmic",
    modelUsed: "calendar-algorithmic-v1",
    fallbackUsed: false,
    fromCache: false,
    dayKey,
    timezone,
    overview,
    sentiment: {
      label: sentimentLabel,
      bias: overallBias,
      confidence,
      driver: sentimentDriver,
    },
    volatility: {
      level: volatility,
      driver: volatilityDriver,
    },
    topThemes,
    pairBiases,
    eventFocus,
    tradingPlan: clamp(tradingPlan, 4),
    riskNotes: clamp(riskNotes, 3),
  };
}

function buildPrompt(dayKey: string, timezone: string, dayEvents: CalendarEvent[]): string {
  const ordered = dayEvents
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((event, index) => {
      const pieces = [
        `${index + 1}. ${formatEventTime(event.date, timezone)}`,
        event.country,
        event.impact || "Low",
        event.title,
        `forecast ${event.forecast || "n/a"}`,
        `previous ${event.previous || "n/a"}`,
      ];
      if (event.actual) {
        pieces.push(`actual ${event.actual}`);
      }
      return pieces.join(" | ");
    })
    .join("\n");

  return [
    `Prepare a concise FX macro brief for ${dayKey} in timezone ${timezone}.`,
    "Use only the supplied scheduled calendar events. Do not invent actual results, breaking headlines, revisions, or future certainty.",
    "If an event has no actual number yet, frame it as a watchlist catalyst, not a confirmed move.",
    "Think like a Forex Factory-style trader briefing: dense, practical, pair-aware, and risk-aware.",
    "Return strict JSON with this shape:",
    '{"overview":"...","sentiment":{"label":"...","bias":"bullish|bearish|mixed|neutral","confidence":"high|medium|low","driver":"..."},"volatility":{"level":"high|medium|low","driver":"..."},"topThemes":["..."],"pairBiases":[{"symbol":"EUR/USD","bias":"bullish|bearish|mixed|neutral","driver":"..."}],"eventFocus":[{"time":"8:30 AM","currency":"USD","title":"CPI","impact":"High","bias":"bullish|bearish|mixed|neutral","summary":"..."}],"tradingPlan":["..."],"riskNotes":["..."]}',
    "Keep overview under 70 words, themes max 4, pairBiases max 4, eventFocus max 5, tradingPlan max 4, riskNotes max 3.",
    "Calendar events:",
    ordered || "No events supplied.",
  ].join("\n");
}

export class CalendarAIService {
  async generateDailyBrief(input: GenerateDailyBriefInput): Promise<CalendarAiBrief> {
    const timezone = isValidTimezone(input.timezone) ? input.timezone : "UTC";
    const dayKey = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : formatDayKey(new Date(), timezone);
    const dayEvents = input.events.filter((event) => formatDayKey(event.date, timezone) === dayKey);

    const eventHash = createHash("sha1")
      .update(JSON.stringify(dayEvents.map((event) => ({
        title: event.title,
        country: event.country,
        date: event.date,
        impact: event.impact,
        forecast: event.forecast,
        previous: event.previous,
        actual: event.actual || "",
      }))))
      .digest("hex");

    const requestedProvider = input.provider === "gemini" ? "gemini" : input.provider === "grok" ? "grok" : undefined;
    const cacheKey = `${requestedProvider || "auto"}:${timezone}:${dayKey}:${eventHash}`;
    const cached = cache.get(cacheKey);
    if (!input.forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.data, fromCache: true };
    }

    const algorithmic = buildAlgorithmicBrief(input.events, dayEvents, dayKey, timezone);
    const providers: Provider[] = requestedProvider
      ? [requestedProvider, requestedProvider === "gemini" ? "grok" : "gemini"]
      : ["gemini", "grok"];

    let providerMessage: string | undefined;

    for (const provider of providers) {
      try {
        const aiBrief = await this.callProvider(provider, dayKey, timezone, dayEvents);
        const result: CalendarAiBrief = {
          generatedAt: new Date().toISOString(),
          source: provider,
          modelUsed: provider === "gemini" ? GEMINI_MODEL : GROK_MODEL,
          fallbackUsed: false,
          fromCache: false,
          dayKey,
          timezone,
          overview: aiBrief.overview.trim(),
          sentiment: aiBrief.sentiment,
          volatility: aiBrief.volatility,
          topThemes: clamp(dedupe(aiBrief.topThemes), 4),
          pairBiases: clamp(aiBrief.pairBiases, 4),
          eventFocus: clamp(aiBrief.eventFocus, 5),
          tradingPlan: clamp(dedupe(aiBrief.tradingPlan), 4),
          riskNotes: clamp(dedupe(aiBrief.riskNotes), 3),
        };
        cache.set(cacheKey, { fetchedAt: Date.now(), data: result });
        return result;
      } catch (error) {
        providerMessage = sanitizeProviderMessage(error);
      }
    }

    const fallback = {
      ...algorithmic,
      fallbackUsed: Boolean(providerMessage),
      providerMessage,
    };
    cache.set(cacheKey, { fetchedAt: Date.now(), data: fallback });
    return fallback;
  }

  private async callProvider(
    provider: Provider,
    dayKey: string,
    timezone: string,
    dayEvents: CalendarEvent[],
  ): Promise<z.infer<typeof BriefSchema>> {
    if (!dayEvents.length) {
      return BriefSchema.parse(buildNoEventsBrief(dayKey, timezone));
    }

    if (provider === "gemini") {
      const apiKey = resolveGeminiApiKey();
      if (!apiKey) throw new Error("Gemini API key is not configured.");
      return this.callGemini(apiKey, dayKey, timezone, dayEvents);
    }

    const apiKey = resolveGrokApiKey();
    if (!apiKey) throw new Error("Grok API key is not configured.");
    return this.callGrok(apiKey, dayKey, timezone, dayEvents);
  }

  private async callGemini(
    apiKey: string,
    dayKey: string,
    timezone: string,
    dayEvents: CalendarEvent[],
  ): Promise<z.infer<typeof BriefSchema>> {
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
                parts: [{ text: buildPrompt(dayKey, timezone, dayEvents) }],
              },
            ],
            systemInstruction: {
              parts: [
                {
                  text: "You are a senior FX macro analyst writing a Forex Factory-style daily trading brief. Be specific, practical, and concise. Return only strict JSON.",
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

      return BriefSchema.parse(JSON.parse(extractJson(textContent)));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGrok(
    apiKey: string,
    dayKey: string,
    timezone: string,
    dayEvents: CalendarEvent[],
  ): Promise<z.infer<typeof BriefSchema>> {
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
              content: "You are a senior FX macro analyst writing a Forex Factory-style daily trading brief. Be specific, practical, and concise. Return only strict JSON.",
            },
            {
              role: "user",
              content: buildPrompt(dayKey, timezone, dayEvents),
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
      if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
        throw new Error("Malformed Grok message.");
      }

      return BriefSchema.parse(JSON.parse(extractJson(first.message.content)));
    } finally {
      clearTimeout(timeout);
    }
  }
}
