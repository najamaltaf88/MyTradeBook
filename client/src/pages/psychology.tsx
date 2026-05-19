import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@/hooks/use-account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Target } from "lucide-react";

interface TraderMistake {
  type: string;
  label: string;
  count: number;
  cost: number;
  instances: Array<{
    tradeIds: string[];
    severity: "critical" | "high" | "medium" | "low";
    description: string;
    cost: number;
    timestamp: string;
  }>;
  percentage: number;
}

interface PsychologyReport {
  totalTrades: number;
  closedTrades: number;
  mistakeCategories: {
    revengeTrading: TraderMistake;
    lossChasing: TraderMistake;
    panicClosing: TraderMistake;
    overtrading: TraderMistake;
    inconsistentRiskSizing: TraderMistake;
  };
  totalMistakeCost: number;
  mistakePercentage: number;
  summary: string;
}

function getSeverityBorder(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-l-loss";
    case "high":
      return "border-l-chart-5";
    case "medium":
      return "border-l-chart-4";
    case "low":
      return "border-l-primary";
    default:
      return "border-l-border";
  }
}

function getSeverityBadge(severity: string) {
  const colors = {
    critical: "border border-loss/30 bg-loss/12 text-loss",
    high: "border border-chart-5/30 bg-chart-5/12 text-chart-5",
    medium: "border border-chart-4/30 bg-chart-4/12 text-chart-4",
    low: "border border-primary/30 bg-primary/10 text-primary",
  };
  return colors[severity as keyof typeof colors] || "bg-muted text-muted-foreground";
}

function MistakeCategory({ mistake }: { mistake: TraderMistake }) {
  if (mistake.count === 0) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-profit/25 bg-profit/8 p-4">
        <div>
          <p className="font-medium text-foreground">{mistake.label}</p>
          <p className="text-sm text-muted-foreground">No issues detected</p>
        </div>
        <div className="text-profit">OK</div>
      </div>
    );
  }

  return (
    <Card className="border-l-4 border-l-chart-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{mistake.label}</CardTitle>
          <Badge variant="outline" className="ml-2">
            {mistake.count} instance{mistake.count !== 1 ? "s" : ""}
          </Badge>
        </div>
        <CardDescription>
          Cost: <span className="font-semibold text-loss">${mistake.cost.toFixed(2)}</span> ({mistake.percentage.toFixed(1)}% of trades)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mistake.instances.map((instance, idx) => (
          <div key={idx} className={`rounded-lg border border-border bg-muted/35 p-3 border-l-4 ${getSeverityBorder(instance.severity)}`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Badge className={`${getSeverityBadge(instance.severity)} mb-2`}>{instance.severity.toUpperCase()}</Badge>
                <p className="text-sm font-medium text-foreground">{instance.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(instance.timestamp).toLocaleDateString()} {new Date(instance.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="font-semibold text-loss">${instance.cost.toFixed(2)}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function PsychologyPage() {
  const { selectedAccount, accounts } = useAccount();
  const accountId = selectedAccount?.id;

  const { data: report, isLoading, error } = useQuery<PsychologyReport>({
    queryKey: ["psychology", accountId || "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      const url = params.size > 0 ? `/api/ai/psychology?${params.toString()}` : "/api/ai/psychology";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch psychology analysis");
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
        <AlertDescription>Add an account first to run psychology analysis.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center">
          <p className="text-muted-foreground">Analyzing trading psychology...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analysis Failed</AlertTitle>
        <AlertDescription>Unable to load psychology analysis. Try again later.</AlertDescription>
      </Alert>
    );
  }

  if (!report) return null;

  const mistakes = Object.values(report.mistakeCategories);
  const activeMistakes = mistakes.filter((m) => m.count > 0);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trading Psychology</h1>
        <p className="text-muted-foreground mt-2">Identify emotional trading patterns and psychological mistakes</p>
      </div>

      {/* Main Summary */}
      <Card className={activeMistakes.length > 0 ? "border-loss/25 bg-loss/8" : "border-profit/25 bg-profit/8"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Overall Psychology Score
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Trades Analyzed</p>
              <p className="text-2xl font-bold">{report.totalTrades}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Closed Trades</p>
              <p className="text-2xl font-bold">{report.closedTrades}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Psychological Cost</p>
              <p className="text-2xl font-bold text-loss">${report.totalMistakeCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cost as % of Profit</p>
              <p className="text-2xl font-bold">{report.mistakePercentage.toFixed(1)}%</p>
            </div>
          </div>
          <Alert>
            <AlertDescription className="font-medium">{report.summary}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Mistake Categories */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold mb-4">Mistake Categories</h2>
          <div className="space-y-4">
            <MistakeCategory mistake={report.mistakeCategories.revengeTrading} />
            <MistakeCategory mistake={report.mistakeCategories.lossChasing} />
            <MistakeCategory mistake={report.mistakeCategories.panicClosing} />
            <MistakeCategory mistake={report.mistakeCategories.overtrading} />
            <MistakeCategory mistake={report.mistakeCategories.inconsistentRiskSizing} />
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {activeMistakes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.mistakeCategories.revengeTrading.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Revenge Trading</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  After a loss &gt; $50, wait 1 hour before opening a new trade. Use a checklist to reset emotions.
                </p>
              </div>
            )}
            {report.mistakeCategories.lossChasing.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Loss Chasing</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set a daily loss limit. Once hit, stop trading for remainder of day. This breaks the chasing cycle.
                </p>
              </div>
            )}
            {report.mistakeCategories.panicClosing.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Panic Closing</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Let 70% of winning trades reach TP before closing early. Use alerts instead of manual closes.
                </p>
              </div>
            )}
            {report.mistakeCategories.overtrading.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Overtrading</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Limit to 5 trades/day maximum. Use a signal checklist - only trade when 3+ criteria aligned.
                </p>
              </div>
            )}
            {report.mistakeCategories.inconsistentRiskSizing.count > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="font-medium text-foreground">Inconsistent Risk Sizing</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Risk exactly 1% per trade, always. Pre-define SL before entry. Never adjust after market opens.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
