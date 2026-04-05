import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "tradebook-uploads";
const table = process.env.SUPABASE_STATE_TABLE || "app_state";
const key = process.env.SUPABASE_STATE_KEY || "global";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function resolveDataPath() {
  const baseDir = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), ".mytradebook-data");
  return path.join(baseDir, "data.json");
}

function extractFilename(value: unknown) {
  if (!value || typeof value !== "string") return null;
  if (/^https?:\/\//i.test(value)) return null;
  const cleaned = value.split("?")[0].split("#")[0].replace(/\\/g, "/");
  const parts = cleaned.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

async function ensureBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (data?.some((b) => b.name === bucket)) return;
  await supabase.storage.createBucket(bucket, { public: true });
}

async function uploadFile(filePath: string, objectPath: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, fileBuffer, { upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function main() {
  const dataPath = resolveDataPath();
  if (!fs.existsSync(dataPath)) {
    console.error(`No local data found at ${dataPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const uploadsDir = path.join(process.cwd(), "uploads");
  const fileMap = new Map<string, string>();

  await ensureBucket();

  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter((name) => !name.startsWith("."));
    for (const filename of files) {
      const filePath = path.join(uploadsDir, filename);
      if (!fs.statSync(filePath).isFile()) continue;
      const objectPath = `legacy/${filename}`;
      const url = await uploadFile(filePath, objectPath);
      fileMap.set(filename, url);
    }
  }

  const replaceFile = (value: unknown) => {
    const filename = extractFilename(value);
    if (!filename) return value;
    return fileMap.get(filename) || value;
  };

  if (Array.isArray(raw?.trades)) {
    raw.trades = raw.trades.map((trade: any) => ({
      ...trade,
      screenshotUrl: replaceFile(trade.screenshotUrl),
    }));
  }

  if (Array.isArray(raw?.strategyConceptNotes)) {
    raw.strategyConceptNotes = raw.strategyConceptNotes.map((note: any) => ({
      ...note,
      imageUrl: replaceFile(note.imageUrl),
    }));
  }

  const payload = {
    id: key,
    data: raw,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
  if (error) throw error;

  console.log("Migration completed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
