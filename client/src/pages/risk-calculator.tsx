import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calculator, Shield, AlertTriangle, Target, DollarSign, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type InstrumentConfig = {
  label: string;
  pipValue: number;
  pipSize: number;
};

const COMMON_PAIRS: Record<string, InstrumentConfig> = {
  EURUSD: { label: "EUR/USD", pipValue: 10, pipSize: 0.0001 },
  GBPUSD: { label: "GBP/USD", pipValue: 10, pipSize: 0.0001 },
  USDJPY: { label: "USD/JPY", pipValue: 6.67, pipSize: 0.01 },
  AUDUSD: { label: "AUD/USD", pipValue: 10, pipSize: 0.0001 },
  USDCAD: { label: "USD/CAD", pipValue: 7.25, pipSize: 0.0001 },
  NZDUSD: { label: "NZD/USD", pipValue: 10, pipSize: 0.0001 },
  USDCHF: { label: "USD/CHF", pipValue: 10.75, pipSize: 0.0001 },
  XAUUSD: { label: "Gold (XAU/USD)", pipValue: 10, pipSize: 0.1 },
  XAGUSD: { label: "Silver (XAG/USD)", pipValue: 50, pipSize: 0.01 },
  US30: { label: "US30 / Dow Jones", pipValue: 1, pipSize: 1 },
  NAS100: { label: "NAS100 / Nasdaq", pipValue: 1, pipSize: 1 },
  BTCUSD: { label: "BTC/USD", pipValue: 1, pipSize: 1 },
};

export default function RiskCalculator() {
  const [balance, setBalance] = useState<string>("10000");
  const [riskPercent, setRiskPercent] = useState<string>("1");
  const [stopLossPips, setStopLossPips] = useState<string>("20");
  const [takeProfitPips, setTakeProfitPips] = useState<string>("40");
  const [selectedPair, setSelectedPair] = useState<string>("XAUUSD");
  const [customPipValue, setCustomPipValue] = useState<string>("10");

  const bal = parseFloat(balance) || 0;
  const risk = parseFloat(riskPercent) || 0;
  const slPips = parseFloat(stopLossPips) || 0;
  const tpPips = parseFloat(takeProfitPips) || 0;

  const selectedInstrument = COMMON_PAIRS[selectedPair];

  const pipValuePerLot = selectedPair === "custom"
    ? Math.max(parseFloat(customPipValue) || 0, 0.01)
    : selectedInstrument?.pipValue || 10;
  const pipSize = selectedPair === "custom"
    ? null
    : selectedInstrument?.pipSize || 0.0001;

  const riskAmount = bal > 0 && risk > 0 ? Math.round(bal * (risk / 100) * 100) / 100 : 0;
  const positionSize = slPips > 0 && pipValuePerLot > 0 && riskAmount > 0 ? riskAmount / (slPips * pipValuePerLot) : 0;
  const positionSizeRounded = isFinite(positionSize) && positionSize > 0 ? Math.floor(positionSize * 100) / 100 : 0;
  const potentialLoss = positionSizeRounded > 0 && slPips > 0 ? Math.round(positionSizeRounded * slPips * pipValuePerLot * 100) / 100 : 0;
  const potentialProfit = positionSizeRounded > 0 && tpPips > 0 ? Math.round(positionSizeRounded * tpPips * pipValuePerLot * 100) / 100 : 0;
  const rr = slPips > 0 && tpPips > 0 ? Math.round((tpPips / slPips) * 100) / 100 : 0;

  const riskLevel = risk <= 1 ? "conservative" : risk < 2 ? "moderate" : "aggressive";

  const balanceValid = bal > 0;
  const riskValid = risk > 0 && risk <= 100;
  const slValid = slPips > 0;
  const tpValid = tpPips > 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-risk-calculator">
      <div className="page-fade-in">
        <h1 className="text-2xl font-bold tracking-tight">Risk Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calculate position size and manage risk for every trade
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4 page-fade-in stagger-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Position Size Calculator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="balance">Account Balance ($)</Label>
                  <Input
                    id="balance"
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    placeholder="10000"
                    className={cn(!balanceValid && balance !== "" && "border-red-500/50 focus-visible:ring-red-500/30")}
                    data-testid="input-balance"
                  />
                  {!balanceValid && balance !== "" && (
                    <p className="text-[10px] text-red-500 mt-1" data-testid="text-balance-error">Enter a positive balance</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="risk">Risk Per Trade (%)</Label>
                  <Input
                    id="risk"
                    type="number"
                    step="0.25"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(e.target.value)}
                    placeholder="1"
                    className={cn(risk > 5 && "border-red-500/50 focus-visible:ring-red-500/30")}
                    data-testid="input-risk-percent"
                  />
                  {risk > 5 && (
                    <p className="text-[10px] text-red-500 mt-1" data-testid="text-risk-warning">Extremely high risk per trade</p>
                  )}
                </div>
              </div>

              <div>
                <Label>Trading Instrument</Label>
                <Select value={selectedPair} onValueChange={setSelectedPair}>
                  <SelectTrigger data-testid="select-pair">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COMMON_PAIRS).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Pip Value</SelectItem>
                  </SelectContent>
                </Select>
                {selectedPair === "custom" && (
                  <div className="mt-2">
                    <Label htmlFor="customPip">Pip Value per Standard Lot ($)</Label>
                    <Input
                      id="customPip"
                      type="number"
                      value={customPipValue}
                      onChange={(e) => setCustomPipValue(e.target.value)}
                      placeholder="10"
                      data-testid="input-custom-pip"
                    />
                  </div>
                )}
                {selectedPair !== "custom" && pipSize !== null && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    1 pip = {pipSize} price move. 10 pips at 1.0 lot = {formatCurrency(pipValuePerLot * 10)}.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sl">Stop Loss (pips)</Label>
                  <Input
                    id="sl"
                    type="number"
                    value={stopLossPips}
                    onChange={(e) => setStopLossPips(e.target.value)}
                    placeholder="20"
                    className={cn(!slValid && stopLossPips !== "" && "border-red-500/50 focus-visible:ring-red-500/30")}
                    data-testid="input-stop-loss"
                  />
                  {!slValid && stopLossPips !== "" && (
                    <p className="text-[10px] text-red-500 mt-1" data-testid="text-sl-error">Enter a positive stop loss</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="tp">Take Profit (pips)</Label>
                  <Input
                    id="tp"
                    type="number"
                    value={takeProfitPips}
                    onChange={(e) => setTakeProfitPips(e.target.value)}
                    placeholder="40"
                    data-testid="input-take-profit"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Risk Presets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Conservative", pct: "0.5", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
                  { label: "Standard", pct: "1", color: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400" },
                  { label: "Aggressive", pct: "2", color: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" },
                ].map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    onClick={() => setRiskPercent(preset.pct)}
                    className={cn(
                      "h-auto flex-col rounded-lg border p-3 text-center",
                      preset.color,
                      riskPercent === preset.pct && "ring-2 ring-primary"
                    )}
                    data-testid={`button-preset-${preset.label.toLowerCase()}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wider">{preset.label}</p>
                    <p className="text-lg font-bold font-mono mt-1">{preset.pct}%</p>
                    <p className="text-[10px] opacity-70 mt-0.5">${(bal * parseFloat(preset.pct) / 100).toFixed(2)}</p>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 page-fade-in stagger-2">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" />
                Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4 bg-primary/5 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Position Size</p>
                <p className="text-3xl font-bold font-mono text-primary mt-1" data-testid="text-position-size">
                  {positionSizeRounded.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">lots</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5" />
                    Target Risk
                  </span>
                  <span className="text-sm font-mono font-medium text-red-500" data-testid="text-risk-amount">
                    {formatCurrency(riskAmount)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Actual Risk (rounded lot)</span>
                  <span className="text-sm font-mono font-medium">{formatCurrency(potentialLoss)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Potential Profit
                  </span>
                  <span className="text-sm font-mono font-medium text-emerald-500" data-testid="text-potential-profit">
                    {formatCurrency(potentialProfit)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    Risk : Reward
                  </span>
                  <span className="text-sm font-mono font-medium" data-testid="text-rr-ratio">
                    1 : {rr.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pip Value/Lot</span>
                  <span className="text-sm font-mono">${pipValuePerLot.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Risk Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn(
                "rounded-lg p-4 text-center",
                riskLevel === "conservative" && "bg-emerald-500/10",
                riskLevel === "moderate" && "bg-amber-500/10",
                riskLevel === "aggressive" && "bg-red-500/10"
              )}>
                <Badge
                  className={cn(
                    "mb-2",
                    riskLevel === "conservative" && "bg-emerald-500 text-white",
                    riskLevel === "moderate" && "bg-amber-500 text-white",
                    riskLevel === "aggressive" && "bg-red-500 text-white"
                  )}
                  data-testid="badge-risk-level"
                >
                  {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {riskLevel === "conservative" && "Low risk approach. Great for beginners and capital preservation."}
                  {riskLevel === "moderate" && "Standard risk level. Common among experienced traders."}
                  {riskLevel === "aggressive" && "High risk. Only for experienced traders with a proven edge."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base">Risk Guidelines</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-emerald-500 font-bold shrink-0">1%</span>
                  <span>Professional standard. Protects against streaks of losses.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-500 font-bold shrink-0">2%</span>
                  <span>Maximum recommended. Use with strong setups only.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500 font-bold shrink-0">3%+</span>
                  <span>Dangerous. A 5-trade losing streak = 15%+ drawdown.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
