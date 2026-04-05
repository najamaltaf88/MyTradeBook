import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase, supabaseEnabled } from "@/lib/supabase";

function formatNetworkError(error: unknown): Error {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error("Request timed out. Please try again.");
  }
  return new Error(
    supabaseEnabled
      ? "Network connection failed. Please check your internet."
      : "Unable to reach the local server. Please restart MyTradebook and try again.",
  );
}

async function extractApiErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await res.json() as { message?: string; error?: string };
      if (payload?.message) return payload.message;
      if (payload?.error) return payload.error;
    } catch {
      // Fall through to text parsing.
    }
  }

  try {
    const text = (await res.text()).trim();
    if (text) return text;
  } catch {
    // Ignore body parsing errors.
  }

  return res.statusText || "Request failed";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const message = await extractApiErrorMessage(res);
    throw new Error(message);
  }
}

export async function buildAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res: Response;
  try {
    const authHeaders = await buildAuthHeaders();
    const headers: HeadersInit = { ...authHeaders };
    if (method.toUpperCase() !== "GET" && method.toUpperCase() !== "HEAD") {
      Object.assign(headers, { "X-Mytradebook-Request": "1" });
    }
    if (data !== undefined) {
      Object.assign(headers, { "Content-Type": "application/json" });
    }
    res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (error) {
    throw formatNetworkError(error);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let res: Response;
    const url = String(queryKey[0] ?? "");
    try {
      const authHeaders = await buildAuthHeaders();
      res = await fetch(url, {
        headers: authHeaders,
        credentials: "include",
      });
    } catch (error) {
      throw formatNetworkError(error);
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: 120000,
      retry: 1,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
