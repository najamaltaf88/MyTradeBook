import { Suspense, lazy, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { AccountProvider, useAccount } from "@/hooks/use-account";
import { TimezoneProvider } from "@/hooks/use-timezone";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useSupabaseSession } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import LoginPage from "@/pages/login";
import { Minus, Plus, RotateCcw, Sparkles } from "lucide-react";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const LandingPage = lazy(() => import("@/pages/landing"));
const TradesPage = lazy(() => import("@/pages/trades"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const NotesPage = lazy(() => import("@/pages/notes"));
const AiInsightsPage = lazy(() => import("@/pages/ai-insights"));
const PsychologyPage = lazy(() => import("@/pages/psychology"));
const RiskPage = lazy(() => import("@/pages/risk"));
const StrategyEdgePage = lazy(() => import("@/pages/strategy-edge"));
const AccountsPage = lazy(() => import("@/pages/accounts"));
const RiskCalculator = lazy(() => import("@/pages/risk-calculator"));
const PlaybookPage = lazy(() => import("@/pages/playbook"));
const GoalsPage = lazy(() => import("@/pages/goals"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const BacktestingRemovedPage = lazy(() => import("@/pages/backtesting-removed"));
const CryptoChartsPage = lazy(() => import("@/pages/crypto-charts"));
const TemplatesPage = lazy(() => import("@/pages/templates"));
const CompliancePage = lazy(() => import("@/pages/compliance"));
const HeatmapsPage = lazy(() => import("@/pages/heatmaps"));
const PdfExportPage = lazy(() => import("@/pages/pdf-export"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoadingState() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-8">
      <div className="glass-panel-strong w-full max-w-xl rounded-[1.8rem] px-6 py-6">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
          Loading
        </div>
        <div className="mt-2 text-lg font-semibold text-foreground">Preparing your workspace</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Loading only the screen you opened to keep memory use lighter and navigation smoother.
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/landing" component={LandingPage} />
        <Route path="/trades" component={TradesPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/notes" component={NotesPage} />
        <Route path="/ai-insights" component={AiInsightsPage} />
        <Route path="/psychology" component={PsychologyPage} />
        <Route path="/risk" component={RiskPage} />
        <Route path="/strategy-edge" component={StrategyEdgePage} />
        <Route path="/accounts" component={AccountsPage} />
        <Route path="/risk-calculator" component={RiskCalculator} />
        <Route path="/playbook" component={PlaybookPage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/backtester" component={BacktestingRemovedPage} />
        <Route path="/backtests" component={BacktestingRemovedPage} />
        <Route path="/crypto-charts" component={CryptoChartsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/compliance" component={CompliancePage} />
        <Route path="/heatmaps" component={HeatmapsPage} />
        <Route path="/pdf-export" component={PdfExportPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

const sidebarStyle = {
  "--sidebar-width": "17.5rem",
  "--sidebar-width-icon": "3rem",
};

const UI_ZOOM_STORAGE_KEY = "mytradebook.uiZoom";
const UI_ZOOM_MIN = 0.85;
const UI_ZOOM_MAX = 1.25;
const UI_ZOOM_STEP = 0.05;

const routeShellMeta = [
  { match: "/landing", title: "Welcome", subtitle: "Set up the journal, connect data sources, and get the workspace ready." },
  { match: "/trades", title: "Trade Journal", subtitle: "Review executions, screenshots, and notes without losing context." },
  { match: "/analytics", title: "Analytics", subtitle: "Track edge, consistency, and performance patterns across accounts." },
  { match: "/notes", title: "Notes", subtitle: "Capture lessons, weaknesses, and repeatable improvements in one place." },
  { match: "/ai-insights", title: "AI Insights", subtitle: "Read generated trade feedback, summaries, and coaching prompts." },
  { match: "/psychology", title: "Psychology", subtitle: "Watch behavioral trends and decision quality over time." },
  { match: "/risk", title: "Risk Analysis", subtitle: "Measure exposure, drawdown, and rule adherence before it becomes costly." },
  { match: "/strategy-edge", title: "Strategy Edge", subtitle: "Compare setups and sessions to find what is worth repeating." },
  { match: "/accounts", title: "Accounts", subtitle: "Manage MT5 accounts and keep balances aligned with the journal." },
  { match: "/risk-calculator", title: "Risk Calculator", subtitle: "Plan position size, stop distance, and capital exposure quickly." },
  { match: "/playbook", title: "Playbook", subtitle: "Maintain execution rules and setup definitions with clear structure." },
  { match: "/goals", title: "Goals", subtitle: "Keep performance targets visible and measurable." },
  { match: "/reports", title: "Reports", subtitle: "Generate clean summaries for review, coaching, or external sharing." },
  { match: "/calendar", title: "Calendar", subtitle: "Keep economic events and trade timing aligned." },
  { match: "/backtester", title: "Backtesting Removed", subtitle: "Backtesting has been removed. Use Crypto Charts instead." },
  { match: "/backtests", title: "Backtesting Removed", subtitle: "Backtesting has been removed. Use Crypto Charts instead." },
  { match: "/crypto-charts", title: "Crypto Charts", subtitle: "Use live market charts with TradingView and CoinMarketCap context." },
  { match: "/templates", title: "Templates", subtitle: "Standardize outputs and reduce repetitive setup work." },
  { match: "/compliance", title: "Compliance", subtitle: "Check rules, consistency, and professional discipline at a glance." },
  { match: "/heatmaps", title: "Heatmaps", subtitle: "Spot performance clusters by time, symbol, and behavior." },
  { match: "/pdf-export", title: "PDF Export", subtitle: "Prepare polished reports for archive or distribution." },
  { match: "/alerts", title: "Alerts", subtitle: "Create practical notifications and verify they are actually working." },
  { match: "/", title: "Dashboard", subtitle: "See balances, edge, and recent activity in a calmer command center." },
] as const;

function clampZoom(value: number) {
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, Number(value.toFixed(2))));
}

function readStoredZoom() {
  if (typeof window === "undefined") return 1;
  try {
    const stored = window.localStorage.getItem(UI_ZOOM_STORAGE_KEY);
    if (!stored) return 1;
    const parsed = Number.parseFloat(stored);
    return clampZoom(Number.isFinite(parsed) ? parsed : 1);
  } catch {
    return 1;
  }
}

function getShellMeta(pathname: string) {
  return routeShellMeta.find((item) =>
    item.match === "/" ? pathname === "/" : pathname.startsWith(item.match),
  ) ?? routeShellMeta[routeShellMeta.length - 1]!;
}

function AccountSelector() {
  const { accounts, selectedAccountId, selectAccount } = useAccount();

  if (accounts.length === 0) return null;

  return (
    <Select
      value={selectedAccountId || "__all__"}
      onValueChange={(val) => selectAccount(val === "__all__" ? null : val)}
    >
      <SelectTrigger
        className="h-11 w-full min-w-[12rem] rounded-2xl border-border bg-card text-xs shadow-sm sm:w-[220px]"
        data-testid="select-account"
      >
        <SelectValue placeholder="All Accounts" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All Accounts</SelectItem>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name || `Account ${a.id.slice(0, 6)}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ShellHeader() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const shellMeta = useMemo(() => getShellMeta(location), [location]);
  const [zoomLevel, setZoomLevel] = useState(() => readStoredZoom());

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--app-zoom", zoomLevel.toFixed(2));
    try {
      window.localStorage.setItem(UI_ZOOM_STORAGE_KEY, zoomLevel.toFixed(2));
    } catch {
      // Ignore local preference persistence errors.
    }
  }, [zoomLevel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoomLevel((current) => clampZoom(current + UI_ZOOM_STEP));
      } else if (event.key === "-") {
        event.preventDefault();
        setZoomLevel((current) => clampZoom(current - UI_ZOOM_STEP));
      } else if (event.key === "0") {
        event.preventDefault();
        setZoomLevel(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="app-header shrink-0">
      <div className="app-header-inner">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <SidebarTrigger
            className="mt-0.5 h-10 w-10 rounded-2xl border border-border bg-card text-foreground shadow-sm"
            data-testid="button-sidebar-toggle"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="surface-pill text-[11px] font-semibold uppercase tracking-[0.24em] px-2.5 py-1 text-primary/85">
                MyTradebook
              </span>
              {!isMobile && (
                <span className="inline-flex items-center rounded-full border border-primary/18 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary shadow-sm">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Professional workspace
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                {shellMeta.title}
              </h1>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                {shellMeta.subtitle}
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
          <div
            className="flex items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-sm"
            data-testid="app-zoom-controls"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setZoomLevel((current) => clampZoom(current - UI_ZOOM_STEP))}
              disabled={zoomLevel <= UI_ZOOM_MIN}
              aria-label="Zoom out"
              data-testid="button-zoom-out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-[4.5rem] rounded-xl px-3 font-semibold tabular-nums"
              onClick={() => setZoomLevel(1)}
              aria-label="Reset zoom"
              data-testid="button-zoom-reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{Math.round(zoomLevel * 100)}%</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setZoomLevel((current) => clampZoom(current + UI_ZOOM_STEP))}
              disabled={zoomLevel >= UI_ZOOM_MAX}
              aria-label="Zoom in"
              data-testid="button-zoom-in"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="w-full sm:w-auto">
            <AccountSelector />
          </div>
        </div>
      </div>
    </header>
  );
}

function AuthenticatedApp() {
  return (
    <TimezoneProvider>
      <AccountProvider>
        <SidebarProvider style={sidebarStyle as CSSProperties}>
          <div className="app-shell flex h-svh min-h-0 w-full overflow-hidden">
            <AppSidebar />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <ShellHeader />
              <main className="app-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
      </AccountProvider>
    </TimezoneProvider>
  );
}

function AppContent() {
  const { session, loading, isRecovery, clearRecovery } = useSupabaseSession();
  useRealtimeSync(Boolean(session));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        <div className="glass-panel-strong rounded-[1.75rem] px-6 py-5 text-sm text-muted-foreground">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!session || isRecovery) {
    return <LoginPage isRecovery={isRecovery} onRecoveryComplete={clearRecovery} />;
  }

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppErrorBoundary>
            <AppContent />
            <Toaster />
          </AppErrorBoundary>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
