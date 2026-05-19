import { Logger } from "../logging";

export const MODEL_CHAIN = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-7b-instruct:free",
] as const;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REFERER = "https://mytradebook.app";
const TITLE = "MyTradeBook";

export type OpenRouterMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OpenRouterResult = {
  content: string;
  modelUsed: string;
  model_used: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

function readOpenRouterApiKey(): string | undefined {
  const value = process.env.OPENROUTER_API_KEY?.trim();
  return value ? value.replace(/^['"]|['"]$/g, "") : undefined;
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
    if (
      typeof item === "object" &&
      item !== null &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      chunks.push(item.text);
    }
  }
  return chunks.join("\n").trim();
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 1000);
  } catch {
    return response.statusText || "Unable to read error body";
  }
}

function parseCompletionPayload(payload: unknown): string {
  const response = payload as OpenRouterResponse;
  const content = normalizeContent(response.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("Malformed OpenRouter response: missing message content.");
  }
  return content;
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  systemPrompt: string,
  maxTokens: number,
): Promise<OpenRouterResult> {
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) {
    const message = "OPENROUTER_API_KEY not set, AI features disabled";
    console.warn(message);
    Logger.logAi("openrouter_missing_key", "warn", undefined, message);
    throw new Error(message);
  }

  const failures: string[] = [];
  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages,
  ];

  for (const model of MODEL_CHAIN) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": REFERER,
          "X-Title": TITLE,
        },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const body = await readErrorBody(response);
        const failure = `${model}: HTTP ${response.status} ${body}`;
        failures.push(failure);
        if (response.status === 429 || response.status === 503) {
          const message = `AI Analysis: ${model} unavailable (${response.status}), falling back to next model`;
          console.warn(message);
          Logger.logAi("openrouter_model_fallback", "warn", undefined, failure);
          continue;
        }

        console.warn(`AI Analysis: ${model} failed, falling back to next model: HTTP ${response.status}`);
        Logger.logAi("openrouter_model_fallback", "warn", undefined, failure);
        continue;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${model}: invalid JSON response: ${message}`);
        console.warn(`AI Analysis: ${model} returned invalid JSON, falling back to next model`);
        Logger.logAi("openrouter_model_fallback", "warn", undefined, message);
        continue;
      }

      const content = parseCompletionPayload(payload);
      console.log(`AI Analysis: using model ${model}`);
      Logger.logAi("openrouter_model_used", "success", undefined, model);
      return {
        content,
        modelUsed: model,
        model_used: model,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${message}`);
      console.warn(`AI Analysis: ${model} failed, falling back to next model: ${message}`);
      Logger.logAi("openrouter_model_fallback", "warn", undefined, message);
    }
  }

  throw new Error(`All OpenRouter models failed: ${failures.join(" | ")}`);
}
