/**
 * PDF EXPORT PAGE
 * Generate professional multi-page reports with customization
 * Templates: standard, professional, detailed, coach
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { buildAuthHeaders } from "@/lib/queryClient";
import { FileText, Download } from "lucide-react";

interface ReportTemplate {
  name: string;
  description: string;
  sections: string[];
}

const reportTemplates: ReportTemplate[] = [
  {
    name: "standard",
    description: "Basic report with key metrics",
    sections: ["summary", "analytics"],
  },
  {
    name: "professional",
    description: "Comprehensive report for clients/coaches",
    sections: ["summary", "analytics", "psychology", "risk", "recommendations"],
  },
  {
    name: "detailed",
    description: "Complete analysis with all trades listed",
    sections: ["summary", "trades", "analytics", "psychology", "risk", "goals", "recommendations"],
  },
  {
    name: "coach",
    description: "Focused on improvement areas and recommendations",
    sections: ["summary", "psychology", "risk", "goals", "recommendations"],
  },
];

export function PDFExportPage() {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState("professional");
  const [colorScheme, setColorScheme] = useState("professional");
  const [customSections, setCustomSections] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const currentTemplate = reportTemplates.find((t) => t.name === selectedTemplate);

  const toggleSection = (section: string) => {
    setCustomSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const generateReport = async () => {
    try {
      setGenerating(true);

      const sections = customSections.length > 0 ? customSections : currentTemplate?.sections || [];

      const authHeaders = await buildAuthHeaders();
      const response = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: {
          ...authHeaders,
          "X-Mytradebook-Request": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template: selectedTemplate,
          sections,
          colorScheme,
          companyName: companyName || undefined,
        }),
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to generate PDF");

      const html = await response.text();

      // Open in new window or trigger download
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trading-report-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();

      toast({ title: "Success", description: "Report generated" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate report", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const allSections = [
    { id: "summary", label: "Executive Summary" },
    { id: "trades", label: "Recent Trades Table" },
    { id: "analytics", label: "Performance Analytics" },
    { id: "psychology", label: "Psychology Analysis" },
    { id: "risk", label: "Risk Assessment" },
    { id: "goals", label: "Monthly Goals" },
    { id: "recommendations", label: "Improvement Recommendations" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Generate PDF Report</h1>
        <p className="text-gray-600">Create professional trading reports for clients, coaches, or personal use</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Template Selection */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Choose Template</CardTitle>
            <CardDescription>Select a pre-built template or customize</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {reportTemplates.map((template) => (
                <div
                  key={template.name}
                  className={`border rounded-lg p-4 cursor-pointer transition ${
                    selectedTemplate === template.name
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => {
                    setSelectedTemplate(template.name);
                    setCustomSections([]); // Reset custom sections
                  }}
                >
                  <h4 className="font-semibold capitalize">{template.name}</h4>
                  <p className="text-sm text-gray-600">{template.description}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Sections: {template.sections.join(", ")}
                  </p>
                </div>
              ))}
            </div>

            {/* Customization */}
            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-3">Customize Sections</h4>
              <div className="space-y-2">
                {allSections.map((section) => (
                  <div key={section.id} className="flex items-center gap-2">
                    <Checkbox
                      id={section.id}
                      checked={
                        customSections.length === 0
                          ? currentTemplate?.sections.includes(section.id) ?? false
                          : customSections.includes(section.id)
                      }
                      onCheckedChange={() => toggleSection(section.id)}
                    />
                    <Label htmlFor={section.id} className="cursor-pointer">
                      {section.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        <div className="space-y-4">
          {/* Color Scheme */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Color Scheme</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={colorScheme} onValueChange={setColorScheme}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional (Blue)</SelectItem>
                  <SelectItem value="colorful">Colorful</SelectItem>
                  <SelectItem value="minimal">Minimal (B&W)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Company Name */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Company/Name (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                placeholder="Your trading name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="bg-gray-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-600" />
                <span>Trading Journal Report</span>
              </div>
              <p className="text-xs text-gray-600">
                {customSections.length > 0 ? customSections.length : currentTemplate?.sections.length} sections
              </p>
              <p className="text-xs text-gray-600 capitalize">{colorScheme} style</p>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <Button
            size="lg"
            className="w-full gap-2"
            onClick={generateReport}
            disabled={generating}
          >
            <Download size={18} />
            {generating ? "Generating..." : "Generate PDF"}
          </Button>
        </div>
      </div>

      {/* Info */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <p className="text-sm text-blue-900">
            💡 <strong>Tips:</strong> Professional reports are great for sending to coaches or accountability partners.
            Detailed reports include all recent trades. The Coach template focuses on improvement areas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default PDFExportPage;
