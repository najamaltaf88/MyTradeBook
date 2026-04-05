import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface TimezoneContextType {
  timezone: string;
  tzLabel: string;
  setTimezone: (tz: string) => void;
}

const TimezoneContext = createContext<TimezoneContextType>({
  timezone: "UTC",
  tzLabel: "UTC",
  setTimezone: () => {},
});

export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "EST/EDT (New York)" },
  { value: "America/Chicago", label: "CST/CDT (Chicago)" },
  { value: "America/Denver", label: "MST/MDT (Denver)" },
  { value: "America/Los_Angeles", label: "PST/PDT (Los Angeles)" },
  { value: "America/Anchorage", label: "AKST (Alaska)" },
  { value: "Pacific/Honolulu", label: "HST (Hawaii)" },
  { value: "America/Toronto", label: "EST/EDT (Toronto)" },
  { value: "America/Sao_Paulo", label: "BRT (São Paulo)" },
  { value: "Europe/London", label: "GMT/BST (London)" },
  { value: "Europe/Paris", label: "CET/CEST (Paris)" },
  { value: "Europe/Berlin", label: "CET/CEST (Berlin)" },
  { value: "Europe/Moscow", label: "MSK (Moscow)" },
  { value: "Europe/Istanbul", label: "TRT (Istanbul)" },
  { value: "Asia/Dubai", label: "GST (Dubai)" },
  { value: "Asia/Karachi", label: "PKT (Karachi)" },
  { value: "Asia/Kolkata", label: "IST (India)" },
  { value: "Asia/Bangkok", label: "ICT (Bangkok)" },
  { value: "Asia/Singapore", label: "SGT (Singapore)" },
  { value: "Asia/Shanghai", label: "CST (Shanghai)" },
  { value: "Asia/Tokyo", label: "JST (Tokyo)" },
  { value: "Australia/Sydney", label: "AEST/AEDT (Sydney)" },
  { value: "Pacific/Auckland", label: "NZST/NZDT (Auckland)" },
  { value: "Africa/Lagos", label: "WAT (Lagos)" },
  { value: "Africa/Cairo", label: "EET (Cairo)" },
  { value: "Africa/Johannesburg", label: "SAST (Johannesburg)" },
];
const TIMEZONE_STORAGE_KEY = "mytradebook.timezone";

function isValidTimezone(value: string | null | undefined): value is string {
  if (!value) return false;
  return TIMEZONE_OPTIONS.some((option) => option.value === value);
}

function getInitialTimezone(): string {
  if (typeof window === "undefined") return "UTC";

  const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
  if (isValidTimezone(stored)) {
    return stored;
  }

  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (isValidTimezone(systemTimezone)) {
    return systemTimezone;
  }

  return "UTC";
}

function getTzAbbr(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value || tz;
  } catch {
    return tz;
  }
}

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTzState] = useState(getInitialTimezone);

  const setTimezone = useCallback(async (tz: string) => {
    if (!isValidTimezone(tz)) return;
    setTzState(tz);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TIMEZONE_STORAGE_KEY, timezone);
  }, [timezone]);

  const tzLabel = getTzAbbr(timezone);

  return (
    <TimezoneContext.Provider value={{ timezone, tzLabel, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  return useContext(TimezoneContext);
}
