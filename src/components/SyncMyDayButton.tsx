"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { cn } from "@/lib/utils";
import { SyncWhatsNewPanel } from "./SyncWhatsNewPanel";
import type { SyncWhatsNew } from "@/lib/imports/syncWhatsNew";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { buildSyncAnimationData, readSyncAnimationColors } from "./syncAnimation";

const ACTIVE_SYNC_RUN_KEY = "worklight:activeSyncRunId";
const POLL_INTERVAL_MS = 2000;
const Lottie = dynamic(() => import("lottie-react").then((module) => module.default), {
 ssr: false,
});

const PROVIDER_LABEL: Record<ConnectionProvider, string> = {
 gmail: "Gmail & Gemini notes",
 calendar: "Google Calendar",
 drive: "Google Drive Gemini notes",
 jira: "Jira",
 confluence: "Confluence",
 granola: "Granola",
 github: "GitHub",
 discord: "Discord",
 figma: "Figma",
};

const PROVIDER_SYNC_DESCRIPTION: Record<ConnectionProvider, string> = {
 gmail: "Gemini meeting-note emails from the last 30 days",
 calendar: "Recent and upcoming calendar events",
 drive: "New or changed Gemini meeting notes in Drive",
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
 const runsByProvider = new Map(providerRuns.map((run) => [run.provider, run]));
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

 for (const run of providerRuns) {
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

function overlayHeadline(syncRunStatus: string | null): string {
 if (syncRunStatus === "cancelling") return "Stopping the update…";
 return "Updating your day";
}

function overlayStepLine(
 providerItems: ProviderProgressItem[],
 finalizeStatus: FinalizeUiStatus
): string {
 const settled = providerItems.filter(
 (item) => item.status === "completed" || item.status === "failed" || item.status === "cancelled"
 ).length;
 const failed = providerItems.filter((item) => item.status === "failed").length;
 const total = providerItems.length;
 if (total === 0) return "Preparing source checks…";
 if (finalizeStatus === "running") return "Building your queue and morning briefing…";
 const activeSource = providerItems.find((item) => item.status === "running");
 if (activeSource) return `Checking ${activeSource.label}`;
 return `${settled} of ${total} checked${failed > 0 ? ` · ${failed} need attention` : ""}`;
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

function buildCompletionSummary(status: SyncStatusResponse): {
 successParts: string[];
 syncIssues: SyncIssueInput[];
} {
 const successParts: string[] = [];
 const syncIssues: SyncIssueInput[] = [];

 const imported = status.providerRuns.reduce(
 (sum, entry) => sum + entry.itemsCreated + entry.itemsUpdated,
 0
 );
 const unchanged = status.providerRuns.reduce((sum, entry) => sum + entry.itemsUnchanged, 0);

 if (imported > 0) {
 successParts.push(`${imported} source item${imported === 1 ? "" : "s"} updated.`);
 } else if (unchanged > 0) {
 successParts.push(`${unchanged} source${unchanged === 1 ? "" : "s"} already up to date.`);
 }

 const failed = status.providerRuns.filter((entry) => entry.status === "failed");
 for (const entry of failed) {
 syncIssues.push(
 humanizeSyncIssue(`${entry.provider} — ${entry.errorMessage ?? "Connection failed."}`)
 );
 }

 if (status.syncRun.status === "completed") {
 successParts.push("Queue and briefing refreshed.");
 } else if (status.syncRun.status === "partially_completed") {
 syncIssues.push(
 humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync completed with issues.")
 );
 } else if (status.syncRun.status === "failed") {
 syncIssues.push(humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync failed."));
 } else if (status.syncRun.status === "cancelled") {
 syncIssues.push(humanizeSyncIssue(status.syncRun.errorSummary ?? "Sync cancelled."));
 }

 return { successParts, syncIssues };
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
 return `Nothing new — ${result.unchanged} item${result.unchanged === 1 ? "" : "s"} already up to date.`;
 }
 if (parts.length === 0) return "No source changes this time.";
 return `${parts.join(", ")} across your sources.`;
}

function StatusDot({ status }: { status: ProviderUiStatus | FinalizeUiStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full transition-all duration-300",
        status === "completed"
          ? "bg-good/10 text-good"
          : status === "failed"
            ? "bg-danger/10 text-danger"
            : status === "cancelled"
              ? "text-muted"
              : status === "running"
                ? "text-accent"
                : "text-muted-soft"
      )}
    >
      {status === "completed" ? (
        <svg viewBox="0 0 10 10" className="size-2.5 fill-none stroke-current" strokeWidth="1.8">
          <path d="M1.5 5.5 4 8l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === "running" ? (
        <span className="size-3 animate-spin rounded-full border-2 border-accent/25 border-t-accent motion-reduce:animate-none" />
      ) : status === "failed" ? (
        <span className="text-[10px] font-bold leading-none">!</span>
      ) : (
        <span className="size-1.5 rounded-full bg-current opacity-50" />
      )}
    </span>
  );
}

function ProgressRow({
 label,
 status,
 detail,
}: {
 label: string;
 status: ProviderUiStatus | FinalizeUiStatus;
 detail: string;
}) {
  const failed = status === "failed";
  const active = status === "running";
  const done = status === "completed";

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 transition-colors duration-300",
        active && "bg-accent/[0.045]"
      )}
    >
      <StatusDot status={status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-[13px] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-300",
              failed ? "text-danger" : done || active ? "text-foreground" : "text-muted-soft"
            )}
          >
            {label}
          </p>
          <span
            className={cn(
              "shrink-0 text-[10px] font-bold uppercase tracking-[0.08em]",
              failed
                ? "text-danger"
                : active
                  ? "text-accent"
                  : done
                    ? "text-good"
                    : "text-muted-soft"
            )}
          >
            {statusLabel(status)}
          </span>
        </div>
        {(active || failed) && detail ? (
          <p
            className={cn(
              "mt-0.5 truncate text-[11px] leading-snug",
              failed ? "text-danger/90" : "text-muted"
            )}
            title={detail}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </li>
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
 <div className="flex flex-col p-6 sm:p-7">
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
 () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
 );
 const [animationData, setAnimationData] = useState<ReturnType<typeof buildSyncAnimationData> | null>(
 () => {
 if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
 return null;
 }
 return buildSyncAnimationData(readSyncAnimationColors());
 }
 );

 useEffect(() => {
 const media = window.matchMedia("(prefers-reduced-motion: reduce)");
 const update = () => {
 setReducedMotion(media.matches);
 setAnimationData(media.matches ? null : buildSyncAnimationData(readSyncAnimationColors()));
 };
 media.addEventListener("change", update);
 return () => media.removeEventListener("change", update);
 }, []);

 if (reducedMotion || !animationData || mode !== "running") {
 return (
 <span
 aria-hidden
 className={cn(
 "flex size-14 shrink-0 items-center justify-center rounded-2xl border",
 mode === "success" && "border-good/40 bg-good/10 text-good",
 mode === "warning" && "border-warm/40 bg-warm/10 text-warm",
 mode === "failed" && "border-danger/40 bg-danger/10 text-danger",
 (mode === "idle" || mode === "running") && "border-accent/20 bg-accent/5 text-accent"
 )}
 >
 {mode === "success" || mode === "warning" ? (
 <svg viewBox="0 0 20 20" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
 <path d="M4 10.5 8.5 15 16 5.5" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 ) : mode === "failed" ? (
 <span className="font-display text-lg font-semibold leading-none">!</span>
 ) : (
 <span className={cn("size-2 rounded-full bg-current", running && "animate-pulse motion-reduce:animate-none")} />
 )}
 </span>
 );
 }

 return (
 <div aria-hidden className="size-14 shrink-0 overflow-hidden">
 <Lottie animationData={animationData} loop={running} autoplay={running} />
 </div>
 );
}

function SyncOverlay({
 providerItems,
 finalizeStatus,
 syncRunStatus,
 networkError,
 cancelRequested,
 result,
 onCancelRequested,
 onClose,
}: {
 providerItems: ProviderProgressItem[];
 finalizeStatus: FinalizeUiStatus;
 syncRunStatus: string | null;
 networkError: string | null;
 cancelRequested: boolean;
 result: SyncResult | null;
 onCancelRequested: () => void;
 onClose: () => void;
}) {
 const headline = overlayHeadline(syncRunStatus);
 const stepLine = overlayStepLine(providerItems, finalizeStatus);
 const progress = result ? 1 : overlayProgress(providerItems, finalizeStatus);
 const showFinalize = finalizeStatus !== "hidden";

 const showCancelAction =
 !result && !cancelRequested && syncRunStatus !== "cancelled" && syncRunStatus !== "cancelling";

 const animationMode: SyncAnimationMode = result
 ? result.status === "completed"
 ? "success"
 : result.status === "partially_completed"
 ? "warning"
 : result.status === "failed" || result.status === "cancelled"
 ? "failed"
 : "idle"
 : syncRunStatus === "running" || syncRunStatus === "cancelling"
 ? "running"
 : "idle";

 return (
 <aside
 className="fixed inset-x-3 bottom-3 z-40 max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[1.75rem] border border-border/90 bg-surface/95 backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[27.5rem]"
 aria-label={result ? resultHeadline(result.status) : headline}
 aria-live="polite"
 >
 {result ? (
 <SyncResultView result={result} onClose={onClose} />
 ) : (
 <>
 <div className="p-5 pb-4 sm:p-6 sm:pb-5">
 <div className="flex items-center gap-4">
 <SyncActivityAnimation mode={animationMode} />
 <div className="min-w-0 flex-1">
 <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
 Live source update
 </p>
 <p className="mt-1 font-display text-xl font-semibold tracking-[-0.035em] text-foreground">
 {headline}
 </p>
 </div>
 <span className="rounded-full bg-accent-soft-surface px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-accent">
 {Math.round(progress * 100)}%
 </span>
 </div>

 <div className="mt-5 flex items-center justify-between gap-4">
 <p className={cn("truncate text-xs font-medium", networkError ? "text-danger" : "text-muted")}>
 {networkError ?? stepLine}
 </p>
 <span className="shrink-0 text-[11px] tabular-nums text-muted-soft">
 {providerItems.filter((item) => item.status === "completed").length}/{providerItems.length}
 </span>
 </div>
 <div
 className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-soft ring-1 ring-inset ring-border/40"
 role="progressbar"
 aria-valuemin={0}
 aria-valuemax={100}
 aria-valuenow={Math.round(progress * 100)}
 >
 <div
 className={cn(
 "h-full rounded-full transition-[width] duration-700 ease-out",
 networkError
 ? "bg-danger/70"
 : "bg-[linear-gradient(90deg,var(--action-primary),var(--accent),var(--sky))]"
 )}
 style={{ width: `${Math.round(progress * 100)}%` }}
 />
 </div>
 </div>

 <section className="mx-3 mb-3 rounded-[1.15rem] border border-border/80 bg-surface-soft/70 sm:mx-4 sm:mb-4">
 <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
 <p className="text-[11px] font-semibold tracking-[-0.01em] text-muted">
 Checking {providerItems.length} source{providerItems.length === 1 ? "" : "s"}
 </p>
 </div>
 <ul className="pb-1.5">
 {providerItems.map((item) => (
 <ProgressRow key={item.id} label={item.label} status={item.status} detail={item.detail} />
 ))}
 {showFinalize ? (
 <ProgressRow
 label="Today’s briefing"
 status={finalizeStatus}
 detail={
 finalizeStatus === "running"
 ? "Turning fresh signals into your prioritized queue…"
 : finalizeStatus === "completed"
 ? "Priority queue and briefing refreshed"
 : finalizeStatus === "failed"
 ? "Could not finish queue or briefing"
 : "Starts after all sources are checked"
 }
 />
 ) : null}
 </ul>
 </section>

 <div className="border-t border-border/70 px-5 py-3 sm:px-6">
 {showCancelAction ? (
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="mx-auto flex text-xs text-muted hover:text-foreground"
 onClick={onCancelRequested}
 >
 Stop update
 </Button>
 ) : cancelRequested ? (
 <p className="text-center text-xs text-muted" role="status">
 Finishing in-flight requests before stopping…
 </p>
 ) : null}
 </div>
 </>
 )}
 </aside>
 );
}

async function requestPersistedCancel(syncRunId: number): Promise<void> {
 const res = await fetch(`/api/day/sync/${syncRunId}/cancel`, { method: "POST" });
 const data = (await res.json()) as { error?: string };
 if (!res.ok) {
 throw new Error(data.error ?? "Could not request sync cancellation.");
 }
}

async function pollSyncRun(
 syncRunId: number,
 onUpdate: (status: SyncStatusResponse) => void,
 onNetworkError: (message: string | null) => void
): Promise<SyncStatusResponse> {
 let consecutiveErrors = 0;

 while (true) {
 try {
 const res = await fetch(`/api/day/sync/${syncRunId}`);
 const data = (await res.json()) as SyncStatusResponse;
 if (!res.ok) {
 throw new Error(data.error ?? "Could not read sync status.");
 }
 consecutiveErrors = 0;
 onNetworkError(null);
 onUpdate(data);
 if (data.progress?.isTerminal || TERMINAL_SYNC_STATUSES.has(data.syncRun.status)) {
 return data;
 }
 } catch {
 consecutiveErrors += 1;
 onNetworkError("Connection lost. Retrying…");
 if (consecutiveErrors >= 8) {
 throw new Error("Could not reach sync status. Check your connection and try again.");
 }
 }

 await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
 }
}

function syncStateLabel(sourceCount: number, lastSyncAt: string | null): string {
 const healthy =
 sourceCount > 0
 ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} healthy`
 : "No sources connected";
 if (!lastSyncAt) return healthy;
 const time = new Date(lastSyncAt);
 if (Number.isNaN(time.getTime())) return healthy;
 return `${healthy} · synced ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function SyncMyDayButton({
 sources = [],
 lastSyncAt = null,
}: {
 sources?: string[];
 lastSyncAt?: string | null;
}) {
 const router = useRouter();
 const [status, setStatus] = useState<"idle" | "syncing">("idle");
 const [summary, setSummary] = useState<string | null>(null);
 const [issues, setIssues] = useState<SyncIssue[]>([]);
 const [whatsNew, setWhatsNew] = useState<SyncWhatsNew | null>(null);
 const [liveStatus, setLiveStatus] = useState<SyncStatusResponse | null>(null);
 const [networkError, setNetworkError] = useState<string | null>(null);
 const [cancelRequested, setCancelRequested] = useState(false);
 const [result, setResult] = useState<SyncResult | null>(null);
 const cancelRequestInFlightRef = useRef(false);
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

 const requestCancel = useCallback(async () => {
 const stored = sessionStorage.getItem(ACTIVE_SYNC_RUN_KEY);
 if (!stored || cancelRequestInFlightRef.current) return;

 const syncRunId = Number(stored);
 if (!Number.isFinite(syncRunId)) return;

 cancelRequestInFlightRef.current = true;
 setCancelRequested(true);
 setNetworkError(null);

 try {
 await requestPersistedCancel(syncRunId);
 } catch (error) {
 cancelRequestInFlightRef.current = false;
 setCancelRequested(false);
 setNetworkError(
 error instanceof Error ? error.message : "Could not request sync cancellation."
 );
 }
 }, []);

 const closeResult = useCallback(() => {
 setResult(null);
 setStatus("idle");
 setLiveStatus(null);
 setCancelRequested(false);
 }, []);

 const runSync = useCallback(
 async (existingSyncRunId?: number) => {
 setStatus("syncing");
 setResult(null);
 setSummary(null);
 setIssues([]);
 setWhatsNew(null);
 setNetworkError(null);
 setLiveStatus(null);
 setCancelRequested(false);
 cancelRequestInFlightRef.current = false;

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

 sessionStorage.setItem(ACTIVE_SYNC_RUN_KEY, String(activeSyncRunId));

 const finalStatus = await pollSyncRun(
 activeSyncRunId,
 (snapshot) => {
 setLiveStatus(snapshot);
 if (
 snapshot.syncRun.status === "cancelling" ||
 snapshot.syncRun.status === "cancelled"
 ) {
 setCancelRequested(true);
 }
 },
 (message) => setNetworkError(message)
 );

 setLiveStatus(finalStatus);
 // Let the progress bar visibly reach the end before swapping views.
 await new Promise((resolve) => setTimeout(resolve, 450));

 const { successParts, syncIssues } = buildCompletionSummary(finalStatus);
 const dedupedIssues = dedupeSyncIssues(syncIssues);

 setSummary(
 finalStatus.syncRun.status === "cancelled"
 ? null
 : successParts.length > 0
 ? successParts.join(" ")
 : null
 );
 setIssues(finalStatus.syncRun.status === "cancelled" ? [] : dedupedIssues);

 if (finalStatus.whatsNew?.hasNew) {
 setWhatsNew(finalStatus.whatsNew);
 }

 setResult({
 status: finalStatus.syncRun.status,
 created: finalStatus.providerRuns.reduce((sum, entry) => sum + entry.itemsCreated, 0),
 updated: finalStatus.providerRuns.reduce((sum, entry) => sum + entry.itemsUpdated, 0),
 unchanged: finalStatus.providerRuns.reduce((sum, entry) => sum + entry.itemsUnchanged, 0),
 issues: finalStatus.syncRun.status === "cancelled" ? [] : dedupedIssues,
 });

 clearActiveSyncRun();
 if (finalStatus.syncRun.status !== "cancelled") {
 // Refresh while the result view is open so the page behind is
 // already up to date when the user closes it.
 router.refresh();
 }
 } catch (err) {
 clearActiveSyncRun();
 setStatus("idle");
 setSummary(null);
 const message = err instanceof Error ? err.message : "Sync failed.";
 const failureIssues = dedupeSyncIssues([humanizeSyncIssue(message)]);
 setIssues(failureIssues);
 showSyncIssueToasts(failureIssues, router);
 } finally {
 cancelRequestInFlightRef.current = false;
 }
 },
 [clearActiveSyncRun, router]
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
 syncRunStatus={liveStatus?.syncRun.status ?? "running"}
 networkError={networkError}
 cancelRequested={cancelRequested}
 result={result}
 onCancelRequested={() => void requestCancel()}
 onClose={closeResult}
 />
 ) : null}
 <div className="flex items-center gap-4">
 <span className="hidden items-center gap-2.5 whitespace-nowrap text-sm text-muted md:flex">
 <span className="health-dot" aria-hidden />
 {status === "syncing"
 ? "Syncing connected sources…"
 : syncStateLabel(sources.length, lastSyncAt)}
 </span>
 <Button
 type="button"
 size="lg"
 className={cn(
 status === "syncing"
 ? "sync-sweeping border border-border-strong text-foreground"
 : ""
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
 </div>
 {summary ? (
 <p className="max-w-lg text-[14px] leading-relaxed text-muted" role="status">
 {summary}
 </p>
 ) : null}
 {issues.length > 0 ? (
 <details className="max-w-lg rounded-xl border border-danger/20 bg-danger/5">
 <summary className="cursor-pointer list-none px-3 py-2 text-[14px] font-semibold text-danger">
 {issues.length === 1 ? "1 sync issue" : `${issues.length} sync issues`}
 </summary>
 <ul className="space-y-4 border-t border-danger/15 px-3 py-3">
 {issues.map((issue) => (
 <li key={issue.id}>
 <p className="text-[14px] font-medium leading-snug">{issue.label}</p>
 <p className="mt-1 text-[14px] leading-relaxed text-muted">{issue.detail}</p>
 {issue.href ? (
 <Link
 href={issue.href}
 className="mt-2 inline-block text-[14px] text-accent underline-offset-2 hover:underline"
 >
 {issue.hrefLabel ?? "Open"}
 </Link>
 ) : null}
 </li>
 ))}
 </ul>
 </details>
 ) : null}
 {whatsNew ? <SyncWhatsNewPanel whatsNew={whatsNew} /> : null}
 </div>
 );
}
