/**
 * PLAYBOOK COMPLIANCE PAGE
 * Quantifies how well traders follow their own rules
 * Drives accountability and shows correlation to profitability
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

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

export function CompliancePage() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");

  useEffect(() => {
    fetchCompliance();
  }, [period]);

  const fetchCompliance = async () => {
    try {
      const response = await fetch(`/api/compliance/score?period=${period}`);
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load compliance data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const scoreColors: Record<string, string> = {
    "A+": "text-green-600 bg-green-50",
    A: "text-green-600 bg-green-50",
    B: "text-blue-600 bg-blue-50",
    C: "text-yellow-600 bg-yellow-50",
    D: "text-orange-600 bg-orange-50",
    F: "text-red-600 bg-red-50",
  };

  if (!metrics)
    return (
      <div className="flex justify-center items-center h-96">
        <p className="text-gray-500">Loading compliance data...</p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Playbook Compliance</h1>
          <p className="text-gray-600">Track how well you follow your trading rules</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
              <p className="text-gray-600 mt-2">You're following rules {metrics.compliancePercentage}% of the time</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{metrics.followedRules}</div>
              <p className="text-sm text-gray-600">rules followed</p>
              <div className="text-xl font-bold text-red-600 mt-2">{metrics.violatedRules}</div>
              <p className="text-sm text-gray-600">rules broken</p>
            </div>
          </div>

          <Progress value={metrics.compliancePercentage} className="h-3" />

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <p className="text-xs font-semibold text-gray-600">Best Rule</p>
              <p className="text-sm font-medium">{metrics.insights.bestFollowedRule}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600">Worst Rule</p>
              <p className="text-sm font-medium">{metrics.insights.worstFollowedRule}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600">Most Profitable</p>
              <p className="text-sm font-medium">{metrics.insights.mostCorrelatedToProfits}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Insight */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="flex-row justify-between items-start pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <TrendingUp size={20} /> Key Insight
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-blue-900">{metrics.insights.impactStatement}</p>
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
                    <p className="text-sm text-gray-600">{rule.category}</p>
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

                <div className="flex justify-between text-sm text-gray-600">
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
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="font-semibold text-red-900">Priority 1: Fix "{metrics.insights.worstFollowedRule}"</p>
            <p className="text-sm text-red-800 mt-1">You break this rule frequently. Identify barriers and focus here.</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded p-3">
            <p className="font-semibold text-green-900">Strength: Master "{metrics.insights.bestFollowedRule}"</p>
            <p className="text-sm text-green-800 mt-1">You follow this rule consistently. Keep it up!</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="font-semibold text-blue-900">Opportunity: Leverage "{metrics.insights.mostCorrelatedToProfits}"</p>
            <p className="text-sm text-blue-800 mt-1">Following this rule correlates with profits. Make it a focus.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CompliancePage;
