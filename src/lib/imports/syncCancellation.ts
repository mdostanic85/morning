import "server-only";

import { getSyncRunById } from "@/services/syncRuns";

export class SyncCancelledError extends Error {
  override name = "SyncCancelledError";

  constructor(message = "Sync cancelled.") {
    super(message);
  }
}

export type ShouldCancelSync = () => boolean | Promise<boolean>;

export async function isSyncRunCancellationRequested(syncRunId: number): Promise<boolean> {
  const syncRun = await getSyncRunById(syncRunId);
  if (!syncRun) return false;
  return Boolean(syncRun.cancelRequestedAt) || syncRun.status === "cancelling";
}

export async function assertSyncRunNotCancelled(syncRunId: number): Promise<void> {
  if (await isSyncRunCancellationRequested(syncRunId)) {
    throw new SyncCancelledError();
  }
}

export function shouldCancelFromSyncRunId(syncRunId: number): ShouldCancelSync {
  return () => isSyncRunCancellationRequested(syncRunId);
}
