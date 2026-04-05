import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  TrendingUp,
  Server,
  Loader2,
  Copy,
  Check,
  Key,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useTimezone } from "@/hooks/use-timezone";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { connectAccountSchema } from "@shared/schema";
import type { Mt5Account } from "@shared/schema";
import { z } from "zod";

function ConnectAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<z.infer<typeof connectAccountSchema>>({
    resolver: zodResolver(connectAccountSchema),
    defaultValues: {
      name: "",
      server: "",
      login: "",
      broker: "",
      platform: "mt5",
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (data: z.infer<typeof connectAccountSchema>) => {
      const res = await apiRequest("POST", "/api/accounts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Account created", description: "Your account has been created. Set up the EA in MT5 to start syncing trades." });
      form.reset();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create account", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Trading Account</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => connectMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., GoatFunded Challenge" {...field} data-testid="input-account-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="broker"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Broker (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., GoatFunded, FTMO, ICMarkets" {...field} data-testid="input-broker" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="server"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., GoatFunded-Server" {...field} data-testid="input-server" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="login"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Login / Account Number (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 314219481" {...field} data-testid="input-login" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                After creating the account, you'll get an API key and the EA file to install in MT5.
                Trades will sync automatically while MT5 is open.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={connectMutation.isPending}
              data-testid="button-connect-account"
            >
              {connectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Account
                </>
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SetupInstructions({ account, onClose }: { account: Mt5Account; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const appUrl = window.location.origin;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Setup EA for {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Step 1: Download the EA file</h4>
            <a href="/api/downloads/ea" download>
              <Button variant="outline" size="sm" className="w-full" data-testid="button-download-ea">
                <Download className="w-4 h-4 mr-2" />
                Download MyTradebook_EA.mq5
              </Button>
            </a>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Step 2: Copy your API Key</h4>
            {account.apiKey ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all" data-testid="text-api-key">
                  {account.apiKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(account.apiKey || "", "apiKey")}
                  data-testid="button-copy-api-key"
                >
                  {copied === "apiKey" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded">
                Close this dialog and click the refresh icon on your account card to generate an API key.
              </p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Step 3: Copy your Server URL</h4>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all" data-testid="text-server-url">
                {appUrl}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(appUrl, "url")}
                data-testid="button-copy-url"
              >
                {copied === "url" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Step 4: Install in MT5</h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Open MT5 and go to <strong>File &gt; Open Data Folder</strong></li>
              <li>Navigate to <strong>MQL5 &gt; Experts</strong></li>
              <li>Copy the downloaded <code>MyTradebook_EA.mq5</code> file there</li>
              <li>In MT5, go to <strong>Tools &gt; Options &gt; Expert Advisors</strong></li>
              <li>Check <strong>"Allow WebRequest for listed URL"</strong> and add:<br/>
                <code className="bg-muted px-1 py-0.5 rounded">{appUrl}</code>
              </li>
              <li>In the Navigator panel, find <strong>MyTradebook_EA</strong> under Expert Advisors</li>
              <li>Drag it onto any chart</li>
              <li>In the EA settings, paste your <strong>API Key</strong> and <strong>Server URL</strong></li>
              <li>Click OK - trades will now sync automatically!</li>
            </ol>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                The EA only reads your trade data - it cannot execute trades or modify your account.
                Keep MT5 open for real-time sync. Past trades from the last 7 days will sync on first run.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountCard({ account }: { account: Mt5Account }) {
  const { toast } = useToast();
  const { timezone } = useTimezone();
  const [showSetup, setShowSetup] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    setTimeout(() => {
      setSyncing(false);
      toast({ title: "Synced", description: "Trade data refreshed from server." });
    }, 1500);
  };

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/accounts/${account.id}/regenerate-key`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "API key regenerated", description: "Update the key in your MT5 EA settings." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/accounts/${account.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Account removed", description: "The account and all its trades have been removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isConnected = account.connected && account.lastSyncAt &&
    (new Date().getTime() - new Date(account.lastSyncAt).getTime() < 10 * 60 * 1000);

  return (
    <>
      <Card data-testid={`card-account-${account.id}`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold truncate">{account.name}</h3>
                <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px]">
                  {isConnected ? "Live" : "Offline"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                {account.broker && (
                  <>
                    <Server className="w-3 h-3" />
                    {account.broker}
                  </>
                )}
                {account.server && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    {account.server}
                  </>
                )}
                {account.login && (
                  <>
                    <span className="text-muted-foreground/50">|</span>
                    Login: {account.login}
                  </>
                )}
              </p>
            </div>
            {isConnected ? (
              <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
              <p className="text-base font-bold font-mono mt-0.5">
                {formatCurrency(account.balance || 0, account.currency || "USD")}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Equity</p>
              <p className="text-base font-bold font-mono mt-0.5">
                {formatCurrency(account.equity || 0, account.currency || "USD")}
              </p>
            </div>
          </div>

          {account.leverage && (
            <p className="text-xs text-muted-foreground mb-1">Leverage: 1:{account.leverage}</p>
          )}
          {account.lastSyncAt && (
            <p className="text-xs text-muted-foreground mb-2">Last sync: {formatDate(account.lastSyncAt, timezone)}</p>
          )}

          <div className="mb-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">API Key</p>
            {account.apiKey ? (
              <div className="flex items-center gap-1">
                <code className="flex-1 bg-muted px-2 py-1 rounded text-[10px] font-mono truncate">
                  {showKey ? account.apiKey : account.apiKey.substring(0, 8) + "..." + account.apiKey.substring(account.apiKey.length - 4)}
                </code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(account.apiKey || "");
                    toast({ title: "Copied", description: "API key copied to clipboard" });
                  }}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => regenerateKeyMutation.mutate()}
                disabled={regenerateKeyMutation.isPending}
                data-testid={`button-generate-key-${account.id}`}
              >
                {regenerateKeyMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Key className="w-3 h-3 mr-1.5" />}
                Generate API Key
              </Button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="flex-1"
              data-testid={`button-sync-${account.id}`}
            >
              <RefreshCw className={cn("w-3 h-3 mr-1.5", syncing && "animate-spin")} />
              {syncing ? "Syncing..." : "Sync Trades"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSetup(true)}
              className="flex-1"
              data-testid={`button-setup-${account.id}`}
            >
              <Download className="w-3 h-3 mr-1.5" />
              EA Setup
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => regenerateKeyMutation.mutate()}
              disabled={regenerateKeyMutation.isPending}
              title="Regenerate API Key"
              data-testid={`button-regen-key-${account.id}`}
            >
              {regenerateKeyMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Key className="w-3 h-3" />
              )}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-${account.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Account</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the account and all imported trades. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground"
                    data-testid="button-confirm-delete"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {showSetup && <SetupInstructions account={account} onClose={() => setShowSetup(false)} />}
    </>
  );
}

export default function AccountsPage() {
  const [connectOpen, setConnectOpen] = useState(false);

  const { data: accounts, isLoading } = useQuery<Mt5Account[]>({
    queryKey: ["/api/accounts"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-accounts">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your MT5 accounts via the Expert Advisor for automatic trade sync
          </p>
        </div>
        <Button onClick={() => setConnectOpen(true)} data-testid="button-add-account">
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      {(accounts || []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No accounts connected</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-2">
              Add your MT5 account and install the Expert Advisor to automatically sync your trades in real-time.
            </p>
            <p className="text-xs text-muted-foreground text-center max-w-sm mb-4">
              The EA only reads trade data - it cannot execute trades or modify your account.
            </p>
            <Button onClick={() => setConnectOpen(true)} data-testid="button-connect-first-account">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(accounts || []).map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}

      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
}
