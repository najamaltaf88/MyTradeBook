import https from "https";
import { calculateTradePips } from "@shared/trade-utils";

const metaApiAgent = new https.Agent({ rejectUnauthorized: false });

function metaApiFetchRaw(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || "GET",
      headers: options.headers || {},
      agent: metaApiAgent,
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        const respHeaders: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (!val) continue;
          if (Array.isArray(val)) {
            const firstValue = val.find((entry): entry is string => typeof entry === "string");
            if (firstValue) {
              respHeaders[key] = firstValue;
            }
            continue;
          }
          respHeaders[key] = val;
        }
        resolve({ status: res.statusCode || 0, headers: respHeaders, body: data });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const METAAPI_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

let cachedDomain: string | null = null;

async function resolveDomain(): Promise<string> {
  if (cachedDomain) return cachedDomain;
  try {
    const token = getToken();
    const res = await metaApiFetchRaw(
      `${METAAPI_BASE}/users/current/servers/mt-client-api`,
      { headers: { "auth-token": token } }
    );
    if (res.status === 200) {
      const data = JSON.parse(res.body) as { domain?: unknown };
      const resolvedDomain =
        typeof data.domain === "string" && data.domain.trim().length > 0
          ? data.domain
          : "agiliumtrade.ai";
      cachedDomain = resolvedDomain;
      return resolvedDomain;
    }
  } catch (e) {
    console.log("Could not resolve domain, using default:", e);
  }
  cachedDomain = "agiliumtrade.ai";
  return cachedDomain;
}

async function getRpcBase(region: string = "london") {
  const domain = await resolveDomain();
  return `https://mt-client-api-v1.${region}.${domain}`;
}

function getToken(): string {
  const token = process.env.METAAPI_TOKEN;
  if (!token) throw new Error("METAAPI_TOKEN is not set");
  return token;
}

async function metaApiFetch(url: string, options: RequestInit = {}, retries = 2): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "auth-token": token,
  };
  if (options.headers) {
    const h = options.headers as Record<string, string>;
    Object.assign(headers, h);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await metaApiFetchRaw(url, {
        method: (options.method as string) || "GET",
        headers,
        body: options.body as string | undefined,
      });

      if (res.status >= 400) {
        if (attempt < retries && (res.status === 502 || res.status === 503 || res.status === 429)) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(`MetaApi error ${res.status}: ${res.body}`);
      }

      const contentType = res.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        return JSON.parse(res.body);
      }
      return res.body;
    } catch (err: any) {
      if (attempt < retries && (err.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || err.message?.includes("ECONNRESET"))) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

export async function createMt5Account(
  server: string,
  login: string,
  password: string,
  name: string,
  platform: string = "mt5"
): Promise<{ accountId: string }> {
  const data = await metaApiFetch(`${METAAPI_BASE}/users/current/accounts`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type: "cloud",
      login,
      password,
      server,
      platform,
      magic: 0,
    }),
  });

  const accountId = data.id;

  await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/deploy`, {
    method: "POST",
  });

  let deployed = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const account = await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}`);
    if (account.state === "DEPLOYED") {
      deployed = true;
      break;
    }
  }

  if (!deployed) {
    throw new Error("Account deployment timed out. Please try again.");
  }

  return { accountId };
}

async function getAccountRegion(metaapiAccountId: string): Promise<string> {
  const account = await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${metaapiAccountId}`);
  return account.region || "london";
}

export async function getAccountInfo(metaapiAccountId: string) {
  const account = await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${metaapiAccountId}`);
  const region = account.region || "london";
  const rpcBase = await getRpcBase(region);

  if (account.connectionStatus !== "CONNECTED") {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const updated = await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${metaapiAccountId}`);
      if (updated.connectionStatus === "CONNECTED") {
        break;
      }
    }
  }

  const info = await metaApiFetch(
    `${rpcBase}/users/current/accounts/${metaapiAccountId}/account-information`
  );

  return info;
}

export async function fetchTradeHistory(metaapiAccountId: string, startDate?: Date) {
  const region = await getAccountRegion(metaapiAccountId);
  const rpcBase = await getRpcBase(region);

  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = new Date();

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const deals = await metaApiFetch(
    `${rpcBase}/users/current/accounts/${metaapiAccountId}/history-deals/time/${startIso}/${endIso}`
  );

  return deals;
}

export async function getOpenPositions(metaapiAccountId: string) {
  const region = await getAccountRegion(metaapiAccountId);
  const rpcBase = await getRpcBase(region);

  const positions = await metaApiFetch(
    `${rpcBase}/users/current/accounts/${metaapiAccountId}/positions`
  );

  return positions;
}

export async function removeMetaApiAccount(metaapiAccountId: string) {
  try {
    await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${metaapiAccountId}/undeploy`, {
      method: "POST",
    });
    await new Promise((r) => setTimeout(r, 5000));
  } catch (e) {
    console.log("Undeploy error (may be already undeployed):", e);
  }

  await metaApiFetch(`${METAAPI_BASE}/users/current/accounts/${metaapiAccountId}`, {
    method: "DELETE",
  });
}

export function processDealsToTrades(dealsPayload: unknown, accountId: string) {
  const tradeMap = new Map<string, any>();

  const dealList: any[] = Array.isArray(dealsPayload)
    ? dealsPayload
    : (dealsPayload as { deals?: any[]; items?: any[] } | null)?.deals ||
      (dealsPayload as { deals?: any[]; items?: any[] } | null)?.items ||
      [];
  if (!dealList || !Array.isArray(dealList)) return [];

  for (const deal of dealList) {
    if (!deal.positionId || deal.type === "DEAL_TYPE_BALANCE") continue;

    const posId = String(deal.positionId);

    if (!tradeMap.has(posId)) {
      tradeMap.set(posId, {
        ticket: posId,
        accountId,
        symbol: deal.symbol || "UNKNOWN",
        type: deal.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL",
        openTime: new Date(deal.time),
        openPrice: deal.price || 0,
        volume: deal.volume || 0,
        profit: 0,
        commission: 0,
        swap: 0,
        stopLoss: deal.stopLoss || null,
        takeProfit: deal.takeProfit || null,
        isClosed: false,
      });
    }

    const trade = tradeMap.get(posId)!;

    if (deal.entryType === "DEAL_ENTRY_IN") {
      trade.openTime = new Date(deal.time);
      trade.openPrice = deal.price || trade.openPrice;
      trade.volume = deal.volume || trade.volume;
      trade.type = deal.type === "DEAL_TYPE_BUY" ? "BUY" : "SELL";
      if (deal.stopLoss) trade.stopLoss = deal.stopLoss;
      if (deal.takeProfit) trade.takeProfit = deal.takeProfit;
    }

    if (deal.entryType === "DEAL_ENTRY_OUT" || deal.entryType === "DEAL_ENTRY_OUT_BY") {
      trade.closeTime = new Date(deal.time);
      trade.closePrice = deal.price || 0;
      trade.isClosed = true;
    }

    trade.profit += deal.profit || 0;
    trade.commission += deal.commission || 0;
    trade.swap += deal.swap || 0;

    if (trade.openTime && trade.closeTime) {
      trade.duration = Math.floor(
        (new Date(trade.closeTime).getTime() - new Date(trade.openTime).getTime()) / 1000
      );
    }

    if (trade.openPrice && trade.closePrice && trade.isClosed) {
      trade.pips = calculateTradePips(
        trade.symbol,
        trade.type,
        trade.openPrice,
        trade.closePrice,
      );
    }
  }

  return Array.from(tradeMap.values()).map((t) => ({
    ...t,
    profit: Math.round(t.profit * 100) / 100,
    commission: Math.round(t.commission * 100) / 100,
    swap: Math.round(t.swap * 100) / 100,
  }));
}
