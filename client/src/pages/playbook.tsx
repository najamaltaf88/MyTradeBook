import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  BookOpen,
  Plus,
  Trash2,
  Shield,
  Target,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { insertPlaybookRuleSchema } from "@shared/schema";
import type { PlaybookRule } from "@shared/schema";
import { z } from "zod";

const CATEGORIES = [
  { value: "entry", label: "Entry Rules", icon: Target, color: "text-emerald-500 bg-emerald-500/10" },
  { value: "exit", label: "Exit Rules", icon: Shield, color: "text-blue-500 bg-blue-500/10" },
  { value: "risk", label: "Risk Management", icon: AlertTriangle, color: "text-amber-500 bg-amber-500/10" },
  { value: "psychology", label: "Psychology / Mindset", icon: Brain, color: "text-purple-500 bg-purple-500/10" },
  { value: "routine", label: "Daily Routine", icon: CheckCircle2, color: "text-cyan-500 bg-cyan-500/10" },
];

const playbookFormSchema = insertPlaybookRuleSchema.extend({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
});

function AddRuleForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();

  const form = useForm<z.infer<typeof playbookFormSchema>>({
    resolver: zodResolver(playbookFormSchema),
    defaultValues: {
      category: "entry",
      title: "",
      description: "",
      isActive: true,
      sortOrder: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof playbookFormSchema>) => {
      const res = await apiRequest("POST", "/api/playbook", { ...data, description: data.description || null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbook"] });
      toast({ title: "Rule added", description: "New playbook rule created." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-3">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger data-testid="select-rule-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      placeholder="Rule title (e.g., 'Only trade with the trend on H4')"
                      {...field}
                      data-testid="input-rule-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Description or details (optional)"
                      {...field}
                      value={field.value || ""}
                      rows={2}
                      data-testid="input-rule-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={createMutation.isPending}
                data-testid="button-save-rule"
              >
                {createMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                Add Rule
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onClose} data-testid="button-cancel-rule">
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RuleCard({ rule }: { rule: PlaybookRule }) {
  const { toast } = useToast();
  const cat = CATEGORIES.find((c) => c.value === rule.category);
  const Icon = cat?.icon || Target;

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/playbook/${rule.id}`, { isActive: !rule.isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbook"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/playbook/${rule.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbook"] });
      toast({ title: "Rule deleted" });
    },
  });

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-opacity",
        !rule.isActive && "opacity-50"
      )}
      data-testid={`rule-card-${rule.id}`}
    >
      <div className={cn("flex items-center justify-center w-8 h-8 rounded-md shrink-0", cat?.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", !rule.isActive && "line-through")}>{rule.title}</p>
        {rule.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={rule.isActive ?? true}
          onCheckedChange={() => toggleMutation.mutate()}
          data-testid={`switch-rule-${rule.id}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => deleteMutation.mutate()}
          data-testid={`button-delete-rule-${rule.id}`}
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function PlaybookPage() {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: rules, isLoading, isError } = useQuery<PlaybookRule[]>({
    queryKey: ["/api/playbook"],
  });

  const rulesByCategory = CATEGORIES.map((cat) => ({
    ...cat,
    rules: (rules || []).filter((r) => r.category === cat.value),
  }));

  const activeCount = (rules || []).filter((r) => r.isActive).length;
  const totalCount = (rules || []).length;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-playbook">
      <div className="flex items-center justify-between gap-4 flex-wrap page-fade-in">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trading Playbook</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define your trading rules, setups, and routines
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} disabled={showAddForm} data-testid="button-add-rule">
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {showAddForm && <AddRuleForm onClose={() => setShowAddForm(false)} />}

      {totalCount > 0 && (
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-xs">
            {activeCount} active / {totalCount} total
          </Badge>
        </div>
      )}

      {isError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-medium">Failed to load playbook rules</p>
            <p className="text-xs text-muted-foreground mt-1">Please try refreshing the page</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : totalCount === 0 && !showAddForm ? (
        <Card className="page-fade-in stagger-1">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Build Your Playbook</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-2">
              A trading playbook helps you stay disciplined. Add your entry rules, exit strategies, risk management rules, and daily routines.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <div key={cat.value} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className="w-3 h-3" />
                    <span>{cat.label}</span>
                  </div>
                );
              })}
            </div>
            <Button onClick={() => setShowAddForm(true)} data-testid="button-start-playbook">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {rulesByCategory.filter((cat) => cat.rules.length > 0).map((cat, idx) => {
            const Icon = cat.icon;
            const descriptions: Record<string, string> = {
              entry: "Rules that define when and how you enter trades",
              exit: "Rules for taking profit and cutting losses",
              risk: "Position sizing, max drawdown, and exposure limits",
              psychology: "Mental frameworks and emotional discipline guidelines",
              routine: "Pre-market, during session, and post-market habits",
            };
            return (
              <Card key={cat.value} className={cn("page-fade-in", `stagger-${Math.min(idx + 1, 6)}`)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {cat.label}
                    <Badge variant="outline" className="text-[10px] ml-auto">{cat.rules.length}</Badge>
                  </CardTitle>
                  {descriptions[cat.value] && (
                    <p className="text-xs text-muted-foreground">{descriptions[cat.value]}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {cat.rules.map((rule) => (
                    <RuleCard key={rule.id} rule={rule} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalCount > 0 && (
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>Pro Tip:</strong> Review your playbook before every trading session. Toggle off rules you want to temporarily pause. The most profitable traders are the most disciplined ones - follow your rules consistently and track your adherence.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
