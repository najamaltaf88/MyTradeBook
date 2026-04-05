import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");
const defaultDataDir = path.join(rootDir, ".mytradebook-data");

function ensureEnvFile() {
  if (!fs.existsSync(envPath)) {
    let envContent = "";
    if (fs.existsSync(envExamplePath)) {
      envContent = fs.readFileSync(envExamplePath, "utf8");
    } else {
      envContent = [
        "LOCAL_DATA_DIR=.mytradebook-data",
        "PORT=5000",
        "",
      ].join("\n");
    }

    if (!/LOCAL_DATA_DIR=/m.test(envContent)) {
      envContent = `LOCAL_DATA_DIR=.mytradebook-data\n${envContent}`;
    }

    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Created .env from .env.example");
    return;
  }

  let envContent = fs.readFileSync(envPath, "utf8");
  let changed = false;

  if (!/LOCAL_DATA_DIR=/m.test(envContent)) {
    envContent = `LOCAL_DATA_DIR=.mytradebook-data\n${envContent}`;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("Updated .env for local desktop mode");
  }
}

function resolveLocalDataDirFromEnv(): string {
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const rawValue = envContent
    .split(/\r?\n/)
    .find((line) => line.startsWith("LOCAL_DATA_DIR="))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim();

  if (!rawValue) {
    return defaultDataDir;
  }

  return path.isAbsolute(rawValue) ? rawValue : path.resolve(rootDir, rawValue);
}

function main() {
  ensureEnvFile();

  const dataDir = resolveLocalDataDirFromEnv();
  fs.mkdirSync(dataDir, { recursive: true });

  console.log(`Desktop setup complete. Local data directory: ${dataDir}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
