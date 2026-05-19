/**
 * Retail FX margin estimates (USD account baseline).
 * Margin = notional / leverage; notional depends on instrument contract size.
 */

export type MarginInstrument = {
  symbol: string;
  label: string;
  contractSize: number;
  /** When true, notional = lots × contractSize × price (e.g. EURUSD, XAU). */
  usesPriceInNotional: boolean;
  defaultPrice: number;
};

export const MARGIN_INSTRUMENTS: Record<string, MarginInstrument> = {
  EURUSD: { symbol: "EURUSD", label: "EUR/USD", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 1.085 },
  GBPUSD: { symbol: "GBPUSD", label: "GBP/USD", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 1.265 },
  AUDUSD: { symbol: "AUDUSD", label: "AUD/USD", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 0.655 },
  NZDUSD: { symbol: "NZDUSD", label: "NZD/USD", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 0.595 },
  USDCAD: { symbol: "USDCAD", label: "USD/CAD", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 1.36 },
  USDCHF: { symbol: "USDCHF", label: "USD/CHF", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 0.88 },
  USDJPY: { symbol: "USDJPY", label: "USD/JPY", contractSize: 100_000, usesPriceInNotional: false, defaultPrice: 150 },
  EURJPY: { symbol: "EURJPY", label: "EUR/JPY", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 162 },
  GBPJPY: { symbol: "GBPJPY", label: "GBP/JPY", contractSize: 100_000, usesPriceInNotional: true, defaultPrice: 190 },
  XAUUSD: { symbol: "XAUUSD", label: "Gold XAU/USD", contractSize: 100, usesPriceInNotional: true, defaultPrice: 2650 },
  XAGUSD: { symbol: "XAGUSD", label: "Silver XAG/USD", contractSize: 5000, usesPriceInNotional: true, defaultPrice: 31 },
  US30: { symbol: "US30", label: "US30 / Dow", contractSize: 1, usesPriceInNotional: true, defaultPrice: 39_000 },
  NAS100: { symbol: "NAS100", label: "NAS100", contractSize: 1, usesPriceInNotional: true, defaultPrice: 18_500 },
  BTCUSD: { symbol: "BTCUSD", label: "BTC/USD", contractSize: 1, usesPriceInNotional: true, defaultPrice: 95_000 },
};

export type MarginCalculationInput = {
  lots: number;
  leverage: number;
  accountEquity: number;
  price: number;
  instrument: MarginInstrument;
  /** Margin already tied up in other open positions (optional). */
  otherMarginUsed?: number;
};

export type MarginCalculationResult = {
  notional: number;
  marginRequired: number;
  totalMarginUsed: number;
  marginUsedPercent: number;
  freeMargin: number;
  marginLevelPercent: number;
  maxLotsAt100Percent: number;
};

export function calculateMarginUsage(input: MarginCalculationInput): MarginCalculationResult {
  const lots = Math.max(0, input.lots);
  const leverage = Math.max(1, input.leverage);
  const equity = Math.max(0, input.accountEquity);
  const price = Math.max(0, input.price);
  const other = Math.max(0, input.otherMarginUsed ?? 0);

  const notional = input.instrument.usesPriceInNotional
    ? lots * input.instrument.contractSize * price
    : lots * input.instrument.contractSize;

  const marginRequired = notional / leverage;
  const totalMarginUsed = marginRequired + other;
  const marginUsedPercent = equity > 0 ? (totalMarginUsed / equity) * 100 : 0;
  const freeMargin = equity - totalMarginUsed;
  const marginLevelPercent = totalMarginUsed > 0 ? (equity / totalMarginUsed) * 100 : 9999;

  let maxLotsAt100Percent = 0;
  if (equity > other && leverage > 0) {
    const budget = equity - other;
    if (input.instrument.usesPriceInNotional && price > 0) {
      maxLotsAt100Percent = (budget * leverage) / (input.instrument.contractSize * price);
    } else {
      maxLotsAt100Percent = (budget * leverage) / input.instrument.contractSize;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    notional: round2(notional),
    marginRequired: round2(marginRequired),
    totalMarginUsed: round2(totalMarginUsed),
    marginUsedPercent: round2(marginUsedPercent),
    freeMargin: round2(freeMargin),
    marginLevelPercent: round2(Math.min(marginLevelPercent, 9999)),
    maxLotsAt100Percent: Math.max(0, Math.floor(maxLotsAt100Percent * 100) / 100),
  };
}

export function marginRiskBand(percent: number): "safe" | "moderate" | "high" | "critical" {
  if (percent <= 20) return "safe";
  if (percent <= 50) return "moderate";
  if (percent <= 80) return "high";
  return "critical";
}
