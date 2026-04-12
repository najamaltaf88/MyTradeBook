const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const dotenv = require("dotenv");

let mainWindow = null;
let backendPort = null;

function writeStartupLog(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "startup.log");
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // Best effort logging only.
  }
}

function loadRuntimeEnv() {
  const userDataEnv = path.join(app.getPath("userData"), ".env");
  const exeDirEnv = path.join(path.dirname(process.execPath), ".env");
  const cwdEnv = path.join(process.cwd(), ".env");
  const appPathEnv = path.join(app.getAppPath(), ".env");
  const resourcesEnv = path.join(process.resourcesPath || "", ".env");
  const localDataDir = path.join(app.getPath("userData"), "data");
  const localUploadsDir = path.join(app.getPath("userData"), "uploads");

  if (!fs.existsSync(userDataEnv)) {
    const content = [
      `LOCAL_DATA_DIR=${localDataDir.replace(/\\/g, "/")}`,
      `LOCAL_UPLOADS_DIR=${localUploadsDir.replace(/\\/g, "/")}`,
      "PORT=5000",
      "",
    ].join("\n");
    fs.mkdirSync(path.dirname(userDataEnv), { recursive: true });
    fs.writeFileSync(userDataEnv, content, "utf8");
  }

  const envFiles = [cwdEnv, exeDirEnv, appPathEnv, resourcesEnv, userDataEnv]
    .filter(Boolean)
    .filter((envFile, index, list) => list.indexOf(envFile) === index);

  envFiles.forEach((envFile, index) => {
    if (fs.existsSync(envFile)) {
      // Keep earlier env values stable, but allow userData/.env to take priority for user overrides.
      const isUserDataEnv = index === envFiles.length - 1 && envFile === userDataEnv;
      dotenv.config({ path: envFile, override: isUserDataEnv });
    }
  });
}

function migrateLegacyUploads(targetDir) {
  if (!app.isPackaged) return;

  fs.mkdirSync(targetDir, { recursive: true });

  const candidates = [
    path.join(path.dirname(process.execPath), "uploads"),
    path.join(process.resourcesPath || "", "uploads"),
    path.join(process.cwd(), "uploads"),
  ]
    .filter(Boolean)
    .filter((dir, index, list) => list.indexOf(dir) === index)
    .filter((dir) => path.resolve(dir) !== path.resolve(targetDir));

  for (const sourceDir of candidates) {
    if (!fs.existsSync(sourceDir)) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (fs.existsSync(targetPath)) continue;
      try {
        fs.copyFileSync(sourcePath, targetPath);
      } catch {
        // Best effort migration for legacy screenshots.
      }
    }
  }
}

function migrateLegacyData(targetDir) {
  if (!app.isPackaged) return;

  const targetFile = path.join(targetDir, "data.json");
  if (fs.existsSync(targetFile)) return;

  const candidates = [
    path.join(path.dirname(process.execPath), ".mytradebook-data", "data.json"),
    path.join(process.resourcesPath || "", ".mytradebook-data", "data.json"),
    path.join(process.cwd(), ".mytradebook-data", "data.json"),
  ]
    .filter(Boolean)
    .filter((filePath, index, list) => list.indexOf(filePath) === index);

  for (const sourceFile of candidates) {
    if (!fs.existsSync(sourceFile)) continue;
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(sourceFile, targetFile);
      writeStartupLog(`Migrated legacy data from ${sourceFile}`);
      return;
    } catch {
      // Keep trying next candidate.
    }
  }
}

function waitForServer(port, timeoutMs = 45000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port,
          path: "/api/health",
          timeout: 3000,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(`Server health check failed with status ${res.statusCode}`));
            return;
          }
          setTimeout(tick, 500);
        },
      );

      req.on("timeout", () => {
        req.destroy();
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Server startup timed out."));
          return;
        }
        setTimeout(tick, 500);
      });
    };

    tick();
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();

    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(
      {
        port,
        host: "0.0.0.0",
        exclusive: true,
      },
    );
  });
}

async function resolveBackendPort(preferredPort) {
  const MAX_ATTEMPTS = 30;
  for (let offset = 0; offset < MAX_ATTEMPTS; offset += 1) {
    const candidate = preferredPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No available local port found near ${preferredPort}.`);
}

async function startBackend() {
  writeStartupLog("Starting backend");
  loadRuntimeEnv();

  const configuredPort = parseInt(process.env.PORT || "5000", 10);
  const requestedPort = Number.isFinite(configuredPort) ? configuredPort : 5000;
  const port = await resolveBackendPort(requestedPort);
  const fallbackDataDir = path.join(app.getPath("userData"), "data");
  const fallbackUploadsDir = path.join(app.getPath("userData"), "uploads");

  process.env.PORT = String(port);
  process.env.NODE_ENV = "production";
  process.env.FORCE_LOCAL_STORAGE = "true";
  process.env.FORCE_LOCAL_AUTH_BYPASS = "true";
  process.env.LOCAL_USER_ID = process.env.LOCAL_USER_ID || "local-user";
  process.env.LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR || fallbackDataDir;
  process.env.LOCAL_UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR || fallbackUploadsDir;
  process.env.FORCE_INSECURE_COOKIE = "true";
  fs.mkdirSync(process.env.LOCAL_DATA_DIR, { recursive: true });
  fs.mkdirSync(process.env.LOCAL_UPLOADS_DIR, { recursive: true });
  migrateLegacyData(process.env.LOCAL_DATA_DIR);
  migrateLegacyUploads(process.env.LOCAL_UPLOADS_DIR);

  try {
    process.chdir(app.getAppPath());
  } catch {
    // Best effort: static file resolution still has fallback paths.
  }

  const serverEntry = path.join(app.getAppPath(), "dist", "index.cjs");
  require(serverEntry);

  await waitForServer(port);
  writeStartupLog(`Backend ready on port ${port}`);
  return port;
}

function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 920,
      minHeight: 640,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: "#0b0f19",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
  });

  const url = `http://127.0.0.1:${port}`;
  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!targetUrl.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(targetUrl);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  setTimeout(() => {
    if (!mainWindow) return;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 5000);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null);
      backendPort = await startBackend();
      createWindow(backendPort);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeStartupLog(`Startup failed: ${message}`);
      dialog.showErrorBox(
        "MyTradebook Startup Failed",
        `Could not start local server.\n\n${message}\n\nSet LOCAL_DATA_DIR, then retry.`,
      );
      app.quit();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendPort) {
    createWindow(backendPort);
  }
});
