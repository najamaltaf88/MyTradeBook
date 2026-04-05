/**
 * ADVANCED PDF EXPORT ENGINE
 * Generates professional trading reports with multiple templates
 * Supports: standard, professional, detailed, coach templates
 * Includes: charts, tables, metrics, recommendations, branding
 */

export interface ReportSection {
  title: string;
  data: any;
  includeChart?: boolean;
  chartType?: "bar" | "line" | "pie";
}

export interface PDFConfig {
  templateName: "standard" | "professional" | "detailed" | "coach";
  companyName?: string;
  companyLogo?: string;
  reportTitle: string;
  sections: string[]; // 'summary', 'trades', 'analytics', 'psychology', 'risk', 'goals', 'recommendations'
  includeCharts: boolean;
  colorScheme: "professional" | "colorful" | "minimal";
  pageOrientation: "portrait" | "landscape";
}

export interface TradeData {
  symbol: string;
  type: "BUY" | "SELL";
  openTime: Date;
  closeTime?: Date;
  openPrice: number;
  closePrice?: number;
  profit: number;
  commission?: number;
  swap?: number;
  profitPercentage?: number;
  aiGrade?: string;
}

export interface AnalyticsData {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  expectancy: number;
  monthlyProfit: Record<string, number>;
  sessionStats: Record<string, { trades: number; profit: number; winRate: number }>;
  symbolStats: Record<string, { trades: number; profit: number; winRate: number }>;
}

export class PDFExportEngine {
  private config: PDFConfig;
  private styleMap: Record<string, Record<string, string>>;

  constructor(config: PDFConfig) {
    this.config = config;
    this.styleMap = this.generateStyles();
  }

  /**
   * Generate complete PDF report
   */
  generateReport(
    trades: TradeData[],
    analytics: AnalyticsData,
    psychology?: any,
    risk?: any,
    goals?: any,
    recommendations?: string[]
  ): string {
    let html = this.generateHTMLHeader();

    if (this.config.sections.includes("summary")) {
      html += this.generateSummarySection(trades, analytics);
    }

    if (this.config.sections.includes("trades") && this.config.templateName === "detailed") {
      html += this.generateTradesTable(trades);
    }

    if (this.config.sections.includes("analytics")) {
      html += this.generateAnalyticsSection(analytics);
    }

    if (this.config.sections.includes("psychology") && psychology) {
      html += this.generatePsychologySection(psychology);
    }

    if (this.config.sections.includes("risk") && risk) {
      html += this.generateRiskSection(risk);
    }

    if (this.config.sections.includes("goals") && goals) {
      html += this.generateGoalsSection(goals);
    }

    if (this.config.sections.includes("recommendations") && recommendations) {
      html += this.generateRecommendationsSection(recommendations);
    }

    html += this.generateHTMLFooter();

    return html;
  }

  private tradeNetPnl(trade: TradeData): number {
    return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
  }

  /**
   * Generate HTML header with styling
   */
  private generateHTMLHeader(): string {
    const colorScheme = this.getColorScheme();
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.config.reportTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: ${colorScheme.text};
      line-height: 1.6;
      background: ${colorScheme.background};
    }
    .page { 
      page-break-after: always;
      padding: 40px;
      page: ${this.config.pageOrientation};
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid ${colorScheme.primary};
      padding-bottom: 20px;
    }
    .logo { max-width: 150px; margin-bottom: 10px; }
    .title { font-size: 32px; font-weight: bold; color: ${colorScheme.primary}; margin: 20px 0; }
    .subtitle { font-size: 14px; color: ${colorScheme.secondary}; }
    .section { 
      margin: 30px 0;
      page-break-inside: avoid;
    }
    .section-title { 
      font-size: 20px;
      font-weight: bold;
      color: ${colorScheme.primary};
      border-left: 4px solid ${colorScheme.primary};
      padding-left: 15px;
      margin-bottom: 15px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin: 15px 0;
    }
    .metric-box {
      background: ${colorScheme.cardBg};
      border: 1px solid ${colorScheme.border};
      padding: 15px;
      border-radius: 5px;
      text-align: center;
    }
    .metric-value { font-size: 24px; font-weight: bold; color: ${colorScheme.primary}; }
    .metric-label { font-size: 12px; color: ${colorScheme.secondary}; text-transform: uppercase; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      background: ${colorScheme.cardBg};
    }
    th {
      background: ${colorScheme.primary};
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid ${colorScheme.border};
    }
    tr:nth-child(even) { background: ${colorScheme.altBg}; }
    .positive { color: #27ae60; font-weight: bold; }
    .negative { color: #c0392b; font-weight: bold; }
    .recommendation-box {
      background: ${colorScheme.infoBox};
      border-left: 4px solid ${colorScheme.primary};
      padding: 15px;
      margin: 10px 0;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: ${colorScheme.secondary};
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid ${colorScheme.border};
    }
  </style>
</head>
<body>
`;
  }

  /**
   * Generate summary section
   */
  private generateSummarySection(trades: TradeData[], analytics: AnalyticsData): string {
    const totalProfit = trades.reduce((sum, t) => sum + this.tradeNetPnl(t), 0);
    const colorScheme = this.getColorScheme();

    return `
<div class="page">
  <div class="header">
    ${this.config.companyLogo ? `<img src="${this.config.companyLogo}" class="logo">` : ""}
    <div class="title">${this.config.reportTitle}</div>
    <div class="subtitle">Trading Performance Report</div>
    <div class="subtitle">${new Date().toLocaleDateString()}</div>
  </div>

  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="metric-grid">
      <div class="metric-box">
        <div class="metric-label">Total Profit</div>
        <div class="metric-value ${totalProfit >= 0 ? "positive" : "negative"}">
          $${totalProfit.toFixed(2)}
        </div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Total Trades</div>
        <div class="metric-value">${trades.length}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Win Rate</div>
        <div class="metric-value">${(analytics.winRate * 100).toFixed(1)}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Profit Factor</div>
        <div class="metric-value">${analytics.profitFactor.toFixed(2)}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Key Metrics</div>
    <table>
      <tr>
        <th>Metric</th>
        <th>Value</th>
        <th>Assessment</th>
      </tr>
      <tr>
        <td>Max Drawdown</td>
        <td>${(Math.abs(analytics.maxDrawdown) * 100).toFixed(2)}%</td>
        <td>${this.assessMetric("drawdown", analytics.maxDrawdown)}</td>
      </tr>
      <tr>
        <td>Sharpe Ratio</td>
        <td>${analytics.sharpeRatio.toFixed(2)}</td>
        <td>${this.assessMetric("sharpe", analytics.sharpeRatio)}</td>
      </tr>
      <tr>
        <td>Expectancy</td>
        <td>$${analytics.expectancy.toFixed(2)}</td>
        <td>${this.assessMetric("expectancy", analytics.expectancy)}</td>
      </tr>
    </table>
  </div>
</div>
`;
  }

  /**
   * Generate trades table (detailed view)
   */
  private generateTradesTable(trades: TradeData[]): string {
    const trades_html = trades.slice(0, 20).map((trade) => {
      const tradeNet = this.tradeNetPnl(trade);
      return `
<tr>
  <td>${trade.symbol}</td>
  <td>${trade.type}</td>
  <td>${new Date(trade.openTime).toLocaleDateString()}</td>
  <td>${trade.openPrice.toFixed(4)}</td>
  <td>${trade.closePrice ? trade.closePrice.toFixed(4) : "-"}</td>
  <td class="${tradeNet >= 0 ? "positive" : "negative"}">$${tradeNet.toFixed(2)}</td>
  <td>${trade.aiGrade || "N/A"}</td>
</tr>
`;
    }).join("");

    return `
<div class="page">
  <div class="section">
    <div class="section-title">Recent Trades (Last 20)</div>
    <table>
      <tr>
        <th>Symbol</th>
        <th>Type</th>
        <th>Date</th>
        <th>Entry</th>
        <th>Exit</th>
        <th>Profit</th>
        <th>Grade</th>
      </tr>
      ${trades_html}
    </table>
  </div>
</div>
`;
  }

  /**
   * Generate analytics section
   */
  private generateAnalyticsSection(analytics: AnalyticsData): string {
    const sessionHtml = Object.entries(analytics.sessionStats)
      .map(([session, stats]) => `
<tr>
  <td>${session}</td>
  <td>${stats.trades}</td>
  <td class="${stats.profit >= 0 ? "positive" : "negative"}">$${stats.profit.toFixed(2)}</td>
  <td>${(stats.winRate * 100).toFixed(1)}%</td>
</tr>
`).join("");

    const symbolHtml = Object.entries(analytics.symbolStats)
      .slice(0, 10)
      .map(([symbol, stats]) => `
<tr>
  <td>${symbol}</td>
  <td>${stats.trades}</td>
  <td class="${stats.profit >= 0 ? "positive" : "negative"}">$${stats.profit.toFixed(2)}</td>
  <td>${(stats.winRate * 100).toFixed(1)}%</td>
</tr>
`).join("");

    return `
<div class="page">
  <div class="section">
    <div class="section-title">Performance by Session</div>
    <table>
      <tr>
        <th>Session</th>
        <th>Trades</th>
        <th>Profit</th>
        <th>Win Rate</th>
      </tr>
      ${sessionHtml}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Top Symbols</div>
    <table>
      <tr>
        <th>Symbol</th>
        <th>Trades</th>
        <th>Profit</th>
        <th>Win Rate</th>
      </tr>
      ${symbolHtml}
    </table>
  </div>
</div>
`;
  }

  /**
   * Generate psychology section
   */
  private generatePsychologySection(psychology: any): string {
    const issues = psychology.mistakes || [];
    const issuesHtml = issues.map((issue: any) => `
<div class="recommendation-box">
  <strong>${issue.type}</strong> - Cost: $${issue.cost.toFixed(2)}
  <br><small>${issue.description}</small>
</div>
`).join("");

    return `
<div class="page">
  <div class="section">
    <div class="section-title">Psychology Analysis</div>
    <p>Overall Psychological Score: <strong>${psychology.score || "N/A"}</strong></p>
    <div style="margin-top: 15px;">
      ${issuesHtml || "<p>No major psychological issues detected.</p>"}
    </div>
  </div>
</div>
`;
  }

  /**
   * Generate risk section
   */
  private generateRiskSection(risk: any): string {
    return `
<div class="page">
  <div class="section">
    <div class="section-title">Risk Assessment</div>
    <div class="metric-grid">
      <div class="metric-box">
        <div class="metric-label">Sharpe Ratio</div>
        <div class="metric-value">${(risk.sharpeRatio || 0).toFixed(2)}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Kelly Criterion</div>
        <div class="metric-value">${((risk.kellyCriterion || 0) * 100).toFixed(1)}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Risk of Ruin</div>
        <div class="metric-value">${((risk.riskOfRuin || 0) * 100).toFixed(1)}%</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Risk Score</div>
        <div class="metric-value">${risk.riskScore || "N/A"}</div>
      </div>
    </div>
  </div>
</div>
`;
  }

  /**
   * Generate goals section
   */
  private generateGoalsSection(goals: any): string {
    const goalsHtml = (goals.goals || []).map((goal: any) => {
      const progress = goal.progress || 0;
      const status = progress >= 100 ? "✓ ACHIEVED" : "IN PROGRESS";
      return `
<tr>
  <td>${goal.name}</td>
  <td>${goal.target}</td>
  <td>${goal.current || 0}</td>
  <td>${progress.toFixed(0)}%</td>
  <td>${status}</td>
</tr>
`;
    }).join("");

    return `
<div class="page">
  <div class="section">
    <div class="section-title">Monthly Goals Progress</div>
    <table>
      <tr>
        <th>Goal</th>
        <th>Target</th>
        <th>Current</th>
        <th>Progress</th>
        <th>Status</th>
      </tr>
      ${goalsHtml}
    </table>
  </div>
</div>
`;
  }

  /**
   * Generate recommendations section
   */
  private generateRecommendationsSection(recommendations: string[]): string {
    const recHtml = recommendations.map((rec) => `
<div class="recommendation-box">
  ${rec}
</div>
`).join("");

    return `
<div class="page">
  <div class="section">
    <div class="section-title">Recommendations for Improvement</div>
    <div style="margin-top: 15px;">
      ${recHtml}
    </div>
  </div>
</div>
`;
  }

  /**
   * Generate HTML footer
   */
  private generateHTMLFooter(): string {
    return `
  <div class="footer">
    <p>Generated by MyTradebook Trading Journal</p>
    <p>${new Date().toLocaleString()}</p>
    ${this.config.companyName ? `<p>${this.config.companyName}</p>` : ""}
  </div>
</body>
</html>
`;
  }

  /**
   * Get color scheme based on configuration
   */
  private getColorScheme(): Record<string, string> {
    const schemes: { [K in PDFConfig["colorScheme"]]: Record<string, string> } = {
      professional: {
        primary: "#1e3a8a",
        secondary: "#64748b",
        text: "#0f172a",
        background: "#ffffff",
        cardBg: "#f8fafc",
        altBg: "#f1f5f9",
        border: "#e2e8f0",
        infoBox: "#dbeafe",
      },
      colorful: {
        primary: "#3b82f6",
        secondary: "#f97316",
        text: "#1f2937",
        background: "#fafafa",
        cardBg: "#f3f4f6",
        altBg: "#f9fafb",
        border: "#d1d5db",
        infoBox: "#fef3c7",
      },
      minimal: {
        primary: "#000000",
        secondary: "#666666",
        text: "#000000",
        background: "#ffffff",
        cardBg: "#f5f5f5",
        altBg: "#fafafa",
        border: "#cccccc",
        infoBox: "#f0f0f0",
      },
    };

    return schemes[this.config.colorScheme];
  }

  /**
   * Generate additional styles
   */
  private generateStyles(): Record<string, Record<string, string>> {
    return {};
  }

  /**
   * Assess metric quality
   */
  private assessMetric(type: string, value: number): string {
    switch (type) {
      case "drawdown":
        return value < -0.2 ? "⚠ High" : value < -0.1 ? "✓ Acceptable" : "✓ Excellent";
      case "sharpe":
        return value > 2 ? "✓ Excellent" : value > 1 ? "✓ Good" : "⚠ Needs Improvement";
      case "expectancy":
        return value > 0 ? "✓ Positive" : "⚠ Negative";
      default:
        return "N/A";
    }
  }
}

export default PDFExportEngine;
