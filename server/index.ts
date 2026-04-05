import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { initStorage } from "./storage";
import { serveStatic } from "./static";
import { createServer } from "http";
import { Logger } from "./logging";

const app = express();
const httpServer = createServer(app);

function validateEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const missing: string[] = [];

  if (supabaseUrl || serviceKey || anonKey) {
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!anonKey) missing.push("SUPABASE_ANON_KEY");
    if (missing.length > 0) {
      Logger.logError(
        "env_validation_failed",
        new Error(`Missing required env vars: ${missing.join(", ")}`),
      );
    }
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use("/api/webhook", express.text({ type: "application/json" }), (req: Request, _res: Response, next: NextFunction) => {
  if (typeof req.body === "string") {
    try {
      req.body = JSON.parse(req.body.replace(/\0/g, ""));
    } catch (e) {
      req.body = {};
    }
  }
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        const serialized = JSON.stringify(capturedJsonResponse);
        const maxLogLength = 500;
        logLine +=
          serialized.length > maxLogLength
            ? ` :: ${serialized.slice(0, maxLogLength)}...[truncated]`
            : ` :: ${serialized}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  validateEnv();
  await initStorage();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    Logger.logError("server_error", err);

    if (res.headersSent) {
      return next(err);
    }

    const safeMessage =
      status >= 500
        ? "Unexpected server error. Please retry."
        : message;

    return res.status(status).json({ message: safeMessage });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const requestedPort = parseInt(process.env.PORT || "5000", 10);
  let activePort = Number.isFinite(requestedPort) ? requestedPort : 5000;
  const maxAttempts = 20;
  let attempts = 0;

  const listenWithFallback = () => {
    attempts += 1;
    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.off("error", onError);
      if (error.code === "EADDRINUSE" && attempts < maxAttempts) {
        activePort += 1;
        listenWithFallback();
        return;
      }
      throw error;
    };

    httpServer.once("error", onError);
    httpServer.listen(
      {
        port: activePort,
        host: "0.0.0.0",
      },
      () => {
        httpServer.off("error", onError);
        log(`serving on port ${activePort}`);
      },
    );
  };

  listenWithFallback();
})();
