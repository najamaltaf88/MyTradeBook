import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpenCheck,
  Brain,
  MessageCircle,
  NotebookPen,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAccount } from "@/hooks/use-account";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface DashboardReflection {
  userId: string;
  notes: string | null;
  lessons: string | null;
  mistakes: string | null;
  weaknesses: string | null;
  updatedAt?: string | null;
}

interface ReflectionSuggestion {
  title: string;
  detail: string;
  category: "discipline" | "execution" | "risk" | "mindset";
}

type ReflectionDraft = {
  notes: string;
  lessons: string;
  mistakes: string;
  weaknesses: string;
};

const DRAFT_STORAGE_KEY = "mytradebook.dashboard-reflection.draft";

const EMPTY_DRAFT: ReflectionDraft = {
  notes: "",
  lessons: "",
  mistakes: "",
  weaknesses: "",
};

function draftFromReflection(reflection?: DashboardReflection | null): ReflectionDraft {
  return {
    notes: reflection?.notes ?? "",
    lessons: reflection?.lessons ?? "",
    mistakes: reflection?.mistakes ?? "",
    weaknesses: reflection?.weaknesses ?? "",
  };
}

function readDraftBackup(): ReflectionDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReflectionDraft>;
    return {
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      lessons: typeof parsed.lessons === "string" ? parsed.lessons : "",
      mistakes: typeof parsed.mistakes === "string" ? parsed.mistakes : "",
      weaknesses: typeof parsed.weaknesses === "string" ? parsed.weaknesses : "",
    };
  } catch {
    return null;
  }
}

function persistDraftBackup(draft: ReflectionDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function clearDraftBackup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function payloadFromDraft(draft: ReflectionDraft) {
  return {
    notes: draft.notes.trim() || null,
    lessons: draft.lessons.trim() || null,
    mistakes: draft.mistakes.trim() || null,
    weaknesses: draft.weaknesses.trim() || null,
  };
}

function splitEntries(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function appendEntry(existing: string, entry: string) {
  const trimmed = entry.trim();
  if (!trimmed) return existing;
  return existing ? `${existing}\n${trimmed}` : trimmed;
}

function removeEntryAtIndex(existing: string, indexToRemove: number) {
  return splitEntries(existing)
    .filter((_, index) => index !== indexToRemove)
    .join("\n");
}

const CATEGORY_LABELS: Record<keyof ReflectionDraft, string> = {
  notes: "Session Notes",
  lessons: "Lessons To Repeat",
  mistakes: "Mistakes To Remove",
  weaknesses: "Weaknesses To Train Out",
};

function suggestionTone(category: ReflectionSuggestion["category"]): string {
  if (category === "risk") return "border-red-500/20 bg-red-500/5";
  if (category === "execution") return "border-blue-500/20 bg-blue-500/5";
  if (category === "discipline") return "border-amber-500/20 bg-amber-500/5";
  return "border-emerald-500/20 bg-emerald-500/5";
}

function suggestionIcon(category: ReflectionSuggestion["category"]) {
  if (category === "risk") return AlertTriangle;
  if (category === "execution") return Target;
  if (category === "discipline") return NotebookPen;
  return Brain;
}

const REFLECTION_PROMPTS = [
  "What market condition repeated today and how should you label it next time?",
  "Which rule protected capital, and which rule did you ignore?",
  "What made the best trade clean before entry?",
  "What weakness showed up twice and should become a checklist warning?",
];

export default function NotesPage() {
  const { selectedAccountId, selectedAccount } = useAccount();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ReflectionDraft>(EMPTY_DRAFT);
  const [entryDrafts, setEntryDrafts] = useState<ReflectionDraft>(EMPTY_DRAFT);
  const [serverDraft, setServerDraft] = useState<ReflectionDraft>(EMPTY_DRAFT);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<keyof ReflectionDraft | null>(null);

  const reflectionQuery = useQuery<DashboardReflection>({
    queryKey: ["/api/dashboard/reflection"],
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const { data: reflectionSuggestions } = useQuery<{ updatedAt: string; suggestions: ReflectionSuggestion[] }>({
    queryKey: ["/api/dashboard/reflection/suggestions", selectedAccountId ?? "__all__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) {
        params.set("accountId", selectedAccountId);
      }
      const query = params.toString();
      const response = await fetch(`/api/dashboard/reflection/suggestions${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load notes suggestions");
      }
      return response.json() as Promise<{ updatedAt: string; suggestions: ReflectionSuggestion[] }>;
    },
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const saveReflection = useMutation({
    mutationFn: async (payload: Partial<DashboardReflection>) => {
      const response = await apiRequest("PATCH", "/api/dashboard/reflection", payload);
      return response.json() as Promise<DashboardReflection>;
    },
    onSuccess: (updated) => {
      const nextDraft = draftFromReflection(updated);
      setServerDraft(nextDraft);
      setDraft(nextDraft);
      setSaveError(null);
      setLastSavedAt(updated.updatedAt ?? new Date().toISOString());
      clearDraftBackup();
      queryClient.setQueryData(["/api/dashboard/reflection"], updated);
      queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/reflection/suggestions"],
      });
    },
    onError: (error: Error) => {
      setSaveError(error.message);
      toast({ title: "Failed to save notes", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const nextServerDraft = draftFromReflection(reflectionQuery.data);
    setServerDraft(nextServerDraft);
    const backupDraft = readDraftBackup();
    setDraft(backupDraft ?? nextServerDraft);
    setHasHydrated(true);
  }, [
    reflectionQuery.data?.updatedAt,
    reflectionQuery.data?.notes,
    reflectionQuery.data?.lessons,
    reflectionQuery.data?.mistakes,
    reflectionQuery.data?.weaknesses,
  ]);

  useEffect(() => {
    if (reflectionQuery.data?.updatedAt) {
      setLastSavedAt(reflectionQuery.data.updatedAt);
    }
  }, [reflectionQuery.data?.updatedAt]);

  const dirty =
    draft.notes !== serverDraft.notes ||
    draft.lessons !== serverDraft.lessons ||
    draft.mistakes !== serverDraft.mistakes ||
    draft.weaknesses !== serverDraft.weaknesses;

  useEffect(() => {
    if (!hasHydrated) return;
    if (dirty) {
      persistDraftBackup(draft);
    } else {
      clearDraftBackup();
    }
  }, [draft, dirty, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || !dirty || !reflectionQuery.isFetched || saveReflection.isPending) {
      return;
    }
    const timer = window.setTimeout(() => {
      saveReflection.mutate(payloadFromDraft(draft));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, hasHydrated, reflectionQuery.isFetched, saveReflection]);

  const scopeLabel = selectedAccount?.name || "All Accounts";
  const savedLabel = useMemo(() => {
    if (saveReflection.isPending) return "Saving...";
    if (saveError) return "Saved locally - cloud sync failed";
    if (dirty) return "Draft stored locally until sync completes";
    if (lastSavedAt) {
      return `Saved ${new Date(lastSavedAt).toLocaleString()}`;
    }
    return "No saved reflection yet";
  }, [dirty, lastSavedAt, saveError, saveReflection.isPending]);

  const entries = useMemo(() => ({
    notes: splitEntries(draft.notes),
    lessons: splitEntries(draft.lessons),
    mistakes: splitEntries(draft.mistakes),
    weaknesses: splitEntries(draft.weaknesses),
  }), [draft]);

  const hasPendingEntries = useMemo(
    () => Object.values(entryDrafts).some((value) => value.trim()),
    [entryDrafts],
  );

  const handleAddEntry = (category: keyof ReflectionDraft) => {
    const nextEntry = entryDrafts[category].trim();
    if (!nextEntry) return;
    setDraft((prev) => ({
      ...prev,
      [category]: appendEntry(prev[category], nextEntry),
    }));
    setEntryDrafts((prev) => ({ ...prev, [category]: "" }));
  };

  const handleDeleteEntry = (category: keyof ReflectionDraft, indexToRemove: number) => {
    setDraft((prev) => ({
      ...prev,
      [category]: removeEntryAtIndex(prev[category], indexToRemove),
    }));
  };

  const flushPendingEntries = () => {
    const nextDraft: ReflectionDraft = {
      notes: appendEntry(draft.notes, entryDrafts.notes),
      lessons: appendEntry(draft.lessons, entryDrafts.lessons),
      mistakes: appendEntry(draft.mistakes, entryDrafts.mistakes),
      weaknesses: appendEntry(draft.weaknesses, entryDrafts.weaknesses),
    };
    if (
      nextDraft.notes !== draft.notes ||
      nextDraft.lessons !== draft.lessons ||
      nextDraft.mistakes !== draft.mistakes ||
      nextDraft.weaknesses !== draft.weaknesses
    ) {
      setDraft(nextDraft);
      setEntryDrafts(EMPTY_DRAFT);
    }
    return nextDraft;
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Card className="hero-panel overflow-hidden shadow-xl">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.5fr,0.9fr] md:p-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Reflection Workspace
              </Badge>
              <Badge variant="outline">
                Scope {scopeLabel}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Notes that actually stay saved</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Capture what the market did, what you learned, where discipline broke, and what the app should keep calling out until it improves.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="font-medium text-foreground">Auto-protected drafts</div>
                <div>Typing is backed up locally before sync finishes.</div>
              </div>
              <div className="rounded-2xl border border-border bg-card px-4 py-3">
                <div className="font-medium text-foreground">Adaptive coaching</div>
                <div>Suggestions react to reflection text plus closed-trade results.</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sync status</div>
              <div className="mt-2 text-lg font-semibold">{savedLabel}</div>
              {saveError ? (
                <div className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                  Cloud sync failed. Click Save Now to retry.
                </div>
              ) : null}
            </div>
            <div className="rounded-3xl border border-border bg-card p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Best use</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Write after each session, not only after losses. Repeated lessons become better prompts.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr,0.9fr]">
        <div className="space-y-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Reflection Workspace</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  The notes are global to your journal. Account selection only changes the coaching suggestions on the right.
                </p>
              </div>
              <Badge variant="outline">{savedLabel}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes-main" className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Session Notes
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCategory("notes")}
                      disabled={entries.notes.length === 0}
                    >
                      View all ({entries.notes.length})
                    </Button>
                  </div>
                  <Textarea
                    id="notes-main"
                    value={entryDrafts.notes}
                    onChange={(event) => setEntryDrafts((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Add a session note, then save it as a separate entry."
                    className="min-h-[120px] border-border/60 bg-background"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddEntry("notes")}
                      disabled={!entryDrafts.notes.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes-lessons" className="flex items-center gap-2">
                      <BookOpenCheck className="h-4 w-4" />
                      Lessons To Repeat
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCategory("lessons")}
                      disabled={entries.lessons.length === 0}
                    >
                      View all ({entries.lessons.length})
                    </Button>
                  </div>
                  <Textarea
                    id="notes-lessons"
                    value={entryDrafts.lessons}
                    onChange={(event) => setEntryDrafts((prev) => ({ ...prev, lessons: event.target.value }))}
                    placeholder="Add a lesson you want to repeat every week."
                    className="min-h-[120px] border-border/60 bg-background"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddEntry("lessons")}
                      disabled={!entryDrafts.lessons.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes-mistakes" className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Mistakes To Remove
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCategory("mistakes")}
                      disabled={entries.mistakes.length === 0}
                    >
                      View all ({entries.mistakes.length})
                    </Button>
                  </div>
                  <Textarea
                    id="notes-mistakes"
                    value={entryDrafts.mistakes}
                    onChange={(event) => setEntryDrafts((prev) => ({ ...prev, mistakes: event.target.value }))}
                    placeholder="Add one mistake you want to remove for good."
                    className="min-h-[120px] border-border/60 bg-background"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddEntry("mistakes")}
                      disabled={!entryDrafts.mistakes.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes-weaknesses" className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Weaknesses To Train Out
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCategory("weaknesses")}
                      disabled={entries.weaknesses.length === 0}
                    >
                      View all ({entries.weaknesses.length})
                    </Button>
                  </div>
                  <Textarea
                    id="notes-weaknesses"
                    value={entryDrafts.weaknesses}
                    onChange={(event) => setEntryDrafts((prev) => ({ ...prev, weaknesses: event.target.value }))}
                    placeholder="Add the weakness you want to coach out."
                    className="min-h-[120px] border-border/60 bg-background"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddEntry("weaknesses")}
                      disabled={!entryDrafts.weaknesses.trim()}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(serverDraft);
                    setEntryDrafts(EMPTY_DRAFT);
                  }}
                  disabled={(!dirty && !hasPendingEntries) || saveReflection.isPending}
                >
                  Reset to Saved
                </Button>
                <Button
                  onClick={() => {
                    const nextDraft = flushPendingEntries();
                    saveReflection.mutate(payloadFromDraft(nextDraft));
                  }}
                  disabled={(!dirty && !hasPendingEntries) || saveReflection.isPending}
                >
                  Save Now
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle>Prompt Board</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {REFLECTION_PROMPTS.map((prompt) => (
                <div key={prompt} className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  {prompt}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Mentor Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reflectionSuggestions?.suggestions?.length ? (
                reflectionSuggestions.suggestions.map((suggestion, index) => {
                  const Icon = suggestionIcon(suggestion.category);
                  return (
                    <div
                      key={`${suggestion.category}-${suggestion.title}-${index}`}
                      className={`rounded-2xl border p-4 ${suggestionTone(suggestion.category)}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl border border-border bg-background p-2">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">{suggestion.title}</div>
                          <div className="text-sm text-muted-foreground">{suggestion.detail}</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Add reflections and close trades to get mentor-style guidance here.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle>How this learns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border bg-card p-4">
                Your repeated words become coaching prompts so the mentor voice stays consistent.
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                Suggestions follow the selected account, while the full journal keeps your complete reflection history.
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                Drafts are backed up locally before the server write completes, so refreshes do not wipe progress.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(activeCategory)}
        onOpenChange={(open) => {
          if (!open) setActiveCategory(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {activeCategory ? CATEGORY_LABELS[activeCategory] : "Notes"}
            </DialogTitle>
          </DialogHeader>
          {activeCategory ? (
            entries[activeCategory].length ? (
              <div className="space-y-2">
                {entries[activeCategory].map((entry, index) => (
                  <div
                    key={`${activeCategory}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-sm"
                  >
                    <div className="whitespace-pre-wrap">{entry}</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDeleteEntry(activeCategory, index)}
                      aria-label="Delete note entry"
                      data-testid={`button-delete-note-entry-${activeCategory}-${index}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                No saved items yet.
              </div>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
