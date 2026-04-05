import fs from "fs";
import path from "path";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  status?: string;
  message?: string;
  error?: string;
  userId?: string;
  tradeId?: string;
}

function resolveLogsDir(): string {
  const baseDir = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), ".mytradebook-data");
  const logsDir = path.join(baseDir, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function logToFile(filename: string, entry: LogEntry): void {
  try {
    const logsDir = resolveLogsDir();
    const filePath = path.join(logsDir, filename);
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(filePath, line, "utf8");
  } catch (error) {
    // Silently fail if logging fails to avoid crashing the application
    console.error("Failed to write log:", error);
  }
}

export const Logger = {
  /**
   * Log trade-related events
   */
  logTrade(event: string, status: string, tradeId?: string, error?: Error | string): void {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: error ? "error" : "info",
      event,
      status,
      tradeId,
    };
    if (error) {
      entry.error = typeof error === "string" ? error : error.message;
    }
    logToFile("trades.log", entry);
  },

  /**
   * Log API requests and responses
   */
  logApi(
    event: string,
    status: string,
    userId?: string,
    message?: string,
    error?: Error | string,
  ): void {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: error ? "error" : "info",
      event,
      status,
      userId,
      message,
    };
    if (error) {
      entry.error = typeof error === "string" ? error : error.message;
    }
    logToFile("api.log", entry);
  },

  /**
   * Log AI analysis events
   */
  logAi(event: string, status: string, userId?: string, error?: Error | string): void {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: error ? "error" : "info",
      event,
      status,
      userId,
    };
    if (error) {
      entry.error = typeof error === "string" ? error : error.message;
    }
    logToFile("ai.log", entry);
  },

  /**
   * Log errors and exceptions
   */
  logError(event: string, error: Error | string, context?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: "error",
      event,
      error: typeof error === "string" ? error : error.message,
      ...context,
    };
    logToFile("errors.log", entry);
    // Also log to console for immediate visibility
    console.error(`[ERROR] ${event}:`, error);
  },

  /**
   * Log debug information
   */
  logDebug(event: string, message: string, context?: Record<string, any>): void {
    if (process.env.NODE_ENV !== "development") return;
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: "debug",
      event,
      message,
      ...context,
    };
    logToFile("debug.log", entry);
  },
};
