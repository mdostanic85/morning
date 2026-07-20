import type { SyncRunStatus } from "@/domain/syncRun";

export type SyncRunCompletionStatus = Extract<
  SyncRunStatus,
  "completed" | "partially_completed" | "failed"
>;

/**
 * Derives the terminal status of a non-cancelled sync run.
 *
 * - `failed` — the queue rebuild failed and every provider failed too;
 *   nothing useful was produced.
 * - `partially_completed` — at least one provider, the rebuild, or the
 *   briefing failed, but some work succeeded.
 * - `completed` — everything succeeded.
 */
export function deriveSyncRunCompletionStatus(input: {
  providerCount: number;
  failedProviderCount: number;
  rebuildOk: boolean;
  briefingOk: boolean;
}): SyncRunCompletionStatus {
  const { providerCount, failedProviderCount, rebuildOk, briefingOk } = input;

  if (!rebuildOk && failedProviderCount === providerCount) {
    return "failed";
  }
  if (failedProviderCount > 0 || !rebuildOk || !briefingOk) {
    return "partially_completed";
  }
  return "completed";
}
