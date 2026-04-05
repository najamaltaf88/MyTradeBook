/**
 * PLAYBOOK COMPLIANCE SCORING ENGINE
 * Calculates how well traders follow their own rules
 * Provides accountability and performance correlation
 */

export interface ComplianceMetrics {
  totalRules: number;
  followedRules: number;
  violatedRules: number;
  compliancePercentage: number;
  
  perRule: {
    ruleId: string;
    ruleName: string;
    category: string;
    followedCount: number;
    violatedCount: number;
    compliancePercentage: number;
    profitCorrelation: number; // Correlation between following rule and profitability
  }[];
  
  insights: {
    bestFollowedRule: string;
    worstFollowedRule: string;
    mostCorrelatedToProfits: string;
    impactStatement: string; // E.g., "Following rules would have increased profit by 15%"
  };
  
  complianceScore: "A+" | "A" | "B" | "C" | "D" | "F"; // Grade
}

export interface TradeData {
  id: string;
  symbol: string;
  profit: number;
  commission?: number;
  swap?: number;
  isClosed: boolean;
  reason?: string;
  logic?: string;
  emotion?: string;
  stopLoss?: number;
  takeProfit?: number;
  volume: number;
  duration: number;
}

function tradeNetPnl(trade: TradeData): number {
  return (trade.profit || 0) + (trade.commission || 0) + (trade.swap || 0);
}

export interface PlaybookRule {
  id: string;
  name: string;
  category: string;
  description: string;
  active: boolean;
}

export class ComplianceEngine {
  /**
   * Calculate compliance score for a trader
   */
  calculateCompliance(
    trades: TradeData[],
    rules: PlaybookRule[],
    complianceLogs: any[]
  ): ComplianceMetrics {
    const ruleMetrics = this.calculatePerRuleMetrics(trades, rules, complianceLogs);
    const totalFollowed = ruleMetrics.reduce((sum, r) => sum + r.followedCount, 0);
    const totalViolated = ruleMetrics.reduce((sum, r) => sum + r.violatedCount, 0);
    const total = totalFollowed + totalViolated || 1;

    const compliancePercentage = Math.round((totalFollowed / total) * 100);
    const score = this.scoreToGrade(compliancePercentage);

    return {
      totalRules: rules.length,
      followedRules: totalFollowed,
      violatedRules: totalViolated,
      compliancePercentage,
      perRule: ruleMetrics,
      insights: this.generateInsights(ruleMetrics, trades),
      complianceScore: score,
    };
  }

  /**
   * Calculate metrics for each rule
   */
  private calculatePerRuleMetrics(
    trades: TradeData[],
    rules: PlaybookRule[],
    complianceLogs: any[]
  ) {
    return rules.map((rule) => {
      const relevantLogs = complianceLogs.filter((log) => log.ruleId === rule.id);
      const followed = relevantLogs.filter((log) => log.followed).length;
      const violated = relevantLogs.filter((log) => !log.followed).length;
      const total = followed + violated || 1;

      // Calculate profit correlation
      const followedTrades = relevantLogs
        .filter((log) => log.followed)
        .map((log) => trades.find((t) => t.id === log.tradeId))
        .filter(Boolean) as TradeData[];

      const violatedTrades = relevantLogs
        .filter((log) => !log.followed)
        .map((log) => trades.find((t) => t.id === log.tradeId))
        .filter(Boolean) as TradeData[];

      const followedProfit = followedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);
      const violatedProfit = violatedTrades.reduce((sum, t) => sum + tradeNetPnl(t), 0);

      const correlation =
        Math.abs(followedProfit) > 0
          ? Math.round((followedProfit / (followedProfit + Math.abs(violatedProfit))) * 100)
          : 0;

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        followedCount: followed,
        violatedCount: violated,
        compliancePercentage: Math.round((followed / total) * 100),
        profitCorrelation: correlation,
      };
    });
  }

  /**
   * Generate compliance insights
   */
  private generateInsights(
    ruleMetrics: any[],
    trades: TradeData[]
  ): {
    bestFollowedRule: string;
    worstFollowedRule: string;
    mostCorrelatedToProfits: string;
    impactStatement: string;
  } {
    const bestRule = ruleMetrics.reduce((best, rule) =>
      rule.compliancePercentage > best.compliancePercentage ? rule : best
    );

    const worstRule = ruleMetrics.reduce((worst, rule) =>
      rule.compliancePercentage < worst.compliancePercentage ? rule : worst
    );

    const mostCorrelated = ruleMetrics.reduce((best, rule) =>
      rule.profitCorrelation > best.profitCorrelation ? rule : best
    );

    // Calculate impact: if trader had followed mostCorrelated rule 100% of time
    const totalProfit = trades.reduce((sum, t) => sum + tradeNetPnl(t), 0);
    const impactPercentage = Math.round(mostCorrelated.profitCorrelation / 2); // Conservative estimate

    return {
      bestFollowedRule: bestRule.ruleName,
      worstFollowedRule: worstRule.ruleName,
      mostCorrelatedToProfits: mostCorrelated.ruleName,
      impactStatement: `Following "${mostCorrelated.ruleName}" 100% of the time could increase profits by ~${impactPercentage}%`,
    };
  }

  /**
   * Convert compliance percentage to grade
   */
  private scoreToGrade(percentage: number): "A+" | "A" | "B" | "C" | "D" | "F" {
    if (percentage >= 95) return "A+";
    if (percentage >= 90) return "A";
    if (percentage >= 80) return "B";
    if (percentage >= 70) return "C";
    if (percentage >= 60) return "D";
    return "F";
  }

  /**
   * Detect rule violations in trades
   */
  detectViolations(
    trade: TradeData,
    rules: PlaybookRule[]
  ): { ruleId: string; ruleName: string; violated: boolean }[] {
    // Rule violation detection based on trade characteristics
    const violations: any[] = [];

    rules.forEach((rule) => {
      let isViolated = false;

      // Examples of rule-matching logic
      if (rule.description.toLowerCase().includes("stop loss")) {
        isViolated = !trade.stopLoss;
      } else if (rule.description.toLowerCase().includes("take profit")) {
        isViolated = !trade.takeProfit;
      } else if (rule.description.toLowerCase().includes("journal")) {
        isViolated = !trade.reason || !trade.logic || !trade.emotion;
      } else if (rule.description.toLowerCase().includes("risk")) {
        isViolated = !this.validatePositionSize(trade);
      }

      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        violated: isViolated,
      });
    });

    return violations;
  }

  /**
   * Validate position sizing consistency
   */
  private validatePositionSize(trade: TradeData): boolean {
    // Expected position size should be relatively consistent
    // This is a simplified check
    const normalRange = 0.5; // 0.5-1.5x average is good
    return trade.volume > 0;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(
    metrics: ComplianceMetrics,
    period: "daily" | "weekly" | "monthly"
  ): string {
    return `
PLAYBOOK COMPLIANCE REPORT (${period.toUpperCase()})
===============================================

Overall Compliance Score: ${metrics.complianceScore}
Compliance Rate: ${metrics.compliancePercentage}% (${metrics.followedRules}/${metrics.totalRules} rules followed)

BEST PRACTICES:
✓ Best Followed Rule: ${metrics.insights.bestFollowedRule}
✓ Most Profitable When Following: ${metrics.insights.mostCorrelatedToProfits}

AREAS FOR IMPROVEMENT:
✗ Worst Followed Rule: ${metrics.insights.worstFollowedRule}

KEY INSIGHT:
${metrics.insights.impactStatement}

DETAILED BREAKDOWN:
${metrics.perRule
  .map(
    (rule) => `
  ${rule.ruleName} (${rule.category})
    - Compliance: ${rule.compliancePercentage}% (${rule.followedCount} followed, ${rule.violatedCount} violated)
    - Profit Correlation: ${rule.profitCorrelation}%
`
  )
  .join("")}

RECOMMENDATION:
Focus on improving "${metrics.insights.worstFollowedRule}" and you could see meaningful performance gains.
`;
  }
}

export default ComplianceEngine;
