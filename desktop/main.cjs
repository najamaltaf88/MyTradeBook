const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const dotenv = require("dotenv");

let mainWindow = null;
let backendPort = null;

function loadRuntimeEnv() {
  const userDataEnv = path.join(app.getPath("userData"), ".env");
  const exeDirEnv = path.join(path.dirname(process.execPath), ".env");
  const cwdEnv = path.join(process.cwd(), ".env");
  const localDataDir = path.join(app.getPath("userData"), "data");

  if (!fs.existsSync(userDataEnv)) {
    const content = [
      `LOCAL_DATA_DIR=${localDataDir.replace(/\\/g, "/")}`,
      "PORT=5000",
      "",
    ].join("\n");
    fs.mkdirSync(path.dirname(userDataEnv), { recursive: true });
    fs.writeFileSync(userDataEnv, content, "utf8");
  }

  [cwdEnv, exeDirEnv, userDataEnv].forEach((envFile) => {
    if (fs.existsSync(envFile)) {
      dotenv.config({ path: envFile, override: false });
    }
  });
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
  loadRuntimeEnv();

  const configuredPort = parseInt(process.env.PORT || "5000", 10);
  const requestedPort = Number.isFinite(configuredPort) ? configuredPort : 5000;
  const port = await resolveBackendPort(requestedPort);
  const fallbackDataDir = path.join(app.getPath("userData"), "data");

  process.env.PORT = String(port);
  process.env.NODE_ENV = "production";
  process.env.LOCAL_DATA_DIR = process.env.LOCAL_DATA_DIR || fallbackDataDir;
  process.env.FORCE_INSECURE_COOKIE = "true";
  fs.mkdirSync(process.env.LOCAL_DATA_DIR, { recursive: true });

  try {
    process.chdir(app.getAppPath());
  } catch {
    // Best effort: static file resolution still has fallback paths.
  }

  const serverEntry = path.join(app.getAppPath(), "dist", "index.cjs");
  require(serverEntry);

  await waitForServer(port);
  return port;
}

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 920,
      minHeight: 640,
      show: false,
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
    mainWindow.show();
  });

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
