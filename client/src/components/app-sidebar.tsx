import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Wallet,
  Sun,
  Moon,
  TrendingUp,
  Download,
  Calculator,
  ClipboardList,
  Trophy,
  FileText,
  Newspaper,
  Brain,
  Globe,
  Zap,
  Bell,
  Grid3x3,
  CheckSquare,
  LineChart,
  MessageCircle,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useTimezone, TIMEZONE_OPTIONS } from "@/hooks/use-timezone";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/lib/supabase";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Trade Journal", url: "/trades", icon: BookOpen },
  { title: "Notes", url: "/notes", icon: MessageCircle },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "AI Insights", url: "/ai-insights", icon: Brain },
  { title: "Psychology", url: "/psychology", icon: Brain },
  { title: "Risk Analysis", url: "/risk", icon: TrendingUp },
  { title: "Strategy Edge", url: "/strategy-edge", icon: Zap },
  { title: "Calendar", url: "/calendar", icon: Newspaper },
  { title: "Accounts", url: "/accounts", icon: Wallet },
];

const toolsItems = [
  { title: "Risk Calculator", url: "/risk-calculator", icon: Calculator },
  { title: "Crypto Charts", url: "/crypto-charts", icon: LineChart },
  { title: "Playbook", url: "/playbook", icon: ClipboardList },
  { title: "Goals", url: "/goals", icon: Trophy },
  { title: "Reports", url: "/reports", icon: FileText },
];

const professionalsItems = [
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Compliance", url: "/compliance", icon: CheckSquare },
  { title: "Heatmaps", url: "/heatmaps", icon: Grid3x3 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { timezone, setTimezone } = useTimezone();
  const { canInstall, install } = usePwaInstall();

  return (
    <Sidebar className="border-r-0 bg-transparent">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <Link href="/">
          <div className="flex cursor-pointer items-center gap-3" data-testid="link-home">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] shadow-[0_16px_40px_rgba(14,165,233,0.26)]">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="mb-1 inline-flex items-center rounded-full border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground">
                Trading OS
              </div>
              <h1 className="text-base font-semibold tracking-tight text-sidebar-foreground">MyTradebook</h1>
              <p className="text-[11px] leading-none text-sidebar-foreground/70">Sharper journaling. Cleaner review loops.</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">Trading Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-sidebar-foreground/60">Professional Features</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {professionalsItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="space-y-3 border-t border-sidebar-border px-4 py-4">
        <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent p-3 shadow-[0_16px_38px_rgba(2,6,23,0.18)]">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Globe className="h-4 w-4 shrink-0 text-sidebar-foreground/80" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/80">Workspace Timezone</span>
          </div>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="h-10 border-sidebar-border bg-sidebar text-[11px] text-sidebar-foreground" data-testid="select-timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value} className="text-xs">
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="glass"
          onClick={toggleTheme}
          className="w-full justify-start gap-2 text-sidebar-foreground"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </Button>
        <Button
          size="sm"
          variant="glass"
          onClick={() => void supabase.auth.signOut()}
          className="w-full justify-start gap-2 text-sidebar-foreground"
          data-testid="button-sign-out"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </Button>
        {canInstall && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void install()}
            className="w-full justify-start gap-2 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent"
            data-testid="button-install-desktop-sidebar"
          >
            <Download className="w-4 h-4" />
            <span>Install App</span>
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
