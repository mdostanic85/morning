import "server-only";

import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { syncProviderRuns, syncRuns } from "@/db/tables";
import {
  execute,
  fetchAll,
  fetchOne,
  fetchReturning,
  withTransaction,
} from "@/db/query";
import type {
  SyncProviderRun,
  SyncProviderRunMetrics,
  SyncRun,
  SyncRunMode,
  SyncRunStatus,
  SyncRunTrigger,
} from "@/domain/syncRun";
import {
  planTerminalSyncFailure,
  type SyncFailurePhase,
} from "@/lib/imports/syncRunCompletion";

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

async function preserveCancelledProviderMetrics(
  id: number,
  metrics: Partial<SyncProviderRunMetrics>
): Promise<SyncProviderRun | null> {
  const [row] = await fetchReturning(
    db
      .update(syncProviderRuns)
      .set({
        itemsFetched: metrics.itemsFetched,
        itemsCreated: metrics.itemsCreated,
        itemsUpdated: metrics.itemsUpdated,
        itemsUnchanged: metrics.itemsUnchanged,
        itemsFailed: metrics.itemsFailed,
        itemsExtractionFailed: metrics.itemsExtractionFailed,
      })
      .where(
        and(
          eq(syncProviderRuns.id, id),
          eq(syncProviderRuns.status, "cancelled")
        )
      )
      .returning()
  );
  return row ? toSyncProviderRun(row) : null;
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
      .where(and(eq(syncProviderRuns.id, id), eq(syncProviderRuns.status, "running")))
      .returning()
  );
  if (row) return toSyncProviderRun(row);
  return preserveCancelledProviderMetrics(id, metrics);
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
      .where(and(eq(syncProviderRuns.id, id), eq(syncProviderRuns.status, "running")))
      .returning()
  );
  if (row) return toSyncProviderRun(row);
  return preserveCancelledProviderMetrics(id, input.metrics);
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
      .where(and(eq(syncProviderRuns.id, id), eq(syncProviderRuns.status, "running")))
      .returning()
  );
  if (row) return toSyncProviderRun(row);
  if (!input.metrics) return null;
  return preserveCancelledProviderMetrics(id, input.metrics);
}

function providerTerminalStateForParent(status: SyncRunStatus): {
  status: Extract<SyncProviderRun["status"], "failed" | "cancelled">;
  errorCode: string;
  errorMessage: string;
} | null {
  if (status === "cancelled") {
    return {
      status: "cancelled",
      errorCode: "cancelled",
      errorMessage:
        "Sync cancelled. Any in-flight external requests may still complete.",
    };
  }
  if (status === "failed") {
    return {
      status: "failed",
      errorCode: "workflow_failure",
      errorMessage:
        "This source did not finish because the sync stopped. Try syncing again.",
    };
  }
  if (status === "completed" || status === "partially_completed") {
    return {
      status: "failed",
      errorCode: "incomplete_attempt",
      errorMessage:
        "This source attempt did not finish before the sync ended. Try syncing again.",
    };
  }
  return null;
}

export async function finalizeSyncRun(input: {
  id: number;
  status: SyncRunStatus;
  errorSummary?: string | null;
  whatsNew?: string | null;
}): Promise<SyncRun | null> {
  const completedAt = nowIso();

  return withTransaction(async (tx) => {
    const [updated] = await fetchReturning(
      tx
        .update(syncRuns)
        .set({
          status: input.status,
          completedAt,
          errorSummary: input.errorSummary ?? null,
          whatsNew: input.whatsNew ?? null,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(syncRuns.id, input.id),
            inArray(syncRuns.status, ["running", "cancelling"])
          )
        )
        .returning()
    );
    const persisted =
      updated ??
      (await fetchOne(
        tx.select().from(syncRuns).where(eq(syncRuns.id, input.id))
      ));
    if (!persisted) return null;

    const providerTerminalState = providerTerminalStateForParent(
      persisted.status
    );
    if (providerTerminalState) {
      await execute(
        tx
          .update(syncProviderRuns)
          .set({
            ...providerTerminalState,
            completedAt,
          })
          .where(
            and(
              eq(syncProviderRuns.syncRunId, input.id),
              eq(syncProviderRuns.status, "running")
            )
          )
      );
    }

    return toSyncRun(persisted);
  });
}

/**
 * Terminalizes an exhausted workflow failure and every started provider row
 * in one database transaction. The update is monotonic and safe to replay:
 * completed/partially-completed runs are never downgraded, while a duplicate
 * failure can still repair running provider rows attached to an already
 * failed/cancelled parent.
 */
export async function finalizeFailedSyncRun(input: {
  id: number;
  phase: SyncFailurePhase;
  completedAt?: string;
}): Promise<SyncRun | null> {
  const completedAt = input.completedAt ?? nowIso();

  return withTransaction(async (tx) => {
    let runRow = await fetchOne(
      tx.select().from(syncRuns).where(eq(syncRuns.id, input.id))
    );
    if (!runRow) return null;

    const providerRows = await fetchAll(
      tx
        .select()
        .from(syncProviderRuns)
        .where(eq(syncProviderRuns.syncRunId, input.id))
    );
    const makePlan = (currentRunRow: typeof syncRuns.$inferSelect) =>
      planTerminalSyncFailure({
        run: {
          status: currentRunRow.status,
          cancelRequestedAt: currentRunRow.cancelRequestedAt ?? null,
          completedAt: currentRunRow.completedAt ?? null,
          errorSummary: currentRunRow.errorSummary ?? null,
        },
        providerRuns: providerRows.map((providerRun) => ({
          id: providerRun.id,
          status: providerRun.status,
          completedAt: providerRun.completedAt ?? null,
          errorCode: providerRun.errorCode ?? null,
          errorMessage: providerRun.errorMessage ?? null,
        })),
        phase: input.phase,
        completedAt,
      });
    let plan = makePlan(runRow);

    if (runRow.status === "running" || runRow.status === "cancelling") {
      const [updated] = await fetchReturning(
        tx
          .update(syncRuns)
          .set({
            status: plan.syncRun.status,
            completedAt: plan.syncRun.completedAt,
            errorSummary: plan.syncRun.errorSummary,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(syncRuns.id, input.id),
              inArray(syncRuns.status, ["running", "cancelling"])
            )
          )
          .returning()
      );

      if (updated) {
        runRow = updated;
      } else {
        const current = await fetchOne(
          tx.select().from(syncRuns).where(eq(syncRuns.id, input.id))
        );
        if (!current) return null;
        runRow = current;
      }
    }

    plan = makePlan(runRow);
    const providerTransition = plan.providerRuns.find(
      (providerRun) =>
        providerRows.some(
          (persistedProvider) =>
            persistedProvider.id === providerRun.id &&
            persistedProvider.status === "running"
        ) && providerRun.status !== "running"
    );
    if (providerTransition) {
      await execute(
        tx
          .update(syncProviderRuns)
          .set({
            status: providerTransition.status,
            completedAt: providerTransition.completedAt,
            errorCode: providerTransition.errorCode,
            errorMessage: providerTransition.errorMessage,
          })
          .where(
            and(
              eq(syncProviderRuns.syncRunId, input.id),
              eq(syncProviderRuns.status, "running")
            )
          )
      );
    }

    return toSyncRun(runRow);
  });
}

export const STALE_SYNC_RUN_AGE_MS = 24 * 60 * 60 * 1_000;
export const STALE_SYNC_RUN_BATCH_SIZE = 50;

/**
 * Repairs active sync rows whose workflow can no longer be expected to finish.
 * This is lifecycle recovery only: it neither prevents nor deduplicates new
 * sync events. The conservative age bound avoids treating a slow live workflow
 * as stale in the absence of a heartbeat.
 */
export async function recoverStaleSyncRuns(
  options: {
    now?: Date;
    staleAfterMs?: number;
    limit?: number;
  } = {}
): Promise<{ candidateCount: number; recoveredIds: number[] }> {
  const now = options.now ?? new Date();
  const staleAfterMs = Math.max(1, options.staleAfterMs ?? STALE_SYNC_RUN_AGE_MS);
  const limit = Math.min(
    100,
    Math.max(1, options.limit ?? STALE_SYNC_RUN_BATCH_SIZE)
  );
  const cutoff = new Date(now.getTime() - staleAfterMs).toISOString();
  const candidates = await fetchAll(
    db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(
        and(
          inArray(syncRuns.status, ["running", "cancelling"]),
          lte(syncRuns.startedAt, cutoff)
        )
      )
      .orderBy(syncRuns.id)
      .limit(limit)
  );

  const recoveredIds: number[] = [];
  for (const candidate of candidates) {
    const finalized = await finalizeFailedSyncRun({
      id: candidate.id,
      phase: "workflow",
      completedAt: now.toISOString(),
    });
    if (
      finalized?.status === "failed" ||
      finalized?.status === "cancelled"
    ) {
      recoveredIds.push(candidate.id);
    }
  }

  return {
    candidateCount: candidates.length,
    recoveredIds,
  };
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
