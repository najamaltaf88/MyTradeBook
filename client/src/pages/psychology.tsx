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

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-red-600";
    case "high":
      return "text-orange-600";
    case "medium":
      return "text-yellow-600";
    case "low":
      return "text-blue-600";
    default:
      return "text-muted-foreground";
  }
}

function getSeverityBadge(severity: string) {
  const colors = {
    critical: "bg-red-100 text-red-800 dark:bg-red-950/35 dark:text-red-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-950/35 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/35 dark:text-yellow-300",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-950/35 dark:text-blue-300",
  };
  return colors[severity as keyof typeof colors] || "bg-muted text-muted-foreground";
}

function MistakeCategory({ mistake }: { mistake: TraderMistake }) {
  if (mistake.count === 0) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-900/40">
        <div>
          <p className="font-medium text-green-900 dark:text-green-200">{mistake.label}</p>
          <p className="text-sm text-green-700 dark:text-green-300">No issues detected</p>
        </div>
        <div className="text-green-600">OK</div>
      </div>
    );
  }

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{mistake.label}</CardTitle>
          <Badge variant="outline" className="ml-2">
            {mistake.count} instance{mistake.count !== 1 ? "s" : ""}
          </Badge>
        </div>
        <CardDescription>
          Cost: <span className="font-semibold text-red-600">${mistake.cost.toFixed(2)}</span> ({mistake.percentage.toFixed(1)}% of trades)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mistake.instances.map((instance, idx) => (
          <div key={idx} className={`p-3 rounded-lg bg-muted/35 border ${getSeverityColor(instance.severity)} border-l-4`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Badge className={`${getSeverityBadge(instance.severity)} mb-2`}>{instance.severity.toUpperCase()}</Badge>
                <p className="text-sm font-medium text-foreground">{instance.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(instance.timestamp).toLocaleDateString()} {new Date(instance.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className="font-semibold text-red-600">${instance.cost.toFixed(2)}</p>
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
      <Card className={activeMistakes.length > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40" : "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900/40"}>
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
              <p className="text-2xl font-bold text-red-600">${report.totalMistakeCost.toFixed(2)}</p>
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
              <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                <p className="font-medium text-blue-900 dark:text-blue-200">Revenge Trading</p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                  After a loss &gt; $50, wait 1 hour before opening a new trade. Use a checklist to reset emotions.
                </p>
              </div>
            )}
            {report.mistakeCategories.lossChasing.count > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                <p className="font-medium text-blue-900 dark:text-blue-200">Loss Chasing</p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                  Set a daily loss limit. Once hit, stop trading for remainder of day. This breaks the chasing cycle.
                </p>
              </div>
            )}
            {report.mistakeCategories.panicClosing.count > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                <p className="font-medium text-blue-900 dark:text-blue-200">Panic Closing</p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                  Let 70% of winning trades reach TP before closing early. Use alerts instead of manual closes.
                </p>
              </div>
            )}
            {report.mistakeCategories.overtrading.count > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                <p className="font-medium text-blue-900 dark:text-blue-200">Overtrading</p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                  Limit to 5 trades/day maximum. Use a signal checklist - only trade when 3+ criteria aligned.
                </p>
              </div>
            )}
            {report.mistakeCategories.inconsistentRiskSizing.count > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg dark:bg-blue-950/20">
                <p className="font-medium text-blue-900 dark:text-blue-200">Inconsistent Risk Sizing</p>
                <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
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
