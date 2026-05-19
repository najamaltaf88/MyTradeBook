import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency, getProfitColor, cn } from "@/lib/utils";
import { getTradeNetPnl } from "@shared/trade-utils";
import type { PlaybookRule, Trade } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Shield } from "lucide-react";

const CORE_CHECKS = [
  { key: "followedPlan", label: "I followed my written trading plan / setup criteria" },
  { key: "slBeforeEntry", label: "Stop loss was defined before entry (or valid reason not to)" },
  { key: "riskWithinLimits", label: "Position size was within my risk limits" },
  { key: "exitPerPlan", label: "Exit matched my plan (TP, SL, or management rule)" },
  { key: "emotionControlled", label: "Emotions were controlled — no tilt or euphoria" },
  { key: "noRevengeOrFomo", label: "This was not revenge trading or FOMO" },
] as const;

type CoreKey = (typeof CORE_CHECKS)[number]["key"];

type CoreChecksState = Record<CoreKey, boolean>;

const defaultCore: CoreChecksState = {
  followedPlan: false,
  slBeforeEntry: false,
  riskWithinLimits: false,
  exitPerPlan: false,
  emotionControlled: false,
  noRevengeOrFomo: false,
};

export function PostTradeReviewDialog({
  trade,
  open,
  onClose,
}: {
  trade: Trade | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [core, setCore] = useState<CoreChecksState>(defaultCore);
  const [ruleFollowed, setRuleFollowed] = useState<Record<string, boolean>>({});
  const [lesson, setLesson] = useState("");

  const { data: rules = [] } = useQuery<PlaybookRule[]>({
    queryKey: ["/api/playbook"],
    enabled: open,
  });

  const activeRules = useMemo(
    () => rules.filter((r) => r.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rules],
  );

  useEffect(() => {
    if (!open) return;
    setCore(defaultCore);
    setLesson("");
    const initial: Record<string, boolean> = {};
    for (const rule of activeRules) {
      initial[rule.id] = false;
    }
    setRuleFollowed(initial);
  }, [open, trade?.id, activeRules.length]);

  const submitReview = useMutation({
    mutationFn: async () => {
      if (!trade) throw new Error("No trade");
      const res = await apiRequest("POST", `/api/trades/${trade.id}/review`, {
        coreChecks: core,
        playbookRules: activeRules.map((rule) => ({
          ruleId: rule.id,
          followed: Boolean(ruleFollowed[rule.id]),
        })),
        lesson: lesson.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/compliance/score"] });
      toast({ title: "Review saved", description: "Playbook compliance logged for this trade." });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Could not save review", description: err.message, variant: "destructive" });
    },
  });

  const skipReview = useMutation({
    mutationFn: async () => {
      if (!trade) throw new Error("No trade");
      const res = await apiRequest("PATCH", `/api/trades/${trade.id}`, {
        reviewPending: false,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      onClose();
    },
  });

  if (!trade) return null;

  const net = getTradeNetPnl(trade);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Trade closed — rule check
          </DialogTitle>
          <DialogDescription>
            Log whether you followed your process. This builds your compliance score and keeps the journal honest.
          </DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <Badge variant="outline">{trade.symbol}</Badge>
            <Badge variant="outline">{trade.type}</Badge>
            <span className={cn("font-mono text-sm font-semibold", getProfitColor(net))}>
              {net >= 0 ? "+" : ""}
              {formatCurrency(net)}
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] px-6">
          <div className="space-y-5 pb-4">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Execution checklist
              </p>
              <div className="space-y-2.5">
                {CORE_CHECKS.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3"
                  >
                    <Checkbox
                      checked={core[item.key]}
                      onCheckedChange={(v) =>
                        setCore((prev) => ({ ...prev, [item.key]: v === true }))
                      }
                    />
                    <span className="text-sm leading-snug">{item.label}</span>
                  </label>
                ))}
              </div>
            </section>

            {activeRules.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Playbook rules
                </p>
                <div className="space-y-2">
                  {activeRules.map((rule) => (
                    <label
                      key={rule.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <Checkbox
                        checked={Boolean(ruleFollowed[rule.id])}
                        onCheckedChange={(v) =>
                          setRuleFollowed((prev) => ({ ...prev, [rule.id]: v === true }))
                        }
                      />
                      <span className="text-sm">
                        <span className="font-medium">{rule.title}</span>
                        {rule.description && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {rule.description}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section>
              <Label htmlFor="review-lesson" className="text-xs uppercase tracking-wide text-muted-foreground">
                One lesson (optional)
              </Label>
              <Textarea
                id="review-lesson"
                className="mt-2 min-h-[72px]"
                placeholder="What would you repeat or avoid next time?"
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
              />
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 border-t border-border p-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => skipReview.mutate()}
            disabled={submitReview.isPending || skipReview.isPending}
          >
            Skip for now
          </Button>
          <Button
            type="button"
            onClick={() => submitReview.mutate()}
            disabled={submitReview.isPending || skipReview.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Save review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
