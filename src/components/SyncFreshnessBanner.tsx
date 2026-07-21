import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { LatestSyncRunSummary } from "@/services/syncRuns";
import type { ConnectionProvider } from "@/lib/connectors/providers";

const CONNECTED_PROVIDER_LABEL: Record<ConnectionProvider, string> = {
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

export interface SyncFreshnessState {
  partialSourceLabels: string[];
  showPartialWarning: boolean;
  showBriefFailure: boolean;
}

export function deriveSyncFreshnessState(
  latestSync: LatestSyncRunSummary | null
): SyncFreshnessState {
  if (!latestSync) {
    return { partialSourceLabels: [], showPartialWarning: false, showBriefFailure: false };
  }

  const partialSourceLabels = latestSync.providerRuns
    .filter((run) => run.status === "failed" || run.status === "cancelled")
    .map(
      (run) => CONNECTED_PROVIDER_LABEL[run.provider as ConnectionProvider] ?? run.provider
    );

  const showPartialWarning =
    latestSync.run.status === "partially_completed" ||
    latestSync.run.status === "failed" ||
    latestSync.run.status === "cancelled" ||
    partialSourceLabels.length > 0;

  const showBriefFailure =
    latestSync.run.status === "completed" &&
    Boolean(latestSync.run.errorSummary?.toLowerCase().includes("brief"));

  return { partialSourceLabels, showPartialWarning, showBriefFailure };
}

export function SyncFreshnessBanner({
  freshness,
}: {
  freshness: SyncFreshnessState;
}) {
  if (!freshness.showPartialWarning && !freshness.showBriefFailure) return null;

  if (freshness.showBriefFailure) {
    return (
      <div className="brief-alert brief-alert-sync" role="status">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Sources updated, but Today did not refresh</p>
          <p className="mt-1 text-sm text-muted">
            Your existing priorities may be out of date.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/" className="link-btn-primary motion-btn">
              Rebuild Today
            </Link>
            <Link href="/sources" className="link-btn-outline motion-btn">
              Review sync issues
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="brief-alert brief-alert-sync" role="status">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Some sources did not update</p>
        <p className="mt-1 text-sm text-muted">
          {freshness.partialSourceLabels.join(", ")} could not be refreshed. This brief may use
          older evidence.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/sources" className="link-btn-outline motion-btn">
            Review sync issues
          </Link>
          <Link href="/" className="link-btn-primary motion-btn">
            Sync again
          </Link>
        </div>
      </div>
    </div>
  );
}
