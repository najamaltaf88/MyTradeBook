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
import { usePostTradeReview } from "@/hooks/use-post-trade-review";
import { PostTradeReviewDialog } from "@/components/post-trade-review-dialog";
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
import { Minus, Moon, Plus, RotateCcw, Sparkles, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { RouteRedirect } from "@/components/route-redirect";

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
const MarginCalculatorPage = lazy(() => import("@/pages/margin-calculator"));
const PdfExportPage = lazy(() => import("@/pages/pdf-export"));
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
        <Route path="/margin-calculator" component={MarginCalculatorPage} />
        <Route path="/risk-calculator" component={RiskCalculator} />
        <Route path="/playbook" component={PlaybookPage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/backtester" component={BacktestingRemovedPage} />
        <Route path="/backtests" component={BacktestingRemovedPage} />
        <Route path="/crypto-charts" component={CryptoChartsPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/pdf-export" component={PdfExportPage} />
        <Route path="/alerts">
          <RouteRedirect to="/margin-calculator" />
        </Route>
        <Route path="/compliance">
          <RouteRedirect to="/playbook" />
        </Route>
        <Route path="/heatmaps">
          <RouteRedirect to="/analytics" />
        </Route>
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
  { match: "/landing", title: "Welcome", subtitle: "Connect accounts and align the journal with how you trade FX." },
  { match: "/trades", title: "Trade Journal", subtitle: "Every ticket: pair, size, session context, screenshots, and post-trade notes." },
  { match: "/analytics", title: "Analytics", subtitle: "Win rate, profit factor, R-multiples, and equity curve across accounts." },
  { match: "/notes", title: "Notes", subtitle: "Mistakes, rule breaks, and lessons tied back to behavior—not only P&L." },
  { match: "/ai-insights", title: "AI Insights", subtitle: "Summaries and prompts that speed up review after a session." },
  { match: "/psychology", title: "Psychology", subtitle: "Mood and discipline trends: the bridge between mindset and outcomes." },
  { match: "/risk", title: "Risk Analysis", subtitle: "Exposure, drawdown, and whether sizing matched the plan." },
  { match: "/strategy-edge", title: "Strategy Edge", subtitle: "Which setups, pairs, and sessions actually pay for the spread." },
  { match: "/accounts", title: "Accounts", subtitle: "Demo vs live and per-broker balances feeding the same journal." },
  { match: "/margin-calculator", title: "Margin Calculator", subtitle: "Lot size, leverage, pair, and equity — see margin used % before you trade." },
  { match: "/risk-calculator", title: "Risk Calculator", subtitle: "Lots, stop distance, and risk per trade before you click buy or sell." },
  { match: "/playbook", title: "Playbook", subtitle: "Written rules so execution stays consistent when volatility spikes." },
  { match: "/goals", title: "Goals", subtitle: "Monthly or weekly targets you can measure without moving the goalposts." },
  { match: "/reports", title: "Reports", subtitle: "Coach-ready exports: performance, habits, and risk in one narrative." },
  { match: "/calendar", title: "Calendar", subtitle: "Catalysts and sessions so entries line up with what moved the market." },
  { match: "/backtester", title: "Backtesting Removed", subtitle: "Backtesting has been removed. Use Crypto Charts instead." },
  { match: "/backtests", title: "Backtesting Removed", subtitle: "Backtesting has been removed. Use Crypto Charts instead." },
  { match: "/crypto-charts", title: "Crypto Charts", subtitle: "Live charts when you want price context beside journal entries." },
  { match: "/templates", title: "Templates", subtitle: "Reuse checklists and fields so logging never feels like busywork." },
  { match: "/pdf-export", title: "PDF Export", subtitle: "Archive months of journaling or share a clean PDF with a mentor." },
  { match: "/", title: "Dashboard", subtitle: "Balances, streaks, and today’s context before you open the ticket log." },
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
  const { theme, toggleTheme } = useTheme();
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
              <span className="surface-pill text-[11px] font-semibold uppercase tracking-[0.24em] px-2.5 py-1 text-primary/90 shadow-sm">
                MyTradebook
              </span>
              {!isMobile && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                  <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" />
                  FX journal workspace
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-2xl border-border bg-card text-foreground shadow-sm"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            data-testid="button-theme-toggle-header"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
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
        <>
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
          <PostTradeReviewHost />
        </>
      </AccountProvider>
    </TimezoneProvider>
  );
}

function PostTradeReviewHost() {
  const { trade, open, clear } = usePostTradeReview();
  return <PostTradeReviewDialog trade={trade} open={open} onClose={clear} />;
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
