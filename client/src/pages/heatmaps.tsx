/**
 * PERFORMANCE HEATMAPS PAGE
 * Visual analysis of performance by Symbol x Session, Symbol x DayOfWeek
 * Helps traders focus on high-probability setups
 */

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface HeatmapData {
  key: string;
  trades: number;
  profit: number;
  winRate: number;
  color: string;
  intensity: number;
}

interface HeatmapMetrics {
  type: "symbol_session" | "symbol_dayofweek" | "session_dayofweek" | "hourly";
  period: string;
  data: Record<string, HeatmapData>;
  metadata: {
    totalTrades: number;
    totalProfit: number;
    positiveSetups: number;
    negativeSetups: number;
    bestSetup: { key: string; winRate: number };
    worstSetup: { key: string; winRate: number };
  };
}

function defaultHeatmapMetrics(type: HeatmapMetrics["type"]): HeatmapMetrics {
  return {
    type,
    period: "all",
    data: {},
    metadata: {
      totalTrades: 0,
      totalProfit: 0,
      positiveSetups: 0,
      negativeSetups: 0,
      bestSetup: { key: "-", winRate: 0 },
      worstSetup: { key: "-", winRate: 0 },
    },
  };
}

function normalizeHeatmapPayload(payload: unknown, type: HeatmapMetrics["type"]): HeatmapMetrics {
  const fallback = defaultHeatmapMetrics(type);
  if (!payload || typeof payload !== "object") return fallback;

  const incoming = payload as Partial<HeatmapMetrics>;
  return {
    ...fallback,
    ...incoming,
    type,
    data: incoming.data && typeof incoming.data === "object" ? incoming.data : {},
    metadata: {
      ...fallback.metadata,
      ...(incoming.metadata || {}),
      bestSetup: {
        ...fallback.metadata.bestSetup,
        ...(incoming.metadata?.bestSetup || {}),
      },
      worstSetup: {
        ...fallback.metadata.worstSetup,
        ...(incoming.metadata?.worstSetup || {}),
      },
    },
  };
}

export function HeatmapsPage() {
  const { toast } = useToast();
  const [heatmaps, setHeatmaps] = useState<Record<string, HeatmapMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<string[]>([]);

  useEffect(() => {
    fetchHeatmaps();
  }, []);

  const fetchHeatmaps = async () => {
    try {
      const types = ["symbol_session", "symbol_dayofweek", "hourly"];
      const data: Record<string, HeatmapMetrics> = {};

      for (const type of types) {
        const response = await fetch(`/api/heatmaps/${type}`);
        const heatmapData = (await response.json()) as unknown;
        data[type] = normalizeHeatmapPayload(heatmapData, type as HeatmapMetrics["type"]);
      }

      setHeatmaps(data);

      // Fetch insights
      const insightsResponse = await fetch("/api/heatmaps/insights");
      const insightsData = await insightsResponse.json();
      setInsights(insightsData.insights || []);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load heatmaps", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const HeatmapTable = ({ heatmap }: { heatmap: HeatmapMetrics }) => {
    const entries = Object.entries(heatmap.data || {})
      .map(([mapName, value]) => ({ mapName, ...value }))
      .sort((a, b) => b.profit - a.profit);

    return (
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold">{heatmap.metadata.totalTrades}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Profit</p>
              <p className={`text-2xl font-bold ${heatmap.metadata.totalProfit >= 0 ? "text-profit" : "text-loss"}`}>
                ${heatmap.metadata.totalProfit.toFixed(0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Positive Setups</p>
              <p className="text-2xl font-bold text-profit">{heatmap.metadata.positiveSetups}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Negative Setups</p>
              <p className="text-2xl font-bold text-loss">{heatmap.metadata.negativeSetups}</p>
            </CardContent>
          </Card>
        </div>

        {/* Heatmap Table */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 max-h-96 overflow-y-auto">
              {entries.map((entry) => (
                <div
                  key={entry.key}
                  className="flex items-center gap-4 p-3 rounded border"
                  style={{ background: `${entry.color}20` }}
                >
                  <div className="min-w-32">
                    <p className="font-semibold">{entry.key}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{entry.winRate.toFixed(1)}%</span>
                      <div className="flex-1 bg-muted rounded h-2">
                        <div
                          className="bg-green-500 h-2 rounded"
                          style={{ width: `${entry.winRate * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-right min-w-24">
                    <p className="font-semibold text-sm">{entry.trades} trades</p>
                    <p className={`text-sm font-bold ${entry.profit >= 0 ? "text-profit" : "text-loss"}`}>
                      ${entry.profit.toFixed(0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Best/Worst */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-emerald-500/20 bg-emerald-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp size={18} className="text-profit" /> Best Setup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{heatmap.metadata.bestSetup.key}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(heatmap.metadata.bestSetup.winRate * 100).toFixed(1)}% win rate - Focus here!
              </p>
            </CardContent>
          </Card>

          <Card className="border-red-500/20 bg-red-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown size={18} className="text-loss" /> Worst Setup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{heatmap.metadata.worstSetup.key}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(heatmap.metadata.worstSetup.winRate * 100).toFixed(1)}% win rate - Avoid this
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-96">
        <p className="text-muted-foreground">Loading heatmaps...</p>
      </div>
    );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Performance Heatmaps</h1>
        <p className="text-muted-foreground">Visual analysis of trading patterns to focus on best setups</p>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <Card className="border-primary/20 bg-primary/10">
          <CardHeader className="flex-row justify-between items-start pb-2">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="text-primary" /> Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.map((insight, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span>-</span> {insight}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Heatmaps */}
      <Tabs defaultValue="symbol_session">
        <TabsList>
          <TabsTrigger value="symbol_session">Symbol x Session</TabsTrigger>
          <TabsTrigger value="symbol_dayofweek">Symbol x Day</TabsTrigger>
          <TabsTrigger value="hourly">Hourly Win Rate</TabsTrigger>
        </TabsList>

        <TabsContent value="symbol_session" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Symbol and Trading Session</CardTitle>
              <CardDescription>Which pairs work best in which market</CardDescription>
            </CardHeader>
            <CardContent>
              {heatmaps.symbol_session && <HeatmapTable heatmap={heatmaps.symbol_session} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="symbol_dayofweek" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance by Symbol and Day of Week</CardTitle>
              <CardDescription>Monday effect? Weekend trends?</CardDescription>
            </CardHeader>
            <CardContent>
              {heatmaps.symbol_dayofweek && <HeatmapTable heatmap={heatmaps.symbol_dayofweek} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hourly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Win Rate Heatmap</CardTitle>
              <CardDescription>Best time of day to trade</CardDescription>
            </CardHeader>
            <CardContent>
              {heatmaps.hourly && <HeatmapTable heatmap={heatmaps.hourly} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HeatmapsPage;
