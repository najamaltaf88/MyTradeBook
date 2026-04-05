export const TRADING_SESSION_DEFINITIONS = [
  { name: "Asian", startHour: 0, endHour: 8 },
  { name: "London", startHour: 8, endHour: 13 },
  { name: "London/NY Overlap", startHour: 13, endHour: 17 },
  { name: "New York", startHour: 17, endHour: 22 },
] as const;

export const TRADING_SESSION_ORDER = [
  "Asian",
  "London",
  "London/NY Overlap",
  "New York",
  "Off-hours",
] as const;

export type TradingSessionName = (typeof TRADING_SESSION_ORDER)[number];

export function resolveTradingSessionFromUtcHour(hour: number): TradingSessionName {
  const normalized = Number.isFinite(hour)
    ? ((Math.floor(hour) % 24) + 24) % 24
    : 0;

  for (const session of TRADING_SESSION_DEFINITIONS) {
    if (normalized >= session.startHour && normalized < session.endHour) {
      return session.name;
    }
  }

  return "Off-hours";
}
