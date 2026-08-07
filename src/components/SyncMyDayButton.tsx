"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { cn } from "@/lib/utils";
import { SyncWhatsNewPanel } from "./SyncWhatsNewPanel";
import type { SyncWhatsNew } from "@/lib/imports/syncWhatsNew";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import loadingAnimation from "./loadingAnimation.json";
import styles from "./SyncMyDayOverlay.module.css";

const ACTIVE_SYNC_RUN_KEY = "worklight:activeSyncRunId";
const POLL_INTERVAL_MS = 2000;
const Lottie = dynamic(() => import("lottie-react").then((module) => module.default), {
 ssr: false,
});

const PROVIDER_LABEL: Record<ConnectionProvider, string> = {
 gmail: "Gemini notes",
 calendar: "Google Calendar",
 drive: "Gemini notes",
 jira: "Jira",
 confluence: "Confluence",
 granola: "Granola",
 github: "GitHub",
 discord: "Discord",
 figma: "Figma",
};

const PROVIDER_SYNC_DESCRIPTION: Record<ConnectionProvider, string> = {
 gmail: "New Gemini meeting notes and transcripts",
 calendar: "Recent and upcoming calendar events",
 drive: "Legacy Google Drive Gemini-note import",
 jira: "Issues assigned to you (any status) plus recent mentions",
 confluence: "Pages from configured spaces and page links",
 granola: "New meeting notes and transcripts",
 github: "Pull-request activity in configured repositories",
 discord: "Mentions and keyword matches in configured channels",
 figma: "Configured design files",
};

const TERMINAL_SYNC_STATUSES = new Set([
 "completed",
 "partially_completed",
 "failed",
 "cancelled",
]);

type SyncEnqueueResponse = {
 ok: boolean;
 syncRunId: number;
 syncStatus: string;
 error?: string;
};

type SyncProviderRunSnapshot = {
 provider: string;
 status: string;
 itemsFetched: number;
 itemsCreated: number;
 itemsUpdated: number;
 itemsUnchanged: number;
 itemsFailed: number;
 errorMessage: string | null;
};

type SyncStatusResponse = {
 ok: boolean;
 syncRun: {
 status: string;
 errorSummary: string | null;
 };
 providerRuns: SyncProviderRunSnapshot[];
 whatsNew?: SyncWhatsNew | null;
 progress: {
 total: number;
 completed: number;
 failed: number;
 running: number;
 isTerminal: boolean;
 };
 error?: string;
};

type ProviderUiStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

type ProviderProgressItem = {
 id: string;
 label: string;
 status: ProviderUiStatus;
 detail: string;
};

type FinalizeUiStatus = "hidden" | "queued" | "running" | "completed" | "failed" | "cancelled";

type SyncIssue = {
 id: string;
 label: string;
 detail: string;
 href?: string;
 hrefLabel?: string;
};

type SyncIssueInput = Omit<SyncIssue, "id">;

function expectedProviderKeys(sourceLabels: string[]): string[] {
 if (sourceLabels.length === 0) return [];
 return sourceLabels.map((label) => {
 const match = (Object.entries(PROVIDER_LABEL) as [ConnectionProvider, string][]).find(
 ([, providerLabel]) => providerLabel === label
 );
 return match?.[0] ?? label.toLowerCase();
 });
}

function labelForProvider(provider: string): string {
 return PROVIDER_LABEL[provider as ConnectionProvider] ?? provider;
}

function syncDescriptionForProvider(provider: string): string {
 return PROVIDER_SYNC_DESCRIPTION[provider as ConnectionProvider] ?? "New and changed source items";
}

function formatProviderCounters(run: SyncProviderRunSnapshot | undefined): string | null {
 if (!run) return null;
 const parts: string[] = [];
 if (run.itemsCreated > 0) parts.push(`${run.itemsCreated} new`);
 if (run.itemsUpdated > 0) parts.push(`${run.itemsUpdated} updated`);
 if (run.itemsUnchanged > 0) parts.push(`${run.itemsUnchanged} unchanged`);
 if (run.itemsFailed > 0) parts.push(`${run.itemsFailed} item${run.itemsFailed === 1 ? "" : "s"} failed`);
 return parts.length > 0 ? parts.join(", ") : null;
}

function providerUiStatus(
 provider: string,
 run: SyncProviderRunSnapshot | undefined,
 syncRunStatus: string
): ProviderUiStatus {
 if (run?.status === "cancelled") return "cancelled";
 if (syncRunStatus === "cancelling") {
 if (!run) return "cancelled";
 if (run.status === "running") return "running";
 }
 if (syncRunStatus === "cancelled") {
 if (!run) return "cancelled";
 if (run.status === "running") return "cancelled";
 }
 if (!run) return "queued";
 if (run.status === "running") return "running";
 if (run.status === "failed") return "failed";
 return "completed";
}

function providerDetail(
 provider: string,
 status: ProviderUiStatus,
 run: SyncProviderRunSnapshot | undefined
): string {
 const description = syncDescriptionForProvider(provider);
 if (status === "queued") return description;
 if (status === "running") return `${description}…`;
 if (status === "cancelled") {
 return (
 run?.errorMessage?.trim() ||
 "Cancelled. Any in-flight external requests may still complete."
 );
 }
 if (status === "failed") return run?.errorMessage?.trim() || "Connection failed";
 const counters = formatProviderCounters(run);
 return counters ? `${description} · ${counters}` : `${description} · Up to date`;
}

function buildProviderItems(
 sourceLabels: string[],
 providerRuns: SyncProviderRunSnapshot[],
 syncRunStatus: string
): ProviderProgressItem[] {
 // Drive used to duplicate the Gmail-backed Gemini Notes provider. Hide old
 // in-flight/history rows so Gemini Notes always has one operational status.
 const visibleRuns = providerRuns.filter((run) => run.provider !== "drive");
 const runsByProvider = new Map(visibleRuns.map((run) => [run.provider, run]));
 const expected = expectedProviderKeys(sourceLabels);
 const seen = new Set<string>();

 const items = expected.map((provider) => {
 seen.add(provider);
 const run = runsByProvider.get(provider);
 const status = providerUiStatus(provider, run, syncRunStatus);
 return {
 id: provider,
 label: labelForProvider(provider),
 status,
 detail: providerDetail(provider, status, run),
 };
 });

 for (const run of visibleRuns) {
 if (seen.has(run.provider)) continue;
 const status = providerUiStatus(run.provider, run, syncRunStatus);
 items.push({
 id: run.provider,
 label: labelForProvider(run.provider),
 status,
 detail: providerDetail(run.provider, status, run),
 });
 }

 return items;
}

function resolveFinalizeStatus(
 syncRunStatus: string,
 providerItems: ProviderProgressItem[]
): FinalizeUiStatus {
 if (providerItems.length === 0) return "hidden";
 const providersDone = providerItems.every(
 (item) => item.status === "completed" || item.status === "failed" || item.status === "cancelled"
 );
 if (!providersDone) return "queued";
 if (syncRunStatus === "cancelling") return "cancelled";
 if (syncRunStatus === "running") return "running";
 if (syncRunStatus === "completed" || syncRunStatus === "partially_completed") return "completed";
 if (syncRunStatus === "cancelled") return "cancelled";
 if (syncRunStatus === "failed") return "failed";
 return "hidden";
}

function overlayHeadline(): string {
  return "Updating your day";
}

/** 0..1 across provider steps plus the finalize step. */
function overlayProgress(
 providerItems: ProviderProgressItem[],
 finalizeStatus: FinalizeUiStatus
): number {
 const total = providerItems.length;
 if (total === 0) return 0.04;
 let done = 0;
 for (const item of providerItems) {
 if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") {
 done += 1;
 } else if (item.status === "running") {
 done += 0.45;
 }
 }
 const finalizeShare =
 finalizeStatus === "completed" || finalizeStatus === "failed" || finalizeStatus === "cancelled"
 ? 1
 : finalizeStatus === "running"
 ? 0.5
 : 0;
 const fraction = (done + finalizeShare) / (total + 1);
 return Math.max(0.04, Math.min(1, fraction));
}

function showSyncIssueToasts(issues: SyncIssue[], router: ReturnType<typeof useRouter>) {
 for (const issue of issues) {
 Toast.toast.danger(issue.label, {
 description: issue.detail,
 timeout: 12000,
 actionProps: issue.href
 ? {
 children: issue.hrefLabel ?? "Open",
 onPress: () => router.push(issue.href!),
 }
 : undefined,
 });
 }
}

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
 "Groq's daily token limit was reached. Your sources still synced. Try again later or switch model provider in Settings.",
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

 if (
 /calendar/i.test(text) &&
 /invalid authentication credentials|oauth 2 access token|unauthenticated|unauthorized/i.test(text)
 ) {
 return {
 label: "Calendar needs to reconnect",
 detail:
 "Google rejected the saved Calendar session. Reconnect Google, then run Sync my day again.",
 href: "/api/connections/gmail/connect?link=google",
 hrefLabel: "Reconnect Google",
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
 "1) Invite the WorklightAPP bot to your Discord server. 2) Enable Developer Mode in Discord → right-click a channel → Copy Channel ID. 3) Hydra project → Connector hints → paste channel ID (one per line) → Save.",
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

 if (
 /^(fetch failed|failed to fetch|load failed|networkerror)$/i.test(text) ||
 /network|connection refused|econnrefused|enotfound/i.test(text)
 ) {
 return {
 label: "Couldn’t reach the sync service",
 detail:
 "The app lost contact with the local server or Inngest worker. Confirm `npm run dev` is running (Next.js + Inngest), then try Sync my day again.",
 };
 }

 return {
 label: "Sync issue",
 detail: text.length > 280 ? `${text.slice(0, 277)}…` : text,
 };
}

function buildCompletionIssues(status: SyncStatusResponse): SyncIssueInput[] {
 const syncIssues: SyncIssueInput[] = [];

 // Drive is a retired duplicate Gemini path; it must not surface as a second
 // Gemini failure while an older persisted run is still being displayed.
 const failed = status.providerRuns.filter(
 (entry) => entry.status === "failed" && entry.provider !== "drive"
 );
 for (const entry of failed) {
 syncIssues.push(
 humanizeSyncIssue(`${entry.provider}: ${entry.errorMessage ?? "Connection failed."}`)
 );
 }

 if (status.syncRun.status === "partially_completed") {
 syncIssues.push(
 humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync completed with issues.")
 );
 } else if (status.syncRun.status === "failed") {
 syncIssues.push(humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync failed."));
 } else if (status.syncRun.status === "cancelled") {
 syncIssues.push(humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync cancelled."));
 }

 return syncIssues;
}

function statusLabel(status: ProviderUiStatus | FinalizeUiStatus): string {
 switch (status) {
 case "queued":
 return "Queued";
 case "running":
 return "Running";
 case "completed":
 return "Done";
 case "failed":
 return "Failed";
 case "cancelled":
 return "Cancelled";
 default:
 return "";
 }
}

type SyncResult = {
 status: string;
 created: number;
 updated: number;
 unchanged: number;
 issues: SyncIssue[];
};

function resultHeadline(status: string): string {
 if (status === "partially_completed") return "Synced, with issues";
 if (status === "failed") return "Sync failed";
 if (status === "cancelled") return "Sync cancelled";
 return "You're up to date";
}

function resultSummaryLine(result: SyncResult): string {
 const parts: string[] = [];
 if (result.created > 0) parts.push(`${result.created} new`);
 if (result.updated > 0) parts.push(`${result.updated} updated`);
 if (parts.length === 0 && result.unchanged > 0) {
 return `Nothing new. ${result.unchanged} item${result.unchanged === 1 ? " is" : "s are"} already up to date.`;
 }
 if (parts.length === 0) return "No source changes this time.";
 return `${parts.join(", ")} across your sources.`;
}

type SyncStep = {
  id: string;
  label: string;
  status: ProviderUiStatus | FinalizeUiStatus;
  detail: string;
};

function buildSyncSteps(
  providerItems: ProviderProgressItem[],
  finalizeStatus: FinalizeUiStatus
): SyncStep[] {
  const steps: SyncStep[] = providerItems.map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    detail: item.detail,
  }));

  if (finalizeStatus !== "hidden") {
    steps.push({
      id: "finalize",
      label: "Today’s briefing",
      status: finalizeStatus,
      detail:
        finalizeStatus === "running"
          ? "Turning fresh signals into your prioritized queue…"
          : finalizeStatus === "completed"
            ? "Priority queue and briefing refreshed"
            : finalizeStatus === "failed"
              ? "Could not finish queue or briefing"
              : finalizeStatus === "cancelled"
                ? "Stopped before the briefing finished"
                : "Starts after all sources are checked",
    });
  }

  return steps;
}

function resolveFocusStep(steps: SyncStep[]): SyncStep | null {
  if (steps.length === 0) return null;
  return (
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "queued") ??
    steps.find((step) => step.status === "failed") ??
    steps[steps.length - 1]
  );
}

function StatusDot({ status }: { status: ProviderUiStatus | FinalizeUiStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        styles.statusDot,
        status === "completed"
          ? styles.statusDotCompleted
          : status === "failed"
            ? styles.statusDotFailed
            : status === "running"
              ? styles.statusDotRunning
              : styles.statusDotIdle
      )}
    >
      {status === "completed" ? (
        <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current" strokeWidth="1.8">
          <path d="M1.5 5.5 4 8l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === "running" ? (
        <span className="size-3 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none" />
      ) : status === "failed" ? (
        <span className="text-sm font-bold leading-none">!</span>
      ) : (
        <span className="size-1.5 rounded-full bg-current opacity-50" />
      )}
    </span>
  );
}

const STEP_EXIT_MS = 240;

function SyncStepStage({
  step,
  index,
  total,
}: {
  step: SyncStep;
  index: number;
  total: number;
}) {
  const [displayed, setDisplayed] = useState(step);
  const [displayedIndex, setDisplayedIndex] = useState(index);
  const [phase, setPhase] = useState<"enter" | "exit" | "settle">("enter");
  const prevIdRef = useRef(step.id);

  useEffect(() => {
    if (step.id === prevIdRef.current) {
      setDisplayed(step);
      setDisplayedIndex(index);
      return;
    }

    setPhase("exit");
    const swap = window.setTimeout(() => {
      prevIdRef.current = step.id;
      setDisplayed(step);
      setDisplayedIndex(index);
      setPhase("enter");
    }, STEP_EXIT_MS);

    return () => window.clearTimeout(swap);
  }, [step, index]);

  useEffect(() => {
    if (phase !== "enter") return;
    const settle = window.setTimeout(() => setPhase("settle"), 340);
    return () => window.clearTimeout(settle);
  }, [phase, displayed.id]);

  const failed = displayed.status === "failed";
  const active = displayed.status === "running";

  return (
    <div className={styles.stepStage} aria-live="polite">
      <div
        key={displayed.id}
        className={cn(
          styles.stepCard,
          phase === "exit" && styles.stepCardExit,
          phase === "enter" && styles.stepCardEnter
        )}
      >
        <div className={styles.stepCardTop}>
          <StatusDot status={displayed.status} />
          <span
            className={cn(
              styles.sourceStatus,
              failed
                ? "text-danger"
                : active
                  ? "text-accent"
                  : displayed.status === "completed"
                    ? "text-good"
                    : "text-muted-soft"
            )}
          >
            {statusLabel(displayed.status)}
          </span>
        </div>
        <p
          className={cn(
            styles.stepCardLabel,
            failed ? "text-danger" : "text-foreground"
          )}
        >
          {displayed.label}
        </p>
        <p className={cn(styles.stepCardDetail, failed && "text-danger/90")}>
          {displayed.detail}
        </p>
      </div>
      <p className={styles.stepCounter}>
        {Math.min(displayedIndex + 1, total)} of {total}
      </p>
    </div>
  );
}

function SyncResultView({
  result,
  onClose,
}: {
  result: SyncResult;
  onClose: () => void;
}) {
  const ok = result.status === "completed";
  const partial = result.status === "partially_completed";

  return (
    <div className={cn(styles.resultWrap, "flex flex-col px-1 pb-1 pt-2")}>
      <div
        aria-hidden
        className={cn(
          "mx-auto flex size-16 items-center justify-center rounded-full border transition-colors",
          ok
            ? "border-good/20 bg-good/10 text-good"
            : partial
              ? "border-warm/20 bg-warm/10 text-warm"
              : "border-danger/20 bg-danger/10 text-danger"
        )}
      >
        {ok || partial ? (
          <svg viewBox="0 0 20 20" className="h-7 w-7 fill-none stroke-current" strokeWidth="2">
            <path d="M4 10.5 8.5 15 16 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="font-display text-xl font-semibold leading-none">!</span>
        )}
      </div>

      <p className="mt-5 text-center font-display text-xl font-semibold tracking-[-0.03em]">
        {resultHeadline(result.status)}
      </p>
      <p className="mx-auto mt-1.5 max-w-xs text-center text-[14px] leading-relaxed text-muted">
        {resultSummaryLine(result)}
      </p>

      {result.issues.length > 0 ? (
        <ul className="mt-6 space-y-3 rounded-2xl border border-warm/20 bg-warm/5 p-4">
          {result.issues.map((issue) => (
            <li key={issue.id}>
              <p className="text-[14px] font-medium leading-snug text-foreground">{issue.label}</p>
              <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{issue.detail}</p>
              {issue.href ? (
                <Link
                  href={issue.href}
                  onClick={onClose}
                  className="mt-1 inline-block text-[14px] text-accent underline-offset-2 hover:underline"
                >
                  {issue.hrefLabel ?? "Open"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Button type="button" className="mt-7 w-full" onClick={onClose}>
        {result.issues.length > 0 ? "Got it" : "Show my day"}
      </Button>
    </div>
  );
}

export type SyncAnimationMode = "idle" | "running" | "success" | "warning" | "failed";

function SyncActivityAnimation({ mode }: { mode: SyncAnimationMode }) {
  const running = mode === "running";
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (reducedMotion || mode !== "running") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-[6.25rem] shrink-0 items-center justify-center rounded-[1.75rem] border",
          mode === "success" && "border-good/40 bg-good/10 text-good",
          mode === "warning" && "border-warm/40 bg-warm/10 text-warm",
          mode === "failed" && "border-danger/40 bg-danger/10 text-danger",
          (mode === "idle" || mode === "running") && "border-accent/20 bg-accent/5 text-accent"
        )}
      >
        {mode === "success" || mode === "warning" ? (
          <svg viewBox="0 0 20 20" className="h-8 w-8 fill-none stroke-current" strokeWidth="2">
            <path d="M4 10.5 8.5 15 16 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : mode === "failed" ? (
          <span className="font-display text-2xl font-semibold leading-none">!</span>
        ) : (
          <span
            className={cn(
              "size-2.5 rounded-full bg-current",
              running && "animate-pulse motion-reduce:animate-none"
            )}
          />
        )}
      </span>
    );
  }

  return (
    <div className={styles.lottieWrap} aria-hidden>
      <div className={styles.lottie}>
        <Lottie animationData={loadingAnimation} loop autoplay />
      </div>
    </div>
  );
}

function SyncOverlay({
  providerItems,
  finalizeStatus,
  networkError,
  result,
  onCancelRequested,
  onClose,
}: {
  providerItems: ProviderProgressItem[];
  finalizeStatus: FinalizeUiStatus;
  networkError: string | null;
  result: SyncResult | null;
  onCancelRequested: () => void;
  onClose: () => void;
}) {
  const headline = overlayHeadline();
  const progress = result ? 1 : overlayProgress(providerItems, finalizeStatus);
  const progressPct = Math.round(progress * 100);
  const steps = useMemo(
    () => buildSyncSteps(providerItems, finalizeStatus),
    [providerItems, finalizeStatus]
  );
  const focusStep = useMemo(() => resolveFocusStep(steps), [steps]);
  const focusIndex = focusStep ? steps.findIndex((step) => step.id === focusStep.id) : 0;

  const animationMode: SyncAnimationMode = result
    ? result.status === "completed"
      ? "success"
      : result.status === "partially_completed"
        ? "warning"
        : result.status === "failed" || result.status === "cancelled"
          ? "failed"
          : "idle"
    : "running";

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    // X / Escape only dismisses the finished result. Abort while syncing is Cancel.
    if (result) onClose();
  };

  return (
    <Modal isOpen onOpenChange={handleOpenChange}>
      <Modal.Backdrop
        variant="blur"
        isDismissable={false}
        className={cn("bg-background/80", styles.backdrop)}
      >
        <Modal.Container placement="center" size="md" className="w-full max-w-none px-4">
          <Modal.Dialog
            aria-label={result ? resultHeadline(result.status) : headline}
            aria-live="polite"
            className={styles.dialog}
          >
            {result ? (
              <Modal.Header className={styles.header}>
                <Modal.Heading className="sr-only">
                  {resultHeadline(result.status)}
                </Modal.Heading>
                <Modal.CloseTrigger className={styles.close}>
                  <XIcon aria-hidden />
                  <span className="sr-only">Close</span>
                </Modal.CloseTrigger>
              </Modal.Header>
            ) : (
              <Modal.Heading className="sr-only">{headline}</Modal.Heading>
            )}

            <div className={cn(styles.body, !result && styles.bodySyncing)}>
              {result ? (
                <SyncResultView result={result} onClose={onClose} />
              ) : (
                <>
                  <div className={styles.hero}>
                    <SyncActivityAnimation mode={animationMode} />
                    <p className={styles.eyebrow}>Sync my day</p>
                    <p className={styles.headline}>{headline}</p>
                    {networkError ? (
                      <p className={cn(styles.stepLine, styles.stepLineError)} role="status">
                        {networkError}
                      </p>
                    ) : null}
                  </div>

                  <div className={styles.progressBlock}>
                    <div className={styles.progressMeta}>
                      <p className={styles.progressLabel}>Progress</p>
                      <p className={styles.progressPct}>{progressPct}%</p>
                    </div>
                    <div
                      className={styles.progressTrack}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPct}
                    >
                      <div
                        className={cn(
                          styles.progressFill,
                          networkError && styles.progressFillError
                        )}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {focusStep ? (
                    <SyncStepStage
                      step={focusStep}
                      index={Math.max(0, focusIndex)}
                      total={steps.length}
                    />
                  ) : (
                    <p className={styles.stepLine} role="status">
                      Preparing source checks…
                    </p>
                  )}

                  <div className={styles.footer}>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-w-[8.5rem]"
                      onClick={onCancelRequested}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

async function requestPersistedCancel(syncRunId: number): Promise<void> {
 const res = await fetch(`/api/day/sync/${syncRunId}/cancel`, { method: "POST" });
 const data = (await res.json()) as { error?: string };
 if (!res.ok) {
 throw new Error(data.error ?? "Could not request sync cancellation.");
 }
}

class SyncUiDismissedError extends Error {
  constructor() {
    super("Sync UI dismissed");
    this.name = "SyncUiDismissedError";
  }
}

async function pollSyncRun(
  syncRunId: number,
  onUpdate: (status: SyncStatusResponse) => void,
  onNetworkError: (message: string | null) => void,
  isDismissed: () => boolean
): Promise<SyncStatusResponse> {
  let consecutiveErrors = 0;

  while (true) {
    if (isDismissed()) throw new SyncUiDismissedError();

    try {
      const res = await fetch(`/api/day/sync/${syncRunId}`);
      const data = (await res.json()) as SyncStatusResponse;
      if (!res.ok) {
        throw new Error(data.error ?? "Could not read sync status.");
      }
      consecutiveErrors = 0;
      onNetworkError(null);
      if (isDismissed()) throw new SyncUiDismissedError();
      onUpdate(data);
      if (data.progress?.isTerminal || TERMINAL_SYNC_STATUSES.has(data.syncRun.status)) {
        return data;
      }
    } catch (error) {
      if (error instanceof SyncUiDismissedError) throw error;
      consecutiveErrors += 1;
      onNetworkError("Connection lost. Retrying…");
      if (consecutiveErrors >= 8) {
        throw new Error("Could not reach sync status. Check your connection and try again.");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function SyncMyDayButton({
 sources = [],
}: {
 sources?: string[];
 /** @deprecated Kept for call-site compatibility; sync health chrome was removed. */
 lastSyncAt?: string | null;
}) {
 const router = useRouter();
 const [status, setStatus] = useState<"idle" | "syncing">("idle");
 const [whatsNew, setWhatsNew] = useState<SyncWhatsNew | null>(null);
 const [liveStatus, setLiveStatus] = useState<SyncStatusResponse | null>(null);
 const [networkError, setNetworkError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const dismissedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);

  const providerItems = useMemo(
    () =>
      buildProviderItems(
        sources,
        liveStatus?.providerRuns ?? [],
        liveStatus?.syncRun.status ?? "running"
      ),
    [sources, liveStatus]
  );

  const finalizeStatus = useMemo(
    () => resolveFinalizeStatus(liveStatus?.syncRun.status ?? "running", providerItems),
    [liveStatus?.syncRun.status, providerItems]
  );

  const clearActiveSyncRun = useCallback(() => {
    sessionStorage.removeItem(ACTIVE_SYNC_RUN_KEY);
    setLiveStatus(null);
    setNetworkError(null);
  }, []);

  const resetSyncUi = useCallback(() => {
    setResult(null);
    setStatus("idle");
    setLiveStatus(null);
    setNetworkError(null);
  }, []);

  /** Cancel server-side and hard-close the modal immediately — no “stopping…” wait. */
  const requestCancel = useCallback(() => {
    const stored = sessionStorage.getItem(ACTIVE_SYNC_RUN_KEY);
    const syncRunId = Number(stored);
    dismissedRef.current = true;
    clearActiveSyncRun();
    resetSyncUi();

    if (Number.isFinite(syncRunId)) {
      void requestPersistedCancel(syncRunId).catch(() => {
        // UI already closed; backend may still finish the in-flight wave.
      });
    }
  }, [clearActiveSyncRun, resetSyncUi]);

  const closeResult = useCallback(() => {
    dismissedRef.current = true;
    clearActiveSyncRun();
    resetSyncUi();
  }, [clearActiveSyncRun, resetSyncUi]);

  const runSync = useCallback(
    async (existingSyncRunId?: number) => {
      dismissedRef.current = false;
      setStatus("syncing");
      setResult(null);
      setWhatsNew(null);
      setNetworkError(null);
      setLiveStatus(null);

      try {
        let activeSyncRunId = existingSyncRunId ?? null;

        if (!activeSyncRunId) {
          const res = await fetch("/api/day/sync", { method: "POST" });
          const enqueue = (await res.json()) as SyncEnqueueResponse;
          if (!res.ok) {
            throw new Error(enqueue.error ?? "Sync failed.");
          }
          activeSyncRunId = enqueue.syncRunId;
        }

        if (dismissedRef.current) return;

        sessionStorage.setItem(ACTIVE_SYNC_RUN_KEY, String(activeSyncRunId));

        const finalStatus = await pollSyncRun(
          activeSyncRunId,
          (snapshot) => {
            if (!dismissedRef.current) setLiveStatus(snapshot);
          },
          (message) => {
            if (!dismissedRef.current) setNetworkError(message);
          },
          () => dismissedRef.current
        );

        if (dismissedRef.current) return;

        setLiveStatus(finalStatus);
        // Let the progress bar visibly reach the end before swapping views.
        await new Promise((resolve) => setTimeout(resolve, 450));
        if (dismissedRef.current) return;

        const syncIssues = buildCompletionIssues(finalStatus);
        const dedupedIssues = dedupeSyncIssues(syncIssues);

        if (finalStatus.whatsNew?.hasNew) {
          setWhatsNew(finalStatus.whatsNew);
        }

        setResult({
          status: finalStatus.syncRun.status,
          created: finalStatus.providerRuns.reduce((sum, entry) => sum + entry.itemsCreated, 0),
          updated: finalStatus.providerRuns.reduce((sum, entry) => sum + entry.itemsUpdated, 0),
          unchanged: finalStatus.providerRuns.reduce(
            (sum, entry) => sum + entry.itemsUnchanged,
            0
          ),
          issues: finalStatus.syncRun.status === "cancelled" ? [] : dedupedIssues,
        });

        clearActiveSyncRun();
        if (finalStatus.syncRun.status !== "cancelled") {
          // Refresh while the result view is open so the page behind is
          // already up to date when the user closes it.
          router.refresh();
        }
      } catch (err) {
        if (err instanceof SyncUiDismissedError || dismissedRef.current) {
          clearActiveSyncRun();
          resetSyncUi();
          return;
        }
        clearActiveSyncRun();
        setStatus("idle");
        const message = err instanceof Error ? err.message : "Sync failed.";
        const failureIssues = dedupeSyncIssues([humanizeSyncIssue(message)]);
        // A temporary polling/network failure belongs in a toast, not as permanent
        // error chrome under the primary Sync button. Concrete provider failures are
        // still shown in the sync result modal with their relevant actions.
        showSyncIssueToasts(failureIssues, router);
      }
    },
    [clearActiveSyncRun, resetSyncUi, router]
  );

 useEffect(() => {
 if (resumeAttemptedRef.current) return;
 resumeAttemptedRef.current = true;

 const stored = sessionStorage.getItem(ACTIVE_SYNC_RUN_KEY);
 if (!stored) return;

 const id = Number(stored);
 if (!Number.isFinite(id)) {
 sessionStorage.removeItem(ACTIVE_SYNC_RUN_KEY);
 return;
 }

 // Defer so runSync's state updates don't run synchronously inside the
 // effect body. No cleanup: resumeAttemptedRef guards re-entry and the
 // resume must survive StrictMode's double effect invocation.
 setTimeout(() => void runSync(id), 0);
 }, [runSync]);

 return (
 <div className="flex flex-col items-start gap-1.5">
      {status === "syncing" ? (
        <SyncOverlay
          providerItems={providerItems}
          finalizeStatus={finalizeStatus}
          networkError={networkError}
          result={result}
          onCancelRequested={requestCancel}
          onClose={closeResult}
        />
      ) : null}
 <Button
 type="button"
 size="lg"
 className={cn(
 status === "syncing"
 ? "sync-sweeping"
 : "sync-day-cta"
 )}
 onClick={() => void runSync()}
 isDisabled={status === "syncing"}
 >
 {status === "syncing" ? (
 <>
 <span
 className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
 aria-hidden
 />
 Syncing…
 </>
 ) : (
 "↻ Sync my day"
 )}
 </Button>
 {whatsNew ? (
 <SyncWhatsNewPanel whatsNew={whatsNew} onDismiss={() => setWhatsNew(null)} />
 ) : null}
 </div>
 );
}
