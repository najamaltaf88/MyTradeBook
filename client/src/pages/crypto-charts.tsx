import { useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";

const DEFAULT_SYMBOL = "BINANCE:BTCUSDT";
const DEFAULT_INTERVAL = "60";

export default function CryptoChartsPage() {
  const { theme } = useTheme();
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetRef.current) return;
    widgetRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: DEFAULT_SYMBOL,
      interval: DEFAULT_INTERVAL,
      timezone: "Etc/UTC",
      theme: theme === "dark" ? "dark" : "light",
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: true,
      withdateranges: true,
      hide_side_toolbar: false,
      details: true,
      calendar: true,
      support_host: "https://www.tradingview.com",
    });
    widgetRef.current.appendChild(script);

    return () => {
      if (widgetRef.current) widgetRef.current.innerHTML = "";
    };
  }, [theme]);

  return (
    <div className="flex h-[calc(100vh-96px)] flex-col gap-4 p-4 md:p-6" data-testid="page-crypto-charts">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Crypto Charts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full-screen TradingView chart. Use in-chart search to change symbols.
        </p>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-inner">
        <div ref={widgetRef} className="h-full w-full" data-testid="tradingview-widget" />
      </div>
    </div>
  );
}
