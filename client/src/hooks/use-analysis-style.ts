export type AnalysisStyle = "all";

export function normalizeAnalysisStyle(): AnalysisStyle {
  return "all";
}

export function useAnalysisStyle() {
  const setStyle: (next: AnalysisStyle) => void = () => {};

  return {
    style: "all" as AnalysisStyle,
    setStyle,
  };
}
