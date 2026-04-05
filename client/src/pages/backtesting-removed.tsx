import { useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BacktestingRemovedPage() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.location.href = "/crypto-charts";
    }, 1200);

    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-4" data-testid="page-backtesting-removed">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Backtesting Removed</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Backtesting has been removed. Redirecting you to Crypto Charts.
        </p>
      </div>

      <Card className="page-fade-in stagger-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Crypto Charts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p>
            Use TradingView charts and CoinMarketCap market data for live crypto views.
          </p>
          <Link href="/crypto-charts" className="text-primary underline underline-offset-4">
            Open Crypto Charts
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
