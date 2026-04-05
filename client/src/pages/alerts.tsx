import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAccount } from "@/hooks/use-account";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AlertType =
  | "loss"
  | "profit"
  | "drawdown"
  | "trades_count"
  | "rule_violation"
  | "goal_missed";

type AlertCondition = "exceeds" | "falls_below" | "equals";

type AlertChannels = {
  discord?: { webhookUrl?: string; enabled?: boolean };
  slack?: { webhookUrl?: string; enabled?: boolean };
  email?: { addresses?: string[]; enabled?: boolean };
  push?: { enabled?: boolean };
  webhook?: { url?: string; enabled?: boolean };
};

interface AlertRecord {
  id: string;
  accountId: string | null;
  name: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: number;
  channels: AlertChannels;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AlertHistoryRecord {
  id: string;
  configId: string;
  accountId: string | null;
  title: string;
  message: string;
  channels: AlertChannels;
  status: "sent" | "failed" | "pending";
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
}

type AlertFormState = {
  accountId: string;
  name: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: string;
  enabled: boolean;
  discordEnabled: boolean;
  discordWebhookUrl: string;
  slackEnabled: boolean;
  slackWebhookUrl: string;
  emailEnabled: boolean;
  emailAddresses: string;
  pushEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
};

const ALERT_TYPE_OPTIONS: Array<{ value: AlertType; label: string; description: string }> = [
  { value: "loss", label: "Loss", description: "Track loss thresholds and daily downside pain." },
  { value: "profit", label: "Profit", description: "Alert when realized profit crosses a target." },
  { value: "drawdown", label: "Drawdown", description: "Warn when drawdown pressure grows too large." },
  { value: "trades_count", label: "Trades Count", description: "Detect overtrading or hitting a quota." },
  { value: "rule_violation", label: "Rule Violation", description: "Flag broken playbook discipline." },
  { value: "goal_missed", label: "Goal Missed", description: "Warn when performance goals slip." },
];

const ALERT_CONDITION_OPTIONS: Array<{ value: AlertCondition; label: string }> = [
  { value: "exceeds", label: "Exceeds" },
  { value: "falls_below", label: "Falls Below" },
  { value: "equals", label: "Equals" },
];

function emptyForm(accountId: string | null): AlertFormState {
  return {
    accountId: accountId ?? "__all__",
    name: "",
    type: "drawdown",
    condition: "exceeds",
    threshold: "",
    enabled: true,
    discordEnabled: false,
    discordWebhookUrl: "",
    slackEnabled: false,
    slackWebhookUrl: "",
    emailEnabled: false,
    emailAddresses: "",
    pushEnabled: true,
    webhookEnabled: false,
    webhookUrl: "",
  };
}

function formFromAlert(alert: AlertRecord): AlertFormState {
  return {
    accountId: alert.accountId ?? "__all__",
    name: alert.name,
    type: alert.type,
    condition: alert.condition,
    threshold: String(alert.threshold),
    enabled: alert.enabled,
    discordEnabled: Boolean(alert.channels.discord?.enabled),
    discordWebhookUrl: alert.channels.discord?.webhookUrl ?? "",
    slackEnabled: Boolean(alert.channels.slack?.enabled),
    slackWebhookUrl: alert.channels.slack?.webhookUrl ?? "",
    emailEnabled: Boolean(alert.channels.email?.enabled),
    emailAddresses: (alert.channels.email?.addresses ?? []).join(", "),
    pushEnabled: Boolean(alert.channels.push?.enabled),
    webhookEnabled: Boolean(alert.channels.webhook?.enabled),
    webhookUrl: alert.channels.webhook?.url ?? "",
  };
}

function buildPayload(form: AlertFormState) {
  const threshold = Number(form.threshold);
  const channels: AlertChannels = {};

  if (form.discordEnabled || form.discordWebhookUrl.trim()) {
    channels.discord = {
      enabled: form.discordEnabled,
      webhookUrl: form.discordWebhookUrl.trim() || undefined,
    };
  }
  if (form.slackEnabled || form.slackWebhookUrl.trim()) {
    channels.slack = {
      enabled: form.slackEnabled,
      webhookUrl: form.slackWebhookUrl.trim() || undefined,
    };
  }
  if (form.emailEnabled || form.emailAddresses.trim()) {
    channels.email = {
      enabled: form.emailEnabled,
      addresses: form.emailAddresses
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
  if (form.pushEnabled) {
    channels.push = { enabled: true };
  }
  if (form.webhookEnabled || form.webhookUrl.trim()) {
    channels.webhook = {
      enabled: form.webhookEnabled,
      url: form.webhookUrl.trim() || undefined,
    };
  }

  return {
    accountId: form.accountId === "__all__" ? null : form.accountId,
    name: form.name.trim(),
    type: form.type,
    condition: form.condition,
    threshold,
    enabled: form.enabled,
    channels,
  };
}

function channelBadges(channels: AlertChannels): string[] {
  const labels: string[] = [];
  if (channels.discord?.enabled) labels.push("Discord");
  if (channels.slack?.enabled) labels.push("Slack");
  if (channels.email?.enabled) labels.push("Email");
  if (channels.push?.enabled) labels.push("Push");
  if (channels.webhook?.enabled) labels.push("Webhook");
  return labels;
}

export default function AlertsPage() {
  const { toast } = useToast();
  const { accounts, selectedAccount, selectedAccountId } = useAccount();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AlertFormState>(() => emptyForm(null));

  const alertsQuery = useQuery<AlertRecord[]>({
    queryKey: ["/api/alerts", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      const response = await fetch(`/api/alerts${params.toString() ? `?${params.toString()}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load alerts");
      return response.json() as Promise<AlertRecord[]>;
    },
  });

  const historyQuery = useQuery<AlertHistoryRecord[]>({
    queryKey: ["/api/alerts/history", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "20" });
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      const response = await fetch(`/api/alerts/history?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to load alert history");
      return response.json() as Promise<AlertHistoryRecord[]>;
    },
  });

  useEffect(() => {
    if (!editingId) {
      setForm((prev) => ({
        ...prev,
        accountId: selectedAccountId ?? "__all__",
      }));
    }
  }, [editingId, selectedAccountId]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(selectedAccountId));
  };

  const invalidateAlerts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/history"] }),
    ]);
  };

  const saveAlert = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(form);
      if (!payload.name) {
        throw new Error("Alert name is required");
      }
      if (!form.threshold.trim()) {
        throw new Error("Threshold is required");
      }
      if (!Number.isFinite(payload.threshold)) {
        throw new Error("Threshold must be a valid number");
      }

      const response = editingId
        ? await apiRequest("PATCH", `/api/alerts/${editingId}`, payload)
        : await apiRequest("POST", "/api/alerts", payload);
      return response.json() as Promise<AlertRecord>;
    },
    onSuccess: async () => {
      await invalidateAlerts();
      toast({ title: editingId ? "Alert updated" : "Alert created" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save alert", description: error.message, variant: "destructive" });
    },
  });

  const deleteAlert = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: async () => {
      await invalidateAlerts();
      toast({ title: "Alert deleted" });
      if (editingId) resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete alert", description: error.message, variant: "destructive" });
    },
  });

  const toggleAlert = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const response = await apiRequest("PATCH", `/api/alerts/${id}`, { enabled });
      return response.json() as Promise<AlertRecord>;
    },
    onSuccess: async () => {
      await invalidateAlerts();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update alert", description: error.message, variant: "destructive" });
    },
  });

  const testAlert = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/alerts/${id}/test`);
      return response.json() as Promise<{ success: boolean }>;
    },
    onSuccess: async (data) => {
      await invalidateAlerts();
      toast({
        title: data.success ? "Test alert sent" : "Test alert failed",
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send test alert", description: error.message, variant: "destructive" });
    },
  });

  const alerts = alertsQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const activeCount = alerts.filter((alert) => alert.enabled).length;
  const scopeLabel = selectedAccount?.name || "All Accounts";
  const selectedType = useMemo(
    () => ALERT_TYPE_OPTIONS.find((option) => option.value === form.type),
    [form.type],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground">
            Real alert configuration for {scopeLabel}. Create rules, send test alerts, and review recent delivery history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetForm}>
            <Plus className="mr-2 h-4 w-4" />
            New Alert
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configured Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Rules in the current scope</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently enabled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{history.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Latest send/test history records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit Alert" : "Create Alert"}</CardTitle>
            <CardDescription>
              {selectedType?.description || "Configure the trigger condition and the channels that should receive the alert."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="alert-name">Alert Name</Label>
                <Input
                  id="alert-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Daily Drawdown Guard"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Scope</Label>
                <Select
                  value={form.accountId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, accountId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Alert Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as AlertType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select
                  value={form.condition}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, condition: value as AlertCondition }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_CONDITION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="alert-threshold">Threshold</Label>
                <Input
                  id="alert-threshold"
                  type="number"
                  value={form.threshold}
                  onChange={(event) => setForm((prev) => ({ ...prev, threshold: event.target.value }))}
                  placeholder="500"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Enabled</div>
                  <div className="text-xs text-muted-foreground">Allow this alert to trigger</div>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Discord</Label>
                  <Switch
                    checked={form.discordEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, discordEnabled: checked }))}
                  />
                </div>
                <Input
                  value={form.discordWebhookUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, discordWebhookUrl: event.target.value }))}
                  placeholder="Discord webhook URL"
                />
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Slack</Label>
                  <Switch
                    checked={form.slackEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, slackEnabled: checked }))}
                  />
                </div>
                <Input
                  value={form.slackWebhookUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, slackWebhookUrl: event.target.value }))}
                  placeholder="Slack webhook URL"
                />
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Email</Label>
                  <Switch
                    checked={form.emailEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, emailEnabled: checked }))}
                  />
                </div>
                <Input
                  value={form.emailAddresses}
                  onChange={(event) => setForm((prev) => ({ ...prev, emailAddresses: event.target.value }))}
                  placeholder="Comma-separated email addresses"
                />
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Custom Webhook</Label>
                  <Switch
                    checked={form.webhookEnabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, webhookEnabled: checked }))}
                  />
                </div>
                <Input
                  value={form.webhookUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                  placeholder="Custom webhook URL"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Push Notifications</div>
                <div className="text-xs text-muted-foreground">Local in-app notifications remain enabled by default</div>
              </div>
              <Switch
                checked={form.pushEnabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, pushEnabled: checked }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveAlert.mutate()} disabled={saveAlert.isPending}>
                {saveAlert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingId ? "Save Changes" : "Create Alert"}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={resetForm}>
                  Cancel Edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Alert History</CardTitle>
            <CardDescription>Test sends and recorded delivery attempts for the current scope.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading alert history...</div>
            ) : history.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No alert history yet. Send a test alert to confirm delivery wiring.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground mt-1">{item.message}</div>
                    </div>
                    <Badge variant={item.status === "sent" ? "default" : item.status === "failed" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{new Date(item.triggeredAt).toLocaleString()}</span>
                    {channelBadges(item.channels).map((label) => (
                      <Badge key={`${item.id}-${label}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Alerts</CardTitle>
          <CardDescription>These alerts are persisted and can be tested from here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {alertsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
              <div className="mt-3 font-medium">No alerts configured</div>
              <div className="text-sm text-muted-foreground mt-1">
                Create an alert above to start testing notifications.
              </div>
            </div>
          ) : (
            alerts.map((alert) => {
              const channels = channelBadges(alert.channels);
              const isBusy =
                deleteAlert.isPending ||
                toggleAlert.isPending ||
                testAlert.isPending;
              return (
                <div key={alert.id} className={`rounded-xl border p-4 ${alert.enabled ? "" : "opacity-70"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">{alert.name}</div>
                        <Badge variant={alert.enabled ? "default" : "secondary"}>
                          {alert.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline">{alert.type}</Badge>
                        <Badge variant="outline">
                          {alert.condition} {alert.threshold}
                        </Badge>
                        {alert.accountId ? (
                          <Badge variant="outline">
                            {accounts.find((account) => account.id === alert.accountId)?.name || "Account Alert"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">All Accounts</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {channels.length ? (
                          channels.map((label) => (
                            <Badge key={`${alert.id}-${label}`} variant="outline">
                              {label}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">No delivery channel configured</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated {new Date(alert.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(alert.id);
                          setForm(formFromAlert(alert));
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAlert.mutate({ id: alert.id, enabled: !alert.enabled })}
                        disabled={isBusy}
                      >
                        {alert.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testAlert.mutate(alert.id)}
                        disabled={isBusy}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Test
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteAlert.mutate(alert.id)}
                        disabled={isBusy}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Current Scope Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-500" />
            Alerts now support real create, edit, delete, enable/disable, test-send, and history tracking.
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            Slack, Discord, webhook, and email delivery only work if you provide valid endpoints or addresses. Push notifications remain local-only.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
