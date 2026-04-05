import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@/hooks/use-account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BarChart3 } from "lucide-react";

interface RiskProfile {
  totalTrades: number;
  closedTrades: number;
  totalProfit: number;
  avgTrade: number;
  winRate: number;
  profitFactor: number;

  sharpeRatio: number;
  kellyCriterion: number;
  riskOfRuin: number;

  maxDrawdown: number;
  maxDrawdownRecoveryDays: number;
  currentDrawdown: number;

  riskConsistency: number;
  profitConsistency: number;

  payoffRatio: number;
  expectancy: number;
  winLossRatio: number;

  recommendedRiskPercent: number;
  riskScore: "A+" | "A" | "B" | "C" | "D" | "F";
  summary: string;
}

function getRiskScoreColor(score: string): string {
  switch (score) {
    case "A+":
      return "bg-green-100 text-green-800 dark:bg-green-950/35 dark:text-green-300";
    case "A":
      return "bg-green-100 text-green-800 dark:bg-green-950/35 dark:text-green-300";
    case "B":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/35 dark:text-blue-300";
    case "C":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/35 dark:text-yellow-300";
    case "D":
      return "bg-orange-100 text-orange-800 dark:bg-orange-950/35 dark:text-orange-300";
    case "F":
      return "bg-red-100 text-red-800 dark:bg-red-950/35 dark:text-red-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return "INF";
  return value.toFixed(2);
}

function MetricCard({ label, value, unit = "", warning = false }: { label: string; value: number | string; unit?: string; warning?: boolean }) {
  return (
    <div className={`p-4 rounded-lg ${warning ? "bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/40" : "bg-muted/35"}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${warning ? "text-red-600" : "text-foreground"}`}>
        {typeof value === "number" ? value.toFixed(2) : value}
        {unit && <span className="text-sm ml-1">{unit}</span>}
      </p>
    </div>
  );
}

export default function RiskPage() {
  const { selectedAccount, accounts } = useAccount();
  const accountId = selectedAccount?.id;

  const { data: profile, isLoading, error } = useQuery<RiskProfile>({
    queryKey: ["risk", accountId || "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      const url = params.size > 0 ? `/api/ai/risk?${params.toString()}` : "/api/ai/risk";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch risk analysis");
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Unexpected response from server");
      }
      return response.json();
    },
    enabled: accounts.length > 0,
  });

  if (accounts.length === 0) {
    return (
      <Alert className="m-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Account Found</AlertTitle>
        <AlertDescription>Add an account first to run risk analysis.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Calculating risk metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analysis Failed</AlertTitle>
        <AlertDescription>Unable to load risk analysis. Try again later.</AlertDescription>
      </Alert>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Risk Analysis</h1>
        <p className="text-muted-foreground mt-2">Advanced risk metrics and portfolio optimization</p>
      </div>

      {/* Risk Score Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Risk Score
              </CardTitle>
              <CardDescription>Overall risk management quality</CardDescription>
            </div>
            <Badge className={`text-2xl p-3 h-auto ${getRiskScoreColor(profile.riskScore)}`}>{profile.riskScore}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription className="font-medium">{profile.summary}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Core Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Total Trades" value={profile.totalTrades} />
          <MetricCard label="Closed Trades" value={profile.closedTrades} />
          <MetricCard label="Win Rate" value={(profile.winRate * 100).toFixed(1)} unit="%" />
          <MetricCard label="Profit Factor" value={formatRatio(profile.profitFactor)} />
          <MetricCard label="Total Profit" value={`$${profile.totalProfit.toFixed(2)}`} />
          <MetricCard label="Avg Trade" value={`$${profile.avgTrade.toFixed(2)}`} />
          <MetricCard label="Expectancy" value={`$${profile.expectancy.toFixed(2)}`} />
          <MetricCard label="Payoff Ratio" value={formatRatio(profile.payoffRatio)} />
        </CardContent>
      </Card>

      {/* Risk Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
            <p className={`text-2xl font-bold ${profile.sharpeRatio > 1 ? "text-green-600" : "text-red-600"}`}>{profile.sharpeRatio.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Risk-adjusted returns (&gt;1 is good)</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Kelly Criterion</p>
            <p className="text-2xl font-bold text-blue-600">{(profile.kellyCriterion * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Theoretical max risk/trade</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Risk of Ruin</p>
            <p className={`text-2xl font-bold ${profile.riskOfRuin > 0.1 ? "text-red-600" : "text-green-600"}`}>{(profile.riskOfRuin * 100).toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Probability of account loss</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Max Drawdown</p>
            <p className="text-2xl font-bold text-orange-600">${profile.maxDrawdown.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{profile.maxDrawdownRecoveryDays} days to recover</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Current Drawdown</p>
            <p className={`text-2xl font-bold ${profile.currentDrawdown > 0 ? "text-red-600" : "text-green-600"}`}>${profile.currentDrawdown.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">From all-time peak</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Recommended Risk</p>
            <p className="text-2xl font-bold text-purple-600">{profile.recommendedRiskPercent.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">Per trade sizing</p>
          </div>
        </CardContent>
      </Card>

      {/* Consistency Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Consistency Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Profit Consistency</p>
              <p className="text-sm text-muted-foreground">${profile.profitConsistency.toFixed(2)}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${Math.min((100 - profile.profitConsistency / 50), 100)}%` }}></div>
            </div>
            <p className="text-xs text-muted-foreground">Lower = more consistent profits</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Risk Consistency</p>
              <p className="text-sm text-muted-foreground">{profile.riskConsistency.toFixed(0)}%</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className={`h-2 rounded-full ${profile.riskConsistency > 80 ? "bg-green-600" : profile.riskConsistency > 60 ? "bg-yellow-600" : "bg-red-600"}`} style={{ width: `${profile.riskConsistency}%` }}></div>
            </div>
            <p className="text-xs text-muted-foreground">Higher = more consistent risk sizing</p>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.kellyCriterion > 0.1 && (
            <Alert>
              <AlertDescription>
                <strong>Position Sizing:</strong> Risk {profile.recommendedRiskPercent.toFixed(1)}% per trade (from Kelly analysis)
              </AlertDescription>
            </Alert>
          )}

          {profile.sharpeRatio < 1 && (
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Returns Warning:</strong> Sharpe ratio {profile.sharpeRatio.toFixed(2)} indicates poor risk-adjusted returns. Review strategy edge.
              </AlertDescription>
            </Alert>
          )}

          {profile.riskOfRuin > 0.2 && (
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Ruin Risk:</strong> {(profile.riskOfRuin * 100).toFixed(1)}% chance of account loss. Reduce risk per trade immediately.
              </AlertDescription>
            </Alert>
          )}

          {profile.riskConsistency < 60 && (
            <Alert>
              <AlertDescription>
                <strong>Risk Sizing:</strong> Your position sizing varies by {((100 - profile.riskConsistency)).toFixed(0)}%. Use fixed 1% rule for consistency.
              </AlertDescription>
            </Alert>
          )}

          {profile.maxDrawdownRecoveryDays > 30 && (
            <Alert>
              <AlertDescription>
                <strong>Drawdown Recovery:</strong> Last major drawdown took {profile.maxDrawdownRecoveryDays} days to recover. Consider tighter stop losses.
              </AlertDescription>
            </Alert>
          )}

          {profile.profitFactor > 2 && (
            <Alert>
              <AlertDescription>
                <strong>Strong Edge:</strong> Profit factor {profile.profitFactor.toFixed(2)} shows genuine edge. Focus on consistency.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
