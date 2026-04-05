import { useEffect, useState } from "react";

export type AnalysisStyle = "scalping" | "intraday" | "swing";

const ANALYSIS_STYLE_KEY = "mytradebook.analysisStyle";

export function normalizeAnalysisStyle(value?: string | null): AnalysisStyle {
  const normalized = String(value || "").toLowerCase().trim();
  if (normalized === "scalping" || normalized === "intraday" || normalized === "swing") {
    return normalized;
  }
  return "intraday";
}

export function useAnalysisStyle() {
  const [style, setStyleState] = useState<AnalysisStyle>(() => {
    if (typeof window === "undefined") return "intraday";
    return normalizeAnalysisStyle(window.localStorage.getItem(ANALYSIS_STYLE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ANALYSIS_STYLE_KEY, style);
  }, [style]);

  const setStyle = (next: AnalysisStyle) => {
    setStyleState(normalizeAnalysisStyle(next));
  };

  return { style, setStyle };
}
