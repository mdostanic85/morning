"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildSyncAnimationData, readSyncAnimationColors } from "./syncAnimation";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type GranolaMeeting = {
  title: string;
  url: string | null;
  summary: string | null;
  participants: string[];
};

type SyncDayResponse = {
  ok: boolean;
  granolaMeetings?: GranolaMeeting[];
  projects: {
    ok: boolean;
    created: number;
    updated: number;
    signalCount: number;
    errors: string[];
  };
  providers: {
    provider: string;
    ok: boolean;
    imported: number;
    skipped: number;
    error: string | null;
  }[];
  imported: number;
  tasksExtracted: number;
  knowledgeExtracted: number;
  jiraPendingCount: number;
  backfill: {
    sourcesProcessed: number;
    sourcesRemaining?: number;
    errors: string[];
  };
  rebuild:
    | { status: "completed"; updatedTaskCount: number }
    | { status: "failed"; error: string };
  briefing?: {
    ok: boolean;
    generated?: boolean;
    error?: string;
    risks?: string[];
    waitingOn?: string[];
    focusCount?: number;
  };
  error?: string;
};

interface SyncStep {
  id: string;
  label: string;
  detail: string;
}

type SyncIssue = {
  id: string;
  label: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
};

function showSyncIssueToasts(issues: SyncIssue[], router: ReturnType<typeof useRouter>) {
  for (const issue of issues) {
    toast.error(issue.label, {
      description: issue.detail,
      duration: 12000,
      action: issue.href
        ? {
            label: issue.hrefLabel ?? "Open",
            onClick: () => router.push(issue.href!),
          }
        : undefined,
    });
  }
}

function showSyncWarningToasts(messages: string[], title: string) {
  for (const message of messages) {
    toast.warning(title, {
      description: message,
      duration: 10000,
    });
  }
}

type SyncIssueInput = Omit<SyncIssue, "id">;

function dedupeSyncIssues(issues: SyncIssueInput[]): SyncIssue[] {
  const seen = new Set<string>();
  const unique: SyncIssue[] = [];

  for (const issue of issues) {
    const fingerprint = `${issue.label}\0${issue.detail}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push({ ...issue, id: `sync-issue-${unique.length}` });
  }

  return unique;
}

function humanizeSyncIssue(raw: string): SyncIssueInput {
  const text = raw.trim();

  if (text.includes("rate_limit_daily") || /rate limit reached/i.test(text)) {
    return {
      label: "Queue planning paused",
      detail:
        "Groq daily token limit reached. Your sources still synced — try again later or switch LLM provider in Settings.",
    };
  }

  if (/quota|embeddings (skipped|unavailable)/i.test(text)) {
    return {
      label: "Knowledge embeddings skipped",
      detail:
        "Settings → OpenAI API key: billing/quota is exceeded on the current key. Restore OpenAI credits or paste a new key, then re-enable OpenAI under LLM providers. Ask memory search needs OpenAI embeddings (Groq cannot replace them).",
      href: "/settings",
      hrefLabel: "Open Settings",
    };
  }

  const confluenceMatch = text.match(/confluence\s*[—-]\s*(.+)/i);
  if (confluenceMatch || /select confluence spaces/i.test(text)) {
    return {
      label: "Confluence needs setup",
      detail:
        "Hydra project → Overview → Connector hints. Confluence spaces: Hydra. Optional page URL: ooden.atlassian.net/wiki/spaces/Hydra/pages/2078605317 (PRD). Save connector hints.",
      href: "/projects/18",
      hrefLabel: "Open Hydra",
    };
  }

  if (/discord channel/i.test(text)) {
    return {
      label: "Discord needs attention",
      detail:
        "1) Invite the MorningAPP bot to your Discord server. 2) Enable Developer Mode in Discord → right-click a channel → Copy Channel ID. 3) Hydra project → Connector hints → paste channel ID (one per line) → Save.",
      href: "/projects/18",
      hrefLabel: "Open Hydra",
    };
  }

  const providerMatch = text.match(/^([a-z0-9_-]+)\s*[—-]\s*(.+)/i);
  if (providerMatch) {
    const provider = providerMatch[1];
    return {
      label: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} needs attention`,
      detail: providerMatch[2].trim(),
    };
  }

  if (/queue rebuild failed/i.test(text)) {
    const detail = text.replace(/^queue rebuild failed:\s*/i, "");
    if (detail !== text) return humanizeSyncIssue(detail);
  }

  if (/needs setup:/i.test(text)) {
    return {
      label: "Connection needs setup",
      detail: text.replace(/^needs setup:\s*/i, ""),
    };
  }

  return {
    label: "Sync issue",
    detail: text.length > 280 ? `${text.slice(0, 277)}…` : text,
  };
}

/** Average pace the highlight moves through steps while the request runs. */
const STEP_ADVANCE_MS = 2400;

const LAST_STEP_MESSAGES = [
  "Weighing deadlines against your energy…",
  "Sorting tasks by urgency and context…",
  "Mapping open issues to your queue…",
  "Grouping related work items…",
  "Estimating what fits in your day…",
  "Checking for overdue items…",
  "Balancing focus time with meetings…",
  "Building your prioritized queue…",
];

function buildSteps(sources: string[]): SyncStep[] {
  const sourceSteps: SyncStep[] =
    sources.length > 0
      ? sources.map((source) => ({
          id: `source-${source}`,
          label: source,
          detail: "Pulling new signals",
        }))
      : [{ id: "source-none", label: "Connected sources", detail: "Checking for new signals" }];

  return [
    ...sourceSteps,
    { id: "projects", label: "Projects", detail: "Syncing Jira boards" },
    { id: "extract", label: "Tasks & knowledge", detail: "Extracting from new material" },
    { id: "plan", label: "Your day", detail: "Prioritizing the queue" },
  ];
}

/** How strongly the percentage eases toward its target per tick (0–1). */
const PROGRESS_EASE = 0.09;
const PROGRESS_TICK_MS = 90;
/** The counter never passes this while the request is still running. */
const PROGRESS_HOLD_MAX = 94;

function SyncOverlay({
  steps,
  finishing,
  onCancel,
}: {
  steps: SyncStep[];
  finishing: boolean;
  onCancel: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lastMsgIndex, setLastMsgIndex] = useState(0);
  const animationData = useMemo(
    () => buildSyncAnimationData(readSyncAnimationColors()),
    []
  );

  const isLastStep = !finishing && activeIndex === steps.length - 1;

  useEffect(() => {
    if (finishing) return;
    const interval = setInterval(() => {
      // Hold on the last step until the request actually finishes.
      setActiveIndex((index) => Math.min(index + 1, steps.length - 1));
    }, STEP_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [finishing, steps.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((current) => {
        if (finishing) {
          // Snap-ease to 100 once the request is done.
          return Math.min(100, current + Math.max(2, (100 - current) * 0.35));
        }
        // Ease toward a target just past the active step, capped below 100
        // so the counter never claims completion before the server responds.
        const target = Math.min(
          PROGRESS_HOLD_MAX,
          ((activeIndex + 0.85) / steps.length) * 100
        );
        return current + Math.max(0, (target - current) * PROGRESS_EASE);
      });
    }, PROGRESS_TICK_MS);
    return () => clearInterval(interval);
  }, [finishing, activeIndex, steps.length]);

  // Rotate status messages while stuck on the last step.
  useEffect(() => {
    if (!isLastStep) return;
    const interval = setInterval(() => {
      setLastMsgIndex((i) => (i + 1) % LAST_STEP_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLastStep]);

  const displayProgress = Math.min(100, Math.round(progress));

  // Reveal steps one-by-one; when finishing, show all at once.
  const visibleSteps = finishing ? steps : steps.slice(0, activeIndex + 1);

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open && !finishing) onCancel();
      }}
    >
      <DialogContent className="gap-0 p-7 sm:max-w-sm" showCloseButton={!finishing}>
        <DialogTitle className="sr-only">Syncing your day</DialogTitle>
        <div className="relative mx-auto h-28 w-28" aria-hidden>
          <Lottie animationData={animationData} loop autoplay className="h-full w-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-[19px] font-semibold tabular-nums tracking-tight">
              {displayProgress}
              <span className="text-[12px] font-normal text-muted">%</span>
            </span>
          </div>
        </div>
        <DialogDescription
          className="mt-4 text-center text-[13px] text-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayProgress}
          aria-label="Sync progress"
        >
          Syncing your day
        </DialogDescription>
        <ul className="mt-5 space-y-3.5" aria-live="polite">
          {visibleSteps.map((step, index) => {
            const done = finishing || index < activeIndex;
            const active = !finishing && index === activeIndex;
            // Animate entry for: newly active step, or steps revealed during finishing.
            const isNew = (!finishing && index === activeIndex) ||
                          (finishing && index > activeIndex);
            return (
              <li
                key={step.id}
                className={cn("flex items-start gap-3", isNew && "step-in")}
                style={finishing && index > activeIndex
                  ? { animationDelay: `${(index - activeIndex) * 80}ms` }
                  : undefined}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                    done
                      ? "border-good/50 bg-good/15 text-good"
                      : active
                        ? "border-accent/60 bg-accent/10"
                        : "border-border bg-surface-soft"
                  )}
                >
                  {done ? (
                    <svg viewBox="0 0 10 10" className="h-2 w-2 fill-none stroke-current" strokeWidth="1.8">
                      <path d="M1.5 5.5 4 8l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    <span className="h-1.5 w-1.5 animate-ping rounded-full bg-accent" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[14px] font-medium leading-snug transition-colors duration-300",
                      done ? "text-foreground" : active ? "text-foreground" : "text-muted-soft"
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      "text-[12px] leading-relaxed transition-colors duration-300",
                      active ? "text-muted" : "text-muted-soft/70"
                    )}
                  >
                    {done ? "Done" : step.detail}
                    {active ? "…" : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {isLastStep && (
          <p
            key={lastMsgIndex}
            className="step-in mt-4 text-center text-[12px] text-muted"
            aria-live="polite"
          >
            {LAST_STEP_MESSAGES[lastMsgIndex]}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SyncMyDayButton({ sources = [] }: { sources?: string[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing">("idle");
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [granolaMeetings, setGranolaMeetings] = useState<GranolaMeeting[]>([]);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const stepsRef = useRef<SyncStep[]>(buildSteps(sources));
  const abortRef = useRef<AbortController | null>(null);

  function cancelSync() {
    abortRef.current?.abort();
    setFinishing(false);
    setStatus("idle");
    setSummary(null);
    setIssues([]);
    setGranolaMeetings([]);
    setExpandedMeeting(null);
  }

  async function syncDay() {
    stepsRef.current = buildSteps(sources);
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("syncing");
    setFinishing(false);
    setSummary(null);
    setIssues([]);

    try {
      const res = await fetch("/api/day/sync", { method: "POST", signal: controller.signal });
      const data = (await res.json()) as SyncDayResponse;

      if (!res.ok) {
        throw new Error(data.error ?? "Sync failed.");
      }

      setGranolaMeetings(data.granolaMeetings ?? []);
      setExpandedMeeting(null);

      // Flash every step as done before dismissing the overlay.
      setFinishing(true);
      await new Promise((resolve) => setTimeout(resolve, 700));

      const successParts: string[] = [];
      const syncIssues: SyncIssueInput[] = [];

      if (data.jiraPendingCount > 0) {
        successParts.push(
          `${data.jiraPendingCount} open Jira issue${data.jiraPendingCount === 1 ? "" : "s"} assigned to you.`
        );
      }

      if (data.projects.created > 0) {
        successParts.push(
          `${data.projects.created} new project${data.projects.created === 1 ? "" : "s"} from Jira.`
        );
      }

      const totalSkipped = data.providers.reduce((sum, entry) => sum + entry.skipped, 0);
      if (data.imported > 0) {
        successParts.push(`${data.imported} new source item${data.imported === 1 ? "" : "s"} imported.`);
      } else if (totalSkipped > 0) {
        successParts.push(`${totalSkipped} source${totalSkipped === 1 ? "" : "s"} already up to date.`);
      }

      if (data.backfill.sourcesProcessed > 0) {
        successParts.push(
          `Extracted from ${data.backfill.sourcesProcessed} backlog source${data.backfill.sourcesProcessed === 1 ? "" : "s"}.`
        );
      }
      if ((data.backfill.sourcesRemaining ?? 0) > 0) {
        successParts.push(
          `${data.backfill.sourcesRemaining} backlog source${data.backfill.sourcesRemaining === 1 ? "" : "s"} left — sync again to continue.`
        );
      }

      const extracted = data.tasksExtracted + data.knowledgeExtracted;
      if (extracted > 0) {
        successParts.push(
          `${data.tasksExtracted} task${data.tasksExtracted === 1 ? "" : "s"} and ${data.knowledgeExtracted} knowledge item${data.knowledgeExtracted === 1 ? "" : "s"} added to Today.`
        );
      }

      if (data.rebuild.status === "completed" && data.rebuild.updatedTaskCount > 0) {
        successParts.push(`Queue re-planned (${data.rebuild.updatedTaskCount} tasks).`);
      } else if (data.rebuild.status === "failed") {
        syncIssues.push(humanizeSyncIssue(`Queue rebuild failed: ${data.rebuild.error}`));
      } else if (extracted === 0 && data.jiraPendingCount === 0 && data.imported === 0) {
        successParts.push("Nothing new to pull — check Projects for Jira boards.");
      }

      const failed = data.providers.filter((entry) => !entry.ok);
      for (const entry of failed) {
        syncIssues.push(humanizeSyncIssue(`${entry.provider} — ${entry.error ?? "Connection failed."}`));
      }

      for (const error of data.backfill.errors) {
        syncIssues.push(humanizeSyncIssue(error));
      }

      if (data.briefing?.ok === false && data.briefing.error) {
        syncIssues.push(humanizeSyncIssue(`Briefing failed: ${data.briefing.error}`));
      }

      for (const error of data.projects.errors) {
        syncIssues.push(humanizeSyncIssue(error));
      }

      const dedupedIssues = dedupeSyncIssues(syncIssues);
      setStatus("idle");
      setSummary(successParts.length > 0 ? successParts.join(" ") : null);
      setIssues(dedupedIssues);

      if (successParts.length > 0) {
        toast.success("Sync completed.", {
          description: successParts.join(" "),
          duration: 6000,
        });
      }

      if (dedupedIssues.length > 0) {
        showSyncIssueToasts(dedupedIssues, router);
      }

      if (data.briefing?.risks?.length) {
        showSyncWarningToasts(data.briefing.risks, "Risk flagged");
      }

      if (data.briefing?.waitingOn?.length) {
        showSyncWarningToasts(data.briefing.waitingOn, "Waiting on");
      }

      if (dedupedIssues.length === 0 && successParts.length === 0) {
        toast.success("Day synced.");
      }
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setStatus("idle");
      setSummary(null);
      setIssues(
        dedupeSyncIssues([
          humanizeSyncIssue(err instanceof Error ? err.message : "Sync failed."),
        ])
      );
      showSyncIssueToasts(
        dedupeSyncIssues([
          humanizeSyncIssue(err instanceof Error ? err.message : "Sync failed."),
        ]),
        router
      );
    } finally {
      setFinishing(false);
      setStatus((current) => (current === "syncing" ? "idle" : current));
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {status === "syncing" ? (
        <SyncOverlay steps={stepsRef.current} finishing={finishing} onCancel={cancelSync} />
      ) : null}
      <Button
        type="button"
        onClick={syncDay}
        disabled={status === "syncing"}
      >
        {status === "syncing" ? "Syncing your day…" : "Sync my day"}
      </Button>
      {summary ? (
        <p className="max-w-lg text-[13px] leading-relaxed text-muted" role="status">
          {summary}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <Dialog>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[13px] text-danger">
              {issues.length === 1 ? "1 issue — see toast" : `${issues.length} issues — see toasts`}
            </p>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-1 py-0 text-[13px] text-danger underline-offset-2 hover:underline"
                />
              }
            >
              What went wrong?
            </DialogTrigger>
          </div>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Sync issues</DialogTitle>
              <DialogDescription>
                Sources may still have synced. Fix these when you can.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-4">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <p className="text-[14px] font-medium leading-snug">{issue.label}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{issue.detail}</p>
                  {issue.href ? (
                    <Link
                      href={issue.href}
                      className="mt-2 inline-block text-[13px] text-accent underline-offset-2 hover:underline"
                    >
                      {issue.hrefLabel ?? "Open"}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}
      {granolaMeetings.length > 0 ? (
        <div className="mt-3 w-full max-w-lg space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
            Meetings imported
          </p>
          {granolaMeetings.map((meeting) => {
            const isExpanded = expandedMeeting === meeting.title;
            return (
              <div key={meeting.title} className="card overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setExpandedMeeting(isExpanded ? null : meeting.title)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-soft rounded-[inherit]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{meeting.title}</p>
                    {meeting.participants.length > 0 ? (
                      <p className="truncate text-[11px] text-muted">
                        {meeting.participants.slice(0, 3).join(", ")}
                        {meeting.participants.length > 3
                          ? ` +${meeting.participants.length - 3} more`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <svg
                    viewBox="0 0 12 12"
                    className={cn(
                      "h-3 w-3 shrink-0 fill-none stroke-current text-muted transition-transform duration-200",
                      isExpanded ? "rotate-180" : ""
                    )}
                    strokeWidth="1.8"
                  >
                    <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isExpanded ? (
                  <div className="border-t border-border px-4 py-3">
                    {meeting.summary ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                        {meeting.summary}
                      </p>
                    ) : (
                      <p className="text-[12px] text-muted-soft">No summary available.</p>
                    )}
                    {meeting.url ? (
                      <a
                        href={meeting.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-[11px] text-accent hover:underline"
                      >
                        Open in Granola →
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
