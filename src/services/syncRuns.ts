import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { syncProviderRuns, syncRuns } from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning } from "@/db/query";
import type {
  SyncProviderRun,
  SyncProviderRunMetrics,
  SyncRun,
  SyncRunMode,
  SyncRunStatus,
  SyncRunTrigger,
} from "@/domain/syncRun";

function nowIso(): string {
  return new Date().toISOString();
}

function toSyncRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    userId: row.userId ?? null,
    trigger: row.trigger,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    cancelRequestedAt: row.cancelRequestedAt ?? null,
    errorSummary: row.errorSummary ?? null,
    whatsNew: row.whatsNew ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSyncProviderRun(row: typeof syncProviderRuns.$inferSelect): SyncProviderRun {
  return {
    id: row.id,
    syncRunId: row.syncRunId,
    provider: row.provider,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    itemsFetched: row.itemsFetched,
    itemsCreated: row.itemsCreated,
    itemsUpdated: row.itemsUpdated,
    itemsUnchanged: row.itemsUnchanged,
    itemsFailed: row.itemsFailed,
    itemsExtractionFailed: row.itemsExtractionFailed,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

export async function createSyncRun(input: {
  userId?: number | null;
  trigger: SyncRunTrigger;
  mode: SyncRunMode;
}): Promise<SyncRun> {
  const startedAt = nowIso();
  const [row] = await fetchReturning(
    db
      .insert(syncRuns)
      .values({
        userId: input.userId ?? null,
        trigger: input.trigger,
        mode: input.mode,
        status: "running",
        startedAt,
      })
      .returning()
  );
  return toSyncRun(row);
}

export async function startSyncProviderRun(input: {
  syncRunId: number;
  provider: string;
}): Promise<SyncProviderRun> {
  const [row] = await fetchReturning(
    db
      .insert(syncProviderRuns)
      .values({
        syncRunId: input.syncRunId,
        provider: input.provider,
        status: "running",
        startedAt: nowIso(),
      })
      .returning()
  );
  return toSyncProviderRun(row);
}

export async function completeSyncProviderRun(
  id: number,
  metrics: SyncProviderRunMetrics
): Promise<SyncProviderRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncProviderRuns)
      .set({
        status: "completed",
        completedAt: nowIso(),
        itemsFetched: metrics.itemsFetched,
        itemsCreated: metrics.itemsCreated,
        itemsUpdated: metrics.itemsUpdated,
        itemsUnchanged: metrics.itemsUnchanged,
        itemsFailed: metrics.itemsFailed,
        itemsExtractionFailed: metrics.itemsExtractionFailed,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(syncProviderRuns.id, id))
      .returning()
  );
  return row ? toSyncProviderRun(row) : null;
}

/**
 * Records a provider whose sync succeeded but not cleanly (WL-01): items
 * failed to persist, or persisted but failed extraction/knowledge/embedding.
 * Distinct from `completeSyncProviderRun` — this must never leave a provider
 * marked "completed" while it carries failures.
 */
export async function partialSyncProviderRun(
  id: number,
  input: { metrics: SyncProviderRunMetrics; errorMessage: string }
): Promise<SyncProviderRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncProviderRuns)
      .set({
        status: "failed",
        completedAt: nowIso(),
        itemsFetched: input.metrics.itemsFetched,
        itemsCreated: input.metrics.itemsCreated,
        itemsUpdated: input.metrics.itemsUpdated,
        itemsUnchanged: input.metrics.itemsUnchanged,
        itemsFailed: input.metrics.itemsFailed,
        itemsExtractionFailed: input.metrics.itemsExtractionFailed,
        errorCode: "partial_failure",
        errorMessage: input.errorMessage,
      })
      .where(eq(syncProviderRuns.id, id))
      .returning()
  );
  return row ? toSyncProviderRun(row) : null;
}

export async function cancelSyncProviderRun(
  id: number,
  partialMetrics?: SyncProviderRunMetrics
): Promise<SyncProviderRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncProviderRuns)
      .set({
        status: "cancelled",
        completedAt: nowIso(),
        errorCode: "cancelled",
        errorMessage:
          "Sync cancelled. Any in-flight external requests may still complete.",
        ...(partialMetrics
          ? {
              itemsFetched: partialMetrics.itemsFetched,
              itemsCreated: partialMetrics.itemsCreated,
              itemsUpdated: partialMetrics.itemsUpdated,
              itemsUnchanged: partialMetrics.itemsUnchanged,
              itemsFailed: partialMetrics.itemsFailed,
              itemsExtractionFailed: partialMetrics.itemsExtractionFailed,
            }
          : {}),
      })
      .where(and(eq(syncProviderRuns.id, id), eq(syncProviderRuns.status, "running")))
      .returning()
  );
  return row ? toSyncProviderRun(row) : null;
}

export async function cancelRunningSyncProviderRuns(syncRunId: number): Promise<void> {
  const runs = await listSyncProviderRuns(syncRunId);
  await Promise.all(
    runs.filter((run) => run.status === "running").map((run) => cancelSyncProviderRun(run.id))
  );
}

const TERMINAL_SYNC_STATUSES = new Set<SyncRunStatus>([
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);

export async function requestSyncRunCancel(id: number): Promise<SyncRun | null> {
  const existing = await getSyncRunById(id);
  if (!existing) return null;
  if (TERMINAL_SYNC_STATUSES.has(existing.status)) return existing;
  if (existing.cancelRequestedAt || existing.status === "cancelling") return existing;

  const [row] = await fetchReturning(
    db
      .update(syncRuns)
      .set({
        cancelRequestedAt: nowIso(),
        status: "cancelling",
        updatedAt: nowIso(),
      })
      .where(eq(syncRuns.id, id))
      .returning()
  );
  return row ? toSyncRun(row) : null;
}

export async function finalizeCancelledSyncRun(
  id: number,
  errorSummary: string
): Promise<SyncRun | null> {
  await cancelRunningSyncProviderRuns(id);
  return finalizeSyncRun({
    id,
    status: "cancelled",
    errorSummary,
  });
}

export async function failSyncProviderRun(
  id: number,
  input: {
    errorCode: string;
    errorMessage: string;
    metrics?: Partial<SyncProviderRunMetrics>;
  }
): Promise<SyncProviderRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncProviderRuns)
      .set({
        status: "failed",
        completedAt: nowIso(),
        itemsFetched: input.metrics?.itemsFetched ?? 0,
        itemsCreated: input.metrics?.itemsCreated ?? 0,
        itemsUpdated: input.metrics?.itemsUpdated ?? 0,
        itemsUnchanged: input.metrics?.itemsUnchanged ?? 0,
        itemsFailed: input.metrics?.itemsFailed ?? 0,
        itemsExtractionFailed: input.metrics?.itemsExtractionFailed ?? 0,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      })
      .where(eq(syncProviderRuns.id, id))
      .returning()
  );
  return row ? toSyncProviderRun(row) : null;
}

export async function finalizeSyncRun(input: {
  id: number;
  status: SyncRunStatus;
  errorSummary?: string | null;
  whatsNew?: string | null;
}): Promise<SyncRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncRuns)
      .set({
        status: input.status,
        completedAt: nowIso(),
        errorSummary: input.errorSummary ?? null,
        whatsNew: input.whatsNew ?? null,
        updatedAt: nowIso(),
      })
      .where(eq(syncRuns.id, input.id))
      .returning()
  );
  return row ? toSyncRun(row) : null;
}

export async function getSyncRunById(id: number): Promise<SyncRun | null> {
  const row = await fetchOne(db.select().from(syncRuns).where(eq(syncRuns.id, id)));
  return row ? toSyncRun(row) : null;
}

export async function listSyncProviderRuns(syncRunId: number): Promise<SyncProviderRun[]> {
  const rows = await fetchAll(
    db.select().from(syncProviderRuns).where(eq(syncProviderRuns.syncRunId, syncRunId))
  );
  return rows.map(toSyncProviderRun);
}

export interface LatestSyncRunSummary {
  run: SyncRun;
  providerRuns: SyncProviderRun[];
}

/** Most recent finished sync run with its per-provider results, for the Today page. */
export async function getLatestFinishedSyncRun(): Promise<LatestSyncRunSummary | null> {
  const row = await fetchOne(
    db
      .select()
      .from(syncRuns)
      .where(inArray(syncRuns.status, [...TERMINAL_SYNC_STATUSES]))
      .orderBy(desc(syncRuns.id))
      .limit(1)
  );
  if (!row) return null;
  const run = toSyncRun(row);
  const providerRuns = await listSyncProviderRuns(run.id);
  return { run, providerRuns };
}
