/**
 * TRADE TEMPLATES PAGE
 * Manage and use pre-built trade logging templates
 * Reduces friction, increases journaling consistency
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { buildAuthHeaders } from "@/lib/queryClient";
import { Plus, Copy, Download, Share2, TrendingUp } from "lucide-react";

interface Template {
  id: string;
  name: string;
  category: "scalp" | "intraday" | "swing" | "custom";
  reason?: string;
  logic?: string;
  emotion?: string;
  typicalRiskPips?: number;
  typicalRewardPips?: number;
  usageCount: number;
  isPublic?: boolean;
  lastUsed?: Date;
}

interface PublicTemplate extends Template {
  creatorName: string;
  averageWinRate: number;
  sharesCount: number;
}

export function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [publicTemplates, setPublicTemplates] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
    fetchPublicTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/templates");
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchPublicTemplates = async () => {
    try {
      const response = await fetch("/api/templates/public");
      const data = await response.json();
      setPublicTemplates(data);
    } catch (error) {
      console.error("Failed to load public templates");
    }
  };

  const useTemplate = async (templateId: string) => {
    toast({ title: "Loading template...", description: "Opening trade entry form" });
    // Would navigate to trade entry page with template pre-filled
    window.location.href = `/trades?template=${templateId}`;
  };

  const duplicateTemplate = async (templateId: string) => {
    try {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;

      // Create new copy
      const authHeaders = await buildAuthHeaders();
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-Mytradebook-Request": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...template,
          name: `${template.name} (Copy)`,
          id: undefined,
        }),
        credentials: "include",
      });

      const newTemplate = await response.json();
      setTemplates([...templates, newTemplate]);
      toast({ title: "Success", description: "Template duplicated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to duplicate template", variant: "destructive" });
    }
  };

  const categoryColors: Record<string, string> = {
    scalp: "bg-red-100 text-red-800",
    intraday: "bg-blue-100 text-blue-800",
    swing: "bg-green-100 text-green-800",
    custom: "bg-gray-100 text-gray-800",
  };

  const TemplateCard = ({ template, isPublic = false }: { template: Template | PublicTemplate; isPublic?: boolean }) => {
    const riskReward =
      template.typicalRiskPips && template.typicalRewardPips
        ? `1:${(template.typicalRewardPips / template.typicalRiskPips).toFixed(2)}`
        : null;

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>
                <Badge className={`${categoryColors[template.category]} mt-2`}>
                  {template.category}
                </Badge>
              </CardDescription>
            </div>
            {isPublic && "averageWinRate" in template && (
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  {(template.averageWinRate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-600">win rate</div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {template.reason && (
            <div>
              <label className="text-xs font-semibold text-gray-600">Entry Reason</label>
              <p className="text-sm">{template.reason}</p>
            </div>
          )}

          {template.logic && (
            <div>
              <label className="text-xs font-semibold text-gray-600">Trade Logic</label>
              <p className="text-sm">{template.logic}</p>
            </div>
          )}

          {riskReward && (
            <div className="flex gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">Risk</label>
                <p className="text-sm font-mono">{template.typicalRiskPips} pips</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Reward</label>
                <p className="text-sm font-mono">{template.typicalRewardPips} pips</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Ratio</label>
                <p className="text-sm font-mono">{riskReward}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <TrendingUp size={14} />
              {template.usageCount} uses
            </span>
            <div className="flex gap-2">
              {!isPublic && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => duplicateTemplate(template.id)}
                  >
                    <Copy size={16} /> Copy
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Share2 size={16} /> Share
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => useTemplate(template.id)}>
                Use Template
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Trade Templates</h1>
          <p className="text-gray-600">Speed up logging, improve consistency</p>
        </div>
        <Button size="lg" className="gap-2">
          <Plus size={18} /> New Template
        </Button>
      </div>

      <Tabs defaultValue="my-templates">
        <TabsList>
          <TabsTrigger value="my-templates">My Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="community">Community Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="my-templates" className="space-y-4">
          {templates.length === 0 && !loading ? (
            <Card className="text-center py-12">
              <Plus size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold">No Templates Yet</h3>
              <p className="text-gray-600 mb-4">
                Create templates for your common setups to speed up trade logging
              </p>
              <Button className="gap-2">
                <Plus size={18} /> Create First Template
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="community" className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-900">
              Discover proven templates shared by professional traders in the community
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {publicTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} isPublic={true} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TemplatesPage;
