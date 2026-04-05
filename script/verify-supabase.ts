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

function isRemoteUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function extractObjectPath(value: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return value.slice(idx + marker.length);
}

function counts(snapshot: any) {
  const fields = [
    "users",
    "accounts",
    "trades",
    "tradeNotes",
    "playbookRules",
    "performanceGoals",
    "backtestCandleCache",
    "aiAnalysisLogs",
    "alertConfigs",
    "alertHistory",
    "tradeTemplates",
    "complianceLogs",
    "backtestResults",
    "strategyConceptNotes",
  ];
  const result: Record<string, number> = {};
  for (const field of fields) {
    result[field] = Array.isArray(snapshot?.[field]) ? snapshot[field].length : 0;
  }
  return result;
}

async function fileExistsInBucket(objectPath: string) {
  const parts = objectPath.split("/");
  const filename = parts.pop() || "";
  const dir = parts.join("/");
  const { data, error } = await supabase.storage.from(bucket).list(dir, { limit: 1000 });
  if (error) return false;
  return (data || []).some((item) => item.name === filename);
}

async function main() {
  const dataPath = resolveDataPath();
  if (!fs.existsSync(dataPath)) {
    console.error(`No local data found at ${dataPath}`);
    process.exit(1);
  }

  const local = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const { data, error } = await supabase
    .from(table)
    .select("data")
    .eq("id", key)
    .maybeSingle();

  if (error) throw error;
  if (!data?.data) {
    console.error("No app_state row found in Supabase.");
    process.exit(1);
  }

  const remote = data.data;
  const localCounts = counts(local);
  const remoteCounts = counts(remote);

  console.log("Local counts:", localCounts);
  console.log("Remote counts:", remoteCounts);

  const mismatches = Object.keys(localCounts).filter((key) => localCounts[key] !== remoteCounts[key]);
  if (mismatches.length) {
    console.warn("Count mismatches:", mismatches);
  } else {
    console.log("All counts match.");
  }

  const fileUrls: string[] = [];
  for (const trade of Array.isArray(remote?.trades) ? remote.trades : []) {
    if (trade?.screenshotUrl && isRemoteUrl(trade.screenshotUrl)) fileUrls.push(trade.screenshotUrl);
  }
  for (const note of Array.isArray(remote?.strategyConceptNotes) ? remote.strategyConceptNotes : []) {
    if (note?.imageUrl && isRemoteUrl(note.imageUrl)) fileUrls.push(note.imageUrl);
  }

  const objectPaths = Array.from(
    new Set(
      fileUrls
        .map((url) => extractObjectPath(url))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!objectPaths.length) {
    console.log("No remote storage objects referenced in data.");
    return;
  }

  let missing = 0;
  for (const objectPath of objectPaths) {
    const exists = await fileExistsInBucket(objectPath);
    if (!exists) {
      missing += 1;
      console.warn(`Missing object in bucket: ${objectPath}`);
    }
  }

  if (missing === 0) {
    console.log("All referenced storage objects exist in bucket.");
  } else {
    console.warn(`Missing ${missing} storage objects.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
