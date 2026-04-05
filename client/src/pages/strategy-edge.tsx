import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, buildAuthHeaders, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Brain,
  Camera,
  ClipboardPaste,
  Edit3,
  ImageOff,
  NotebookPen,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { extractClipboardImageFile, readClipboardImage } from "@/lib/clipboard-images";

interface StrategyStatistics {
  strategy: string;
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;
  totalProfit: number;
  maxProfit: number;
  maxLoss: number;
  edge: number;
  edgeConfidence: number;
  sampleSize: number;
  bestSession: string;
  bestSessionWinRate: number;
  worstSession: string;
  worstSessionWinRate: number;
  avgDuration: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  recommendation: "STOP" | "REDUCE" | "NEUTRAL" | "INCREASE" | "EXPAND";
  rationale: string;
}

interface StrategyEdgeReport {
  totalTrades: number;
  strategies: Map<string, StrategyStatistics>;
  strategiesList: StrategyStatistics[];
  bestStrategy: StrategyStatistics | null;
  worstStrategy: StrategyStatistics | null;
  summary: string;
}

interface StrategyConceptNote {
  id: string;
  userId: string;
  accountId?: string | null;
  strategy: string;
  title: string;
  concept: string;
  lesson?: string | null;
  checklist?: string | null;
  mistakesToAvoid?: string | null;
  imageUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

type ConceptDraft = {
  strategy: string;
  title: string;
  concept: string;
  lesson: string;
  checklist: string;
  mistakesToAvoid: string;
};

const EMPTY_CONCEPT_DRAFT: ConceptDraft = {
  strategy: "",
  title: "",
  concept: "",
  lesson: "",
  checklist: "",
  mistakesToAvoid: "",
};

const CONCEPT_PROMPTS = [
  "Define the exact market structure before entry.",
  "Write the trigger candle or confirmation that makes the setup valid.",
  "State the invalidation and how the stop should be managed.",
  "Add one picture so future review is visual, not only text.",
];

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json() as { message?: string; error?: string };
      return payload.message || payload.error || fallback;
    }
    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function getRecommendationColor(rec: string): string {
  switch (rec) {
    case "EXPAND":
      return "bg-green-100 text-green-800 dark:bg-green-950/35 dark:text-green-300";
    case "INCREASE":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/35 dark:text-blue-300";
    case "NEUTRAL":
      return "bg-muted text-muted-foreground";
    case "REDUCE":
      return "bg-orange-100 text-orange-800 dark:bg-orange-950/35 dark:text-orange-300";
    case "STOP":
      return "bg-red-100 text-red-800 dark:bg-red-950/35 dark:text-red-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return "INF";
  return value.toFixed(2);
}

function conceptDraftFromNote(note: StrategyConceptNote): ConceptDraft {
  return {
    strategy: note.strategy || "",
    title: note.title || "",
    concept: note.concept || "",
    lesson: note.lesson || "",
    checklist: note.checklist || "",
    mistakesToAvoid: note.mistakesToAvoid || "",
  };
}

function StrategyCard({ strategy }: { strategy: StrategyStatistics }) {
  return (
    <Card className={`border-l-4 ${strategy.recommendation === "STOP" ? "border-l-red-500" : strategy.recommendation === "EXPAND" ? "border-l-green-500" : "border-l-blue-500"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-lg">{strategy.strategy || "Unspecified"}</CardTitle>
            <CardDescription>{strategy.closedTrades} closed trades</CardDescription>
          </div>
          <Badge className={getRecommendationColor(strategy.recommendation)}>{strategy.recommendation}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className={`font-bold ${strategy.winRate > 0.5 ? "text-green-600" : "text-red-600"}`}>{(strategy.winRate * 100).toFixed(0)}%</p>
          </div>
          <div className="rounded-2xl bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className={`font-bold ${strategy.profitFactor > 1.5 ? "text-green-600" : strategy.profitFactor > 1 ? "text-blue-600" : "text-red-600"}`}>
              {formatRatio(strategy.profitFactor)}
            </p>
          </div>
          <div className="rounded-2xl bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">Expectancy</p>
            <p className={`font-bold ${strategy.expectancy > 0 ? "text-green-600" : "text-red-600"}`}>${strategy.expectancy.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl bg-muted/35 p-3">
            <p className={`font-bold ${strategy.totalProfit > 0 ? "text-green-600" : "text-red-600"}`}>${strategy.totalProfit.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Profit</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Edge Confidence</p>
            <p className="text-sm text-muted-foreground">{strategy.edgeConfidence.toFixed(0)}%</p>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full ${strategy.edgeConfidence > 80 ? "bg-green-600" : strategy.edgeConfidence > 50 ? "bg-yellow-600" : "bg-red-600"}`}
              style={{ width: `${strategy.edgeConfidence}%` }}
            />
          </div>
          {strategy.sampleSize > 0 && <p className="text-xs text-muted-foreground">Need {strategy.sampleSize} more trades for statistical significance</p>}
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Wins / Losses</p>
            <p className="font-semibold">{strategy.wins} / {strategy.losses}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Win / Loss</p>
            <p className="font-semibold">${strategy.avgWin.toFixed(2)} / ${Math.abs(strategy.avgLoss).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payoff Ratio</p>
            <p className="font-semibold">{formatRatio(strategy.payoffRatio)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Best / Worst Trade</p>
            <p className="font-semibold">${strategy.maxProfit.toFixed(2)} / ${strategy.maxLoss.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Consecutive W/L</p>
            <p className="font-semibold">{strategy.maxConsecutiveWins}W / {strategy.maxConsecutiveLosses}L</p>
          </div>
          <div>
            <p className="text-muted-foreground">Best / Worst Session</p>
            <p className="text-xs font-semibold">
              {strategy.bestSession} ({(strategy.bestSessionWinRate * 100).toFixed(0)}%) / {strategy.worstSession} ({(strategy.worstSessionWinRate * 100).toFixed(0)}%)
            </p>
          </div>
        </div>
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20">
          <AlertDescription className="text-blue-900 dark:text-blue-200">
            <strong>Action:</strong> {strategy.rationale}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export default function StrategyEdgePage() {
  const { selectedAccount, accounts } = useAccount();
  const { toast } = useToast();
  const accountId = selectedAccount?.id;
  const accountName = selectedAccount?.name || "All Accounts";

  const [draft, setDraft] = useState<ConceptDraft>(EMPTY_CONCEPT_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [clipboardPending, setClipboardPending] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<StrategyConceptNote | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: report, isLoading, error } = useQuery<StrategyEdgeReport>({
    queryKey: ["strategyEdge", accountId || "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      const url = params.size > 0 ? `/api/ai/strategy-edge?${params.toString()}` : "/api/ai/strategy-edge";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch strategy analysis");
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("Unexpected response from server");
      }
      return response.json();
    },
    enabled: accounts.length > 0,
  });

  const { data: conceptNotes = [] } = useQuery<StrategyConceptNote[]>({
    queryKey: ["/api/strategy-edge/concepts", accountId || "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      const suffix = params.toString();
      const response = await fetch(`/api/strategy-edge/concepts${suffix ? `?${suffix}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load strategy concept notes");
      }
      return response.json() as Promise<StrategyConceptNote[]>;
    },
  });

  const openConcept = (note: StrategyConceptNote) => {
    setSelectedConcept(note);
  };

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const isDraftValid = useMemo(() => {
    return Boolean(draft.strategy.trim() && draft.title.trim() && draft.concept.trim());
  }, [draft]);

  const resetDraft = () => {
    setDraft(EMPTY_CONCEPT_DRAFT);
    setEditingId(null);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const applyConceptImage = (file: File, source: "upload" | "paste" = "upload") => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported file", description: "Only image files can be attached.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please keep chart images under 10MB.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    toast({ title: source === "paste" ? "Chart pasted" : "Chart attached" });
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = extractClipboardImageFile(event.clipboardData, "strategy-concept");
      if (!file) return;
      event.preventDefault();
      applyConceptImage(file, "paste");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleClipboardRead = async () => {
    try {
      setClipboardPending(true);
      const file = await readClipboardImage("strategy-concept");
      if (!file) {
        toast({
          title: "No image found",
          description: "Copy a screenshot first, then paste it into the concept notebook.",
          variant: "destructive",
        });
        return;
      }
      applyConceptImage(file, "paste");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard access failed";
      toast({ title: "Clipboard unavailable", description: message, variant: "destructive" });
    } finally {
      setClipboardPending(false);
    }
  };

  const saveConcept = useMutation({
    mutationFn: async () => {
      const payload = {
        accountId: accountId ?? null,
        strategy: draft.strategy.trim(),
        title: draft.title.trim(),
        concept: draft.concept.trim(),
        lesson: draft.lesson.trim() || null,
        checklist: draft.checklist.trim() || null,
        mistakesToAvoid: draft.mistakesToAvoid.trim() || null,
      };

      const conceptResponse = editingId
        ? await apiRequest("PATCH", `/api/strategy-edge/concepts/${editingId}`, payload)
        : await apiRequest("POST", "/api/strategy-edge/concepts", payload);
      let saved = await conceptResponse.json() as StrategyConceptNote;

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        const authHeaders = await buildAuthHeaders();
        const uploadResponse = await fetch(`/api/strategy-edge/concepts/${saved.id}/image`, {
          method: "POST",
          credentials: "include",
          headers: {
            ...authHeaders,
            "X-Mytradebook-Request": "1",
          },
          body: formData,
        });
        if (!uploadResponse.ok) {
          throw new Error(await readErrorMessage(uploadResponse, "Failed to upload concept image"));
        }
        saved = await uploadResponse.json() as StrategyConceptNote;
      }

      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-edge/concepts"] });
      toast({ title: editingId ? "Strategy concept updated" : "Strategy concept saved" });
      resetDraft();
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save strategy concept", description: error.message, variant: "destructive" });
    },
  });

  const deleteConcept = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/strategy-edge/concepts/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-edge/concepts"] });
      toast({ title: "Strategy concept deleted" });
      if (editingId) {
        resetDraft();
      }
    },
    onError: (error: Error) => {
      toast({ title: "Unable to delete strategy concept", description: error.message, variant: "destructive" });
    },
  });

  const removeConceptImage = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/strategy-edge/concepts/${id}/image`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-edge/concepts"] });
      toast({ title: "Concept image removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to remove concept image", description: error.message, variant: "destructive" });
    },
  });

  if (accounts.length === 0) {
    return (
      <Alert className="m-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Account Found</AlertTitle>
        <AlertDescription>Add an account first to run strategy edge analysis and save concept notes.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Analyzing trading strategies...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <Alert variant="destructive" className="m-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analysis Failed</AlertTitle>
        <AlertDescription>Unable to load strategy analysis. Try again later.</AlertDescription>
      </Alert>
    );
  }

  const { strategiesList, bestStrategy, worstStrategy, summary } = report;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card className="hero-panel overflow-hidden shadow-xl">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.4fr,0.8fr] md:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Strategy Edge</Badge>
              <Badge variant="outline">Scope {accountName}</Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Build a reusable strategy playbook</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Review which tagged setups have edge, then store your best concepts with pictures so this page becomes a real learning library instead of a one-time report.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tagged strategies</div>
              <div className="mt-2 text-3xl font-semibold">{strategiesList.length}</div>
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Saved concept notes</div>
              <div className="mt-2 text-3xl font-semibold">{conceptNotes.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.9fr]">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Strategy Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription className="font-medium">{summary}</AlertDescription>
            </Alert>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Best current edge</div>
                <div className="mt-2 text-lg font-semibold">{bestStrategy?.strategy || "No clear leader yet"}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {bestStrategy ? `${formatRatio(bestStrategy.profitFactor)} PF and ${(bestStrategy.winRate * 100).toFixed(0)}% win rate.` : "Keep tagging trades by setup in the trade journal."}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Weakest current edge</div>
                <div className="mt-2 text-lg font-semibold">{worstStrategy?.strategy || "No weak setup isolated yet"}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {worstStrategy && worstStrategy.expectancy < 0 ? worstStrategy.rationale : "Use concept notes below to document what must be true before you trade a setup again."}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Concept Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {CONCEPT_PROMPTS.map((prompt) => (
              <div key={prompt} className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                {prompt}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr,1.2fr]">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotebookPen className="h-5 w-5" />
              Strategy Concept Notebook
            </CardTitle>
            <CardDescription>
              Save a setup definition, management rule, lesson, and a chart image so your best ideas stay reviewable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="concept-strategy">Strategy Name</Label>
                <Input
                  id="concept-strategy"
                  value={draft.strategy}
                  onChange={(event) => setDraft((prev) => ({ ...prev, strategy: event.target.value }))}
                  placeholder="London breakout, BOS retest, NY reversal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="concept-title">Concept Title</Label>
                <Input
                  id="concept-title"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Entry checklist before the first scale-in"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="concept-detail">Concept</Label>
              <Textarea
                id="concept-detail"
                value={draft.concept}
                onChange={(event) => setDraft((prev) => ({ ...prev, concept: event.target.value }))}
                placeholder="Describe the structure, trigger, invalidation, and how the trade should breathe."
                className="min-h-[120px]"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="concept-lesson">Lesson To Remember</Label>
                <Textarea
                  id="concept-lesson"
                  value={draft.lesson}
                  onChange={(event) => setDraft((prev) => ({ ...prev, lesson: event.target.value }))}
                  placeholder="What made this setup clean or what saved you from a bad trade."
                  className="min-h-[110px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="concept-mistakes">Mistakes To Avoid</Label>
                <Textarea
                  id="concept-mistakes"
                  value={draft.mistakesToAvoid}
                  onChange={(event) => setDraft((prev) => ({ ...prev, mistakesToAvoid: event.target.value }))}
                  placeholder="Late entries, no retest, entering before session expansion, moving stop too early."
                  className="min-h-[110px]"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="concept-checklist">Checklist / Management Plan</Label>
              <Textarea
                id="concept-checklist"
                value={draft.checklist}
                onChange={(event) => setDraft((prev) => ({ ...prev, checklist: event.target.value }))}
                placeholder="1. Confirm structure. 2. Wait for trigger close. 3. Set invalidation. 4. Scale at target or trail."
                className="min-h-[110px]"
              />
            </div>
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Camera className="h-4 w-4" />
                  Add chart picture
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Camera className="mr-2 h-3.5 w-3.5" />
                    Upload file
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleClipboardRead}
                    disabled={clipboardPending}
                  >
                    <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                    {clipboardPending ? "Checking clipboard..." : "Paste screenshot"}
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  if (nextFile) applyConceptImage(nextFile);
                  event.target.value = "";
                }}
              />
              {imagePreviewUrl ? (
                <div className="space-y-2">
                  <img src={imagePreviewUrl} alt="Concept preview" className="max-h-56 w-full rounded-2xl border object-cover" />
                  <p className="text-[11px] text-muted-foreground">
                    Press `Ctrl+V` while you are on this page to replace the image directly from your clipboard.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  Upload one chart image or paste a copied screenshot to make the concept visual during review.
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveConcept.mutate()} disabled={!isDraftValid || saveConcept.isPending}>
                {editingId ? "Update Concept" : "Save Concept"}
              </Button>
              <Button variant="outline" onClick={resetDraft} disabled={saveConcept.isPending}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Saved Concepts
            </CardTitle>
            <CardDescription>
              {accountId ? "This list includes the current account plus global concepts." : "Your full concept library across all accounts."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {conceptNotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                No concept notes saved yet. Add a setup with a chart image so Strategy Edge becomes a real study page.
              </div>
            ) : (
              <div className="grid gap-2">
                {conceptNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openConcept(note)}
                  className="w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-left text-sm transition hover:border-primary/40"
                >
                  <div className="font-semibold">{note.strategy?.trim() || "Unspecified"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{note.title?.trim() || "Untitled concept"}</div>
                </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(selectedConcept)}
        onOpenChange={(open) => {
          if (!open) setSelectedConcept(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedConcept?.strategy || "Strategy Concept"}</DialogTitle>
          </DialogHeader>
          {selectedConcept ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{selectedConcept.title}</div>
              <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-medium text-foreground">Concept</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{selectedConcept.concept}</div>
                  </div>
                  {selectedConcept.lesson ? (
                    <div>
                      <div className="font-medium text-foreground">Lesson</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{selectedConcept.lesson}</div>
                    </div>
                  ) : null}
                  {selectedConcept.checklist ? (
                    <div>
                      <div className="font-medium text-foreground">Checklist</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{selectedConcept.checklist}</div>
                    </div>
                  ) : null}
                  {selectedConcept.mistakesToAvoid ? (
                    <div>
                      <div className="font-medium text-foreground">Mistakes To Avoid</div>
                      <div className="whitespace-pre-wrap text-muted-foreground">{selectedConcept.mistakesToAvoid}</div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {selectedConcept.imageUrl ? (
                    <div className="space-y-2">
                      <img
                        src={selectedConcept.imageUrl}
                        alt={selectedConcept.title}
                        className="max-h-80 w-full rounded-2xl border object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeConceptImage.mutate(selectedConcept.id)}
                        disabled={removeConceptImage.isPending}
                      >
                        <ImageOff className="mr-2 h-4 w-4" />
                        Remove Image
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                      This concept has no chart image yet. Edit it and upload one.
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingId(selectedConcept.id);
                      setDraft(conceptDraftFromNote(selectedConcept));
                      setImageFile(null);
                      setImagePreviewUrl(null);
                      setSelectedConcept(null);
                    }}
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      deleteConcept.mutate(selectedConcept.id);
                      setSelectedConcept(null);
                    }}
                    disabled={deleteConcept.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setSelectedConcept(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {bestStrategy || worstStrategy ? (
        <div className="grid gap-6 md:grid-cols-2">
          {bestStrategy && (
            <Card className="border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20">
              <CardHeader>
                <CardTitle className="text-green-900 dark:text-green-200">Best Strategy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-lg font-bold text-green-700 dark:text-green-300">{bestStrategy.strategy || "Unspecified"}</p>
                <p>Edge: <span className="font-semibold text-green-600">${bestStrategy.edge.toFixed(2)}/trade</span></p>
                <p>Expectancy: <span className="font-semibold">${bestStrategy.expectancy.toFixed(2)}</span></p>
                <p>Profit Factor: <span className="font-semibold">{formatRatio(bestStrategy.profitFactor)}</span></p>
                <p>Recommendation: <Badge className={getRecommendationColor(bestStrategy.recommendation)}>{bestStrategy.recommendation}</Badge></p>
              </CardContent>
            </Card>
          )}
          {worstStrategy && worstStrategy.expectancy < 0 && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="text-red-900 dark:text-red-200">Losing Strategy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-lg font-bold text-red-700 dark:text-red-300">{worstStrategy.strategy || "Unspecified"}</p>
                <p>Edge: <span className="font-semibold text-red-600">${worstStrategy.edge.toFixed(2)}/trade</span></p>
                <p>Expectancy: <span className="font-semibold text-red-600">${worstStrategy.expectancy.toFixed(2)}</span></p>
                <p>Profit Factor: <span className="font-semibold">{formatRatio(worstStrategy.profitFactor)}</span></p>
                <p>Recommendation: <Badge className={getRecommendationColor(worstStrategy.recommendation)}>{worstStrategy.recommendation}</Badge></p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {strategiesList.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Strategies Tagged</AlertTitle>
          <AlertDescription>Tag your trades with strategy names in the trade journal Logic field to enable edge detection and analysis.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">All Strategies</h2>
          {strategiesList.map((strategy) => (
            <StrategyCard key={strategy.strategy} strategy={strategy} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Action Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertDescription>
              <strong>EXPAND (Green):</strong> Proven edge with high confidence. Increase trade size or frequency.
            </AlertDescription>
          </Alert>
          <Alert>
            <AlertDescription>
              <strong>INCREASE (Blue):</strong> Positive expectancy but needs more data. Continue trading cautiously while accumulating samples.
            </AlertDescription>
          </Alert>
          <Alert>
            <AlertDescription>
              <strong>NEUTRAL (Gray):</strong> Breakeven or insufficient data. Collect more trades before deciding.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertDescription>
              <strong>REDUCE (Orange):</strong> Low profitability or negative expectancy. Reduce size or halt trading until edge is proven.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertDescription>
              <strong>STOP (Red):</strong> Losing money consistently. Disable strategy completely and analyze what went wrong.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
