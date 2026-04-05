import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";

const hasAdminConfig = Boolean(supabaseUrl && serviceRoleKey);
export const supabaseEnabled = hasAdminConfig;

export const supabaseAdmin = hasAdminConfig
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";
export const SUPABASE_STATE_KEY = process.env.SUPABASE_STATE_KEY || "global";
export const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "tradebook-uploads";

export async function fetchSupabaseUser(accessToken: string) {
  if (!supabaseUrl || (!anonKey && !serviceRoleKey)) return null;
  const apiKey = anonKey || serviceRoleKey;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
  });

  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; email?: string | null }>;
}
