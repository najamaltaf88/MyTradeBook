import {
  TrendingUp,
  BarChart3,
  Shield,
  BookOpen,
  Zap,
  Target,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export default function LandingPage() {
  const { canInstall, install, isInstalled } = usePwaInstall();

  return (
    <div className="min-h-full bg-background flex flex-col">
      <nav className="fixed top-0 z-50 w-full border-b bg-background">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <TrendingUp className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">MyTradebook</span>
          </div>
          {canInstall && (
            <Button
              variant="outline"
              onClick={() => void install()}
              data-testid="button-install-desktop-nav"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Install App
            </Button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-16">
        <div className="max-w-4xl mx-auto text-center space-y-8 page-fade-in">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight font-serif">
              Your Trading, <span className="text-primary">Perfected</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The automatic Forex trading journal that connects to your MT5 account. Track every
              trade, analyze your performance, and grow as a trader.
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button size="lg" className="text-base px-8" asChild data-testid="button-open-app">
              <a href="/login">Open App</a>
            </Button>
            {canInstall && (
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8"
                onClick={() => void install()}
                data-testid="button-install-desktop-main"
              >
                <Download className="w-4 h-4 mr-2" />
                Install on Desktop
              </Button>
            )}
            {!canInstall && isInstalled && (
              <Button size="lg" variant="outline" disabled>
                Installed
              </Button>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Read-only MT5 access
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Automatic sync
            </span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 page-fade-in stagger-2">
          <div
            className="p-6 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
            data-testid="feature-analytics"
          >
            <BarChart3 className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-semibold mb-2">Deep Analytics</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Win rate, profit factor, drawdown, session analysis, hourly heatmaps, and symbol
              breakdowns, all from your real trades.
            </p>
          </div>
          <div
            className="p-6 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
            data-testid="feature-journal"
          >
            <BookOpen className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-semibold mb-2">Trade Journal</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Document your reason, logic, and emotions for every trade. Upload screenshots and
              track your psychology over time.
            </p>
          </div>
          <div
            className="p-6 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
            data-testid="feature-goals"
          >
            <Target className="w-8 h-8 text-primary mb-4" />
            <h3 className="font-semibold mb-2">Goals & Reports</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Set monthly targets, build your trading playbook, and generate downloadable
              performance reports with professional suggestions.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} MyTradebook. All rights reserved.</p>
      </footer>
    </div>
  );
}
