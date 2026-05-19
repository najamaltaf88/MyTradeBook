import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Gauge, Layers, Shield, Wallet, AlertTriangle } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useAccount } from "@/hooks/use-account";
import {
  MARGIN_INSTRUMENTS,
  calculateMarginUsage,
  marginRiskBand,
} from "@shared/margin-utils";

const LEVERAGE_PRESETS = [30, 50, 100, 200, 500];

export default function MarginCalculatorPage() {
  const { accounts, selectedAccount } = useAccount();
  const [pair, setPair] = useState("EURUSD");
  const [lots, setLots] = useState("0.10");
  const [leverage, setLeverage] = useState("100");
  const [equity, setEquity] = useState("10000");
  const [price, setPrice] = useState("");
  const [otherMargin, setOtherMargin] = useState("0");

  const defaultInstrument = MARGIN_INSTRUMENTS.EURUSD as NonNullable<typeof MARGIN_INSTRUMENTS[string]>;
  const instrument = MARGIN_INSTRUMENTS[pair] ?? defaultInstrument;

  useEffect(() => {
    if (!price && instrument) {
      setPrice(String(instrument.defaultPrice));
    }
  }, [pair, instrument, price]);

  useEffect(() => {
    const acct = selectedAccount ?? accounts[0];
    if (!acct) return;
    const bal = acct.equity > 0 ? acct.equity : acct.balance;
    if (bal > 0) setEquity(String(Math.round(bal * 100) / 100));
  }, [selectedAccount?.id, accounts]);

  const result = useMemo(() => {
    return calculateMarginUsage({
      lots: parseFloat(lots) || 0,
      leverage: parseFloat(leverage) || 100,
      accountEquity: parseFloat(equity) || 0,
      price: parseFloat(price) || instrument.defaultPrice,
      instrument,
      otherMarginUsed: parseFloat(otherMargin) || 0,
    });
  }, [lots, leverage, equity, price, instrument, otherMargin]);

  const band = marginRiskBand(result.marginUsedPercent);
  const bandClass =
    band === "safe"
      ? "text-profit"
      : band === "moderate"
        ? "text-chart-3"
        : band === "high"
          ? "text-chart-4"
          : "text-loss";

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6" data-testid="page-margin-calculator">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Margin Calculator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how much of your account margin this position uses — by lot size, leverage, pair, and equity.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <Card className="page-fade-in stagger-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" />
              Position inputs
            </CardTitle>
            <CardDescription>Estimates for USD-denominated accounts (standard retail formula).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Pair / instrument</Label>
                <Select value={pair} onValueChange={(v) => { setPair(v); setPrice(""); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MARGIN_INSTRUMENTS).map(([key, inst]) => (
                      <SelectItem key={key} value={key}>
                        {inst.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="price">Current price</Label>
                <Input
                  id="price"
                  type="number"
                  step="any"
                  className="mt-1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lots">Lot size</Label>
                <Input
                  id="lots"
                  type="number"
                  step="0.01"
                  min="0"
                  className="mt-1"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="leverage">Leverage (1:)</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="leverage"
                    type="number"
                    min="1"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                  />
                  <Select
                    value={LEVERAGE_PRESETS.includes(Number(leverage)) ? leverage : ""}
                    onValueChange={setLeverage}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Preset" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVERAGE_PRESETS.map((l) => (
                        <SelectItem key={l} value={String(l)}>
                          1:{l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="equity">Account equity ($)</Label>
                <Input
                  id="equity"
                  type="number"
                  className="mt-1"
                  value={equity}
                  onChange={(e) => setEquity(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="other">Other open margin used ($)</Label>
                <Input
                  id="other"
                  type="number"
                  className="mt-1"
                  value={otherMargin}
                  onChange={(e) => setOtherMargin(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="page-fade-in stagger-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Margin usage</CardTitle>
            <CardDescription>Target: stay well below 50% on live accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Margin used</span>
                <span className={cn("text-2xl font-bold", bandClass)}>
                  {formatPercent(result.marginUsedPercent, { decimals: 1 })}
                </span>
              </div>
              <Progress value={Math.min(result.marginUsedPercent, 100)} className="h-3" />
              <p className="mt-2 text-xs text-muted-foreground">
                {band === "safe" && "Comfortable cushion — room for drawdown."}
                {band === "moderate" && "Acceptable for one position; avoid stacking many trades."}
                {band === "high" && "High utilization — margin call risk increases quickly."}
                {band === "critical" && "Danger zone — reduce lots or leverage immediately."}
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Notional exposure</span>
                <span className="font-mono font-medium">{formatCurrency(result.notional)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margin this trade</span>
                <span className="font-mono font-medium">{formatCurrency(result.marginRequired)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Free margin (est.)</span>
                <span className={cn("font-mono font-medium", result.freeMargin < 0 ? "text-loss" : "")}>
                  {formatCurrency(result.freeMargin)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margin level</span>
                <span className="font-mono font-medium">
                  {result.marginLevelPercent >= 9999 ? "—" : `${formatPercent(result.marginLevelPercent, { decimals: 0 })}`}
                </span>
              </div>
            </div>

            <Badge variant="outline" className="w-full justify-center py-2">
              Max lots at 100% margin (theoretical): {result.maxLotsAt100Percent}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3 page-fade-in stagger-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              Risk calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Size lots from stop distance and % risk per trade.
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
              <Link href="/risk-calculator">Open position sizing →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4" />
              Journal P&amp;L
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Calendar daily/weekly/monthly realized P&amp;L from closed trades.
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
              <Link href="/">Dashboard calendar →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4" />
              Playbook rules
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Log rules after each close — builds compliance score automatically.
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs">
              <Link href="/playbook">Edit playbook →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-chart-4/30 bg-chart-4/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-chart-4" />
          <p className="text-muted-foreground">
            Margin math varies by broker (contract size, hedging, currency). Use this for planning; confirm in MT5
            Terminal → Trade tab before live size.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
