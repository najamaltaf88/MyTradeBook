import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  loading: boolean;
  isRecovery: boolean;
  authEvent: AuthChangeEvent | null;
  clearRecovery: () => void;
};

function detectRecoveryLink() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  return hash.includes("type=recovery") || search.includes("type=recovery");
}

export function useSupabaseSession(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState<AuthChangeEvent | null>(null);
  const [isRecovery, setIsRecovery] = useState(() => detectRecoveryLink());

  useEffect(() => {
    let mounted = true;
    setIsRecovery(detectRecoveryLink());

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, newSession: Session | null) => {
      if (!mounted) return;
      setAuthEvent(event);
      setIsRecovery(event === "PASSWORD_RECOVERY" || detectRecoveryLink());
      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading,
    isRecovery,
    authEvent,
    clearRecovery: () => {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      setIsRecovery(false);
      setAuthEvent(null);
    },
  };
}
