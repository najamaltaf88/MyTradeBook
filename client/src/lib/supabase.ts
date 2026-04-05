import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseEnabled) {
  console.warn("Supabase env vars are missing. Running in local-only mode.");
}

const noopAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } }, error: null }),
  signInWithPassword: async () => ({
    data: { session: null },
    error: { message: "Supabase is not configured." },
  }),
  signUp: async () => ({
    data: { session: null },
    error: { message: "Supabase is not configured." },
  }),
  resetPasswordForEmail: async () => ({
    data: {},
    error: { message: "Supabase is not configured." },
  }),
  verifyOtp: async () => ({
    data: { user: null, session: null },
    error: { message: "Supabase is not configured." },
  }),
  updateUser: async () => ({
    data: { user: null },
    error: { message: "Supabase is not configured." },
  }),
  signOut: async () => ({ error: null }),
};

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : ({ auth: noopAuth } as unknown as SupabaseClient);
