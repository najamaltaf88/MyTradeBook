/**
 * PLAYBOOK COMPLIANCE PAGE
 * Quantifies how well traders follow their own rules
 * Drives accountability and shows correlation to profitability
 */

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, AlertCircle } from "lucide-react";

interface RuleMetrics {
  ruleId: string;
  ruleName: string;
  category: string;
  followedCount: number;
  violatedCount: number;
  compliancePercentage: number;
  profitCorrelation: number;
}

interface ComplianceMetrics {
  totalRules: number;
  followedRules: number;
  violatedRules: number;
  compliancePercentage: number;
  perRule: RuleMetrics[];
  insights: {
    bestFollowedRule: string;
    worstFollowedRule: string;
    mostCorrelatedToProfits: string;
    impactStatement: string;
  };
  complianceScore: "A+" | "A" | "B" | "C" | "D" | "F";
}

type Period = "daily" | "weekly" | "monthly";

export function CompliancePage() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");

  useEffect(() => {
    void fetchCompliance();
  }, [period]);

  const fetchCompliance = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/compliance/score?period=${period}`);
      if (!response.ok) {
        throw new Error("Failed to load compliance data");
      }
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load compliance data");
      toast({ title: "Error", description: "Failed to load compliance data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (value: string) => {
    if (value === "daily" || value === "weekly" || value === "monthly") {
      setPeriod(value);
    }
  };

  const scoreColors: Record<string, string> = {
    "A+": "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    A: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    B: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    C: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    D: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    F: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  };

  if (loading && !metrics)
    return (
      <div className="flex justify-center items-center h-96">
        <p className="text-muted-foreground">Loading compliance data...</p>
      </div>
    );

  if (!metrics) {
    return (
      <div className="flex justify-center items-center h-96">
        <p className="text-muted-foreground">{error || "Compliance data is unavailable right now."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Playbook Compliance</h1>
          <p className="text-muted-foreground">Track how well you follow your trading rules</p>
        </div>
        <Tabs value={period} onValueChange={handlePeriodChange}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <Card className="border-amber-500/20 bg-amber-500/10">
          <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-100">
            Latest compliance snapshot dikh raha hai, lekin refresh ke waqt issue aya tha: {error}
          </CardContent>
        </Card>
      ) : null}

      {/* Compliance Score Card */}
      <Card className={`border-2 ${scoreColors[metrics.complianceScore]}`}>
        <CardHeader className="pb-2">
          <CardTitle>Overall Compliance Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-5xl font-bold ${scoreColors[metrics.complianceScore]}`}>
                {metrics.complianceScore}
              </div>
              <p className="text-muted-foreground mt-2">You're following rules {metrics.compliancePercentage}% of the time</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{metrics.followedRules}</div>
              <p className="text-sm text-muted-foreground">rules followed</p>
              <div className="text-xl font-bold text-loss mt-2">{metrics.violatedRules}</div>
              <p className="text-sm text-muted-foreground">rules broken</p>
            </div>
          </div>

          <Progress value={metrics.compliancePercentage} className="h-3" />

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Best Rule</p>
              <p className="text-sm font-medium">{metrics.insights.bestFollowedRule}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Worst Rule</p>
              <p className="text-sm font-medium">{metrics.insights.worstFollowedRule}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Most Profitable</p>
              <p className="text-sm font-medium">{metrics.insights.mostCorrelatedToProfits}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Insight */}
      <Card className="border-primary/20 bg-primary/10">
        <CardHeader className="flex-row justify-between items-start pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <TrendingUp size={20} className="text-primary" /> Key Insight
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-foreground">{metrics.insights.impactStatement}</p>
        </CardContent>
      </Card>

      {/* Rule-by-Rule Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Rule-by-Rule Compliance</CardTitle>
          <CardDescription>How consistently you follow each rule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {metrics.perRule.map((rule) => {
            const isGood = rule.compliancePercentage >= 80;
            const isProfitable = rule.profitCorrelation >= 60;

            return (
              <div key={rule.ruleId} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{rule.ruleName}</h4>
                    <p className="text-sm text-muted-foreground">{rule.category}</p>
                  </div>
                  <div className="flex gap-2">
                    {isGood && <Badge variant="default">Good</Badge>}
                    {!isGood && <Badge variant="destructive">Needs Work</Badge>}
                    {isProfitable && (
                      <Badge variant="secondary">Profit Match: {rule.profitCorrelation}%</Badge>
                    )}
                  </div>
                </div>

                <Progress value={rule.compliancePercentage} className="h-2" />

                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{rule.compliancePercentage}% compliance</span>
                  <span>
                    {rule.followedCount} followed / {rule.violatedCount} broken
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle size={20} /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded p-3 border border-red-500/20 bg-red-500/10">
            <p className="font-semibold text-red-700 dark:text-red-300">Priority 1: Fix "{metrics.insights.worstFollowedRule}"</p>
            <p className="text-sm text-red-700/90 dark:text-red-300 mt-1">You break this rule frequently. Identify barriers and focus here.</p>
          </div>

          <div className="rounded p-3 border border-emerald-500/20 bg-emerald-500/10">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">Strength: Master "{metrics.insights.bestFollowedRule}"</p>
            <p className="text-sm text-emerald-700/90 dark:text-emerald-300 mt-1">You follow this rule consistently. Keep it up!</p>
          </div>

          <div className="rounded p-3 border border-blue-500/20 bg-blue-500/10">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Opportunity: Leverage "{metrics.insights.mostCorrelatedToProfits}"</p>
            <p className="text-sm text-blue-700/90 dark:text-blue-300 mt-1">Following this rule correlates with profits. Make it a focus.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CompliancePage;
