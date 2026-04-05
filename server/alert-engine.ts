/**
 * ALERT ENGINE
 * Manages trade alerts across multiple channels:
 * - Discord webhooks
 * - Slack webhooks
 * - Email integration
 * - Push notifications
 * - Custom webhooks
 */

import axios from "axios";

export interface AlertConfig {
  id: string;
  name: string;
  type: "loss" | "profit" | "drawdown" | "trades_count" | "rule_violation" | "goal_missed";
  condition: "exceeds" | "falls_below" | "equals";
  threshold: number;
  channels: {
    discord?: { webhookUrl?: string; enabled?: boolean };
    slack?: { webhookUrl?: string; enabled?: boolean };
    email?: { addresses?: string[]; enabled?: boolean };
    push?: { enabled?: boolean };
    webhook?: { url?: string; enabled?: boolean };
  };
  enabled: boolean;
}

export interface AlertEvent {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical"; // color-coded
  symbol?: string;
  value?: number;
  threshold?: number;
  accountName?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class AlertEngine {
  private discordClient: any;
  private slackClient: any;
  private emailService: any;

  constructor(
    discordWebhookUrl?: string,
    slackWebhookUrl?: string,
    emailApiKey?: string
  ) {}

  /**
   * Evaluate alert triggers based on current trading metrics
   */
  async evaluateAlerts(
    config: AlertConfig,
    currentValue: number,
  ): Promise<boolean> {
    const triggered = this.evaluateCondition(
      currentValue,
      config.threshold,
      config.condition
    );

    if (triggered) {
      await this.triggerAlert(config, currentValue);
    }
    return triggered;
  }

  /**
   * Condition evaluation
   */
  private evaluateCondition(
    value: number,
    threshold: number,
    condition: string
  ): boolean {
    switch (condition) {
      case "exceeds":
        return value > threshold;
      case "falls_below":
        return value < threshold;
      case "equals":
        return Math.abs(value - threshold) < 0.01;
      default:
        return false;
    }
  }

  /**
   * Send alert across configured channels
   */
  async triggerAlert(config: AlertConfig, value: number): Promise<void> {
    const event: AlertEvent = {
      title: `${config.name} Alert`,
      message: `${config.type} ${config.condition} ${config.threshold}. Current: ${value}`,
      severity: this.determineSeverity(config.type, value, config.threshold),
      threshold: config.threshold,
      value,
      timestamp: new Date(),
    };

    const deliveryPromises: Promise<any>[] = [];

    if (config.channels.discord?.enabled && config.channels.discord.webhookUrl) {
      deliveryPromises.push(
        this.sendDiscordAlert(config.channels.discord.webhookUrl, event)
      );
    }

    if (config.channels.slack?.enabled && config.channels.slack.webhookUrl) {
      deliveryPromises.push(
        this.sendSlackAlert(config.channels.slack.webhookUrl, event)
      );
    }

    if (config.channels.email?.enabled && config.channels.email.addresses) {
      deliveryPromises.push(
        this.sendEmailAlert(config.channels.email.addresses, event)
      );
    }

    if (config.channels.push?.enabled) {
      deliveryPromises.push(this.sendPushAlert(event));
    }

    if (config.channels.webhook?.enabled && config.channels.webhook.url) {
      deliveryPromises.push(
        this.sendCustomWebhook(config.channels.webhook.url, event)
      );
    }

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Send Discord embed alert
   */
  private async sendDiscordAlert(
    webhookUrl: string,
    event: AlertEvent
  ): Promise<void> {
    const colorMap = {
      info: 0x3498db,
      warning: 0xf39c12,
      critical: 0xe74c3c,
    };

    const embed = {
      title: event.title,
      description: event.message,
      color: colorMap[event.severity],
      fields: [
        {
          name: "Threshold",
          value: `${event.threshold}`,
          inline: true,
        },
        {
          name: "Current Value",
          value: `${event.value?.toFixed(2)}`,
          inline: true,
        },
        {
          name: "Time",
          value: event.timestamp.toISOString(),
          inline: false,
        },
      ],
      timestamp: event.timestamp.toISOString(),
    };

    await axios.post(webhookUrl, { embeds: [embed] });
  }

  /**
   * Send Slack message alert
   */
  private async sendSlackAlert(
    webhookUrl: string,
    event: AlertEvent
  ): Promise<void> {
    const colorMap = {
      info: "#3498db",
      warning: "#f39c12",
      critical: "#e74c3c",
    };

    const message = {
      text: event.title,
      attachments: [
        {
          color: colorMap[event.severity],
          title: event.message,
          fields: [
            {
              title: "Threshold",
              value: `${event.threshold}`,
              short: true,
            },
            {
              title: "Current Value",
              value: `${event.value?.toFixed(2)}`,
              short: true,
            },
          ],
          ts: Math.floor(event.timestamp.getTime() / 1000),
        },
      ],
    };

    await axios.post(webhookUrl, message);
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(
    addresses: string[],
    event: AlertEvent
  ): Promise<void> {
    // Integration with SendGrid, MailerSend, or similar
    console.log(`Email alert to ${addresses.join(", ")}:`, event.title);
    // Implementation would use actual email service
  }

  /**
   * Send push notification
   */
  private async sendPushAlert(event: AlertEvent): Promise<void> {
    // Integration with Firebase Cloud Messaging or similar
    console.log("Push alert:", event.title);
    // Implementation would use actual push service
  }

  /**
   * Send custom webhook
   */
  private async sendCustomWebhook(
    url: string,
    event: AlertEvent
  ): Promise<void> {
    await axios.post(url, event);
  }

  /**
   * Determine alert severity
   */
  private determineSeverity(
    type: string,
    value: number,
    threshold: number
  ): "info" | "warning" | "critical" {
    if (type === "loss") {
      return Math.abs(value) > threshold * 0.8 ? "critical" : "warning";
    }
    if (type === "drawdown") {
      return Math.abs(value) > threshold * 0.8 ? "critical" : "warning";
    }
    return "info";
  }

  /**
   * Common alert patterns
   */
  static patterns = {
    DAILY_LOSS_EXCEEDED: "Daily loss exceeded target",
    MONTHLY_LOSS_EXCEEDED: "Monthly loss exceeded target",
    DRAWDOWN_CRITICAL: "Maximum drawdown threshold crossed",
    WIN_STREAK: "Winning streak milestone reached",
    LOSS_STREAK: "Loss streak detected",
    RULE_VIOLATION: "Playbook rule violation",
    GOAL_MISSED: "Daily goal not met",
    OVERTRADING: "Trading too many times",
    BREAK_EVEN: "Trade closed at break even",
    PERFECT_TRADE: "Grade A+ trade closed",
  };
}

export default AlertEngine;
