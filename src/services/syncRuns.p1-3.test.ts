import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { postgresClient } from "@/db/connection";
import { syncProviderRuns, syncRuns } from "@/db/tables";
import { execute } from "@/db/query";
import { syncMyDay } from "@/inngest/functions/syncMyDay";
import { staleSyncRunRecovery } from "@/inngest/functions/recoverStaleSyncRuns";
import {
  cancelSyncProviderRun,
  completeSyncProviderRun,
  createSyncRun,
  failSyncProviderRun,
  finalizeFailedSyncRun,
  finalizeSyncRun,
  getSyncRunById,
  listSyncProviderRuns,
  partialSyncProviderRun,
  recoverStaleSyncRuns,
  requestSyncRunCancel,
  startSyncProviderRun,
} from "./syncRuns";

const createdSyncRunIds: number[] = [];
// Fixed clock keeps lifecycle timestamps deterministic.
const fixedNow = "2026-07-25T08:30:00.000Z";
const emptyMetrics = {
  itemsFetched: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsUnchanged: 0,
  itemsFailed: 0,
  itemsExtractionFailed: 0,
};
const completedMetrics = {
  itemsFetched: 12,
  itemsCreated: 5,
  itemsUpdated: 3,
  itemsUnchanged: 4,
  itemsFailed: 0,
  itemsExtractionFailed: 0,
};
const partialMetrics = {
  itemsFetched: 8,
  itemsCreated: 3,
  itemsUpdated: 1,
  itemsUnchanged: 2,
  itemsFailed: 1,
  itemsExtractionFailed: 1,
};
const failedMetrics = {
  itemsFetched: 4,
  itemsCreated: 1,
  itemsUpdated: 0,
  itemsUnchanged: 1,
  itemsFailed: 2,
  itemsExtractionFailed: 0,
};

type ProductionFailureHandler = (input: {
  event: {
    data: {
      event: {
        data: {
          syncRunId: number;
        };
      };
    };
  };
  error: Error;
}) => Promise<unknown>;

function getProductionFailureHandler(): ProductionFailureHandler {
  const handler = (
    syncMyDay as unknown as {
      onFailureFn?: ProductionFailureHandler;
    }
  ).onFailureFn;
  assert.ok(handler, "syncMyDay must register its production onFailure handler");
  return handler;
}

async function createTestRun() {
  const run = await createSyncRun({
    trigger: "manual",
    mode: "full",
  });
  createdSyncRunIds.push(run.id);
  return run;
}

after(async () => {
  try {
    if (createdSyncRunIds.length === 0) return;
    await execute(
      db
        .delete(syncProviderRuns)
        .where(inArray(syncProviderRuns.syncRunId, createdSyncRunIds))
    );
    await execute(
      db.delete(syncRuns).where(inArray(syncRuns.id, createdSyncRunIds))
    );
  } finally {
    await postgresClient.end();
  }
});

describe("syncRuns exhausted-failure integration (P1-3)", () => {
  it("registers bounded stale-run recovery without single-flight controls", () => {
    assert.deepEqual(staleSyncRunRecovery.opts.triggers, [
      { cron: "*/15 * * * *" },
    ]);
    assert.equal("concurrency" in staleSyncRunRecovery.opts, false);
    assert.equal("idempotency" in staleSyncRunRecovery.opts, false);
    assert.equal("singleton" in staleSyncRunRecovery.opts, false);
  });

  it("invokes the production onFailure wiring with the original sync id and phase", async () => {
    const run = await createTestRun();
    const otherRun = await createTestRun();
    const handler = getProductionFailureHandler();

    await handler({
      event: {
        data: {
          event: {
            data: {
              syncRunId: run.id,
            },
          },
        },
      },
      error: new Error("Worklight sync phase failed: rebuild-queue."),
    });

    const persisted = await getSyncRunById(run.id);
    const untouched = await getSyncRunById(otherRun.id);
    assert.equal(persisted?.status, "failed");
    assert.match(persisted?.errorSummary ?? "", /today's plan/);
    assert.doesNotMatch(persisted?.errorSummary ?? "", /rebuild-queue/);
    assert.equal(untouched?.status, "running");
  });

  it("atomically terminalizes the parent and every running provider", async () => {
    const run = await createTestRun();
    const completedProvider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await completeSyncProviderRun(completedProvider.id, emptyMetrics);
    await startSyncProviderRun({
      syncRunId: run.id,
      provider: "gmail",
    });

    const finalized = await finalizeFailedSyncRun({
      id: run.id,
      phase: "backfill-sources",
      completedAt: fixedNow,
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(finalized?.status, "failed");
    assert.equal(finalized?.completedAt, fixedNow);
    assert.match(finalized?.errorSummary ?? "", /source content/);
    assert.deepEqual(
      providers.map((provider) => provider.status).sort(),
      ["completed", "failed"]
    );
    assert.equal(
      providers.find((provider) => provider.provider === "gmail")?.errorCode,
      "workflow_failure"
    );
  });

  it("is idempotent and repairs a running provider on duplicate failure delivery", async () => {
    const run = await createTestRun();
    await finalizeFailedSyncRun({
      id: run.id,
      phase: "rebuild-queue",
      completedAt: fixedNow,
    });
    const alreadyFailed = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "gmail",
    });
    await failSyncProviderRun(alreadyFailed.id, {
      errorCode: "config_error",
      errorMessage: "Existing provider failure.",
    });
    await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });

    const duplicate = await finalizeFailedSyncRun({
      id: run.id,
      phase: "post-sync-hooks",
      completedAt: "2026-07-25T08:31:00.000Z",
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(duplicate?.status, "failed");
    assert.equal(duplicate?.completedAt, fixedNow);
    assert.match(duplicate?.errorSummary ?? "", /today's plan/);
    assert.equal(
      providers.find((provider) => provider.provider === "gmail")?.errorCode,
      "config_error"
    );
    assert.equal(
      providers.find((provider) => provider.provider === "jira")?.errorCode,
      "workflow_failure"
    );
  });

  it("does not downgrade a completed run after a delayed failure callback", async () => {
    const run = await createTestRun();
    const provider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await completeSyncProviderRun(provider.id, emptyMetrics);
    await finalizeSyncRun({
      id: run.id,
      status: "completed",
      whatsNew: "{\"summary\":\"kept\"}",
    });

    await finalizeFailedSyncRun({
      id: run.id,
      phase: "rebuild-queue",
      completedAt: fixedNow,
    });
    const persisted = await getSyncRunById(run.id);
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(persisted?.status, "completed");
    assert.equal(persisted?.errorSummary, null);
    assert.equal(persisted?.whatsNew, "{\"summary\":\"kept\"}");
    assert.equal(providers[0]?.status, "completed");
  });

  it("closes only lingering provider attempts when a run completes", async () => {
    const run = await createTestRun();
    const completed = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await completeSyncProviderRun(completed.id, completedMetrics);
    const failed = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "gmail",
    });
    await failSyncProviderRun(failed.id, {
      errorCode: "config_error",
      errorMessage: "Existing configuration failure.",
    });
    const cancelled = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "calendar",
    });
    await cancelSyncProviderRun(cancelled.id);
    await startSyncProviderRun({
      syncRunId: run.id,
      provider: "github",
    });

    const finalized = await finalizeSyncRun({
      id: run.id,
      status: "completed",
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(finalized?.status, "completed");
    assert.equal(
      providers.find((provider) => provider.id === completed.id)?.status,
      "completed"
    );
    assert.equal(
      providers.find((provider) => provider.id === failed.id)?.errorCode,
      "config_error"
    );
    assert.equal(
      providers.find((provider) => provider.id === cancelled.id)?.status,
      "cancelled"
    );
    const lingering = providers.find(
      (provider) => provider.provider === "github"
    );
    assert.equal(lingering?.status, "failed");
    assert.equal(lingering?.errorCode, "incomplete_attempt");
  });

  it("closes a lingering provider attempt when a run partially completes", async () => {
    const run = await createTestRun();
    await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });

    const finalized = await finalizeSyncRun({
      id: run.id,
      status: "partially_completed",
      errorSummary: "One connected source could not be updated.",
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(finalized?.status, "partially_completed");
    assert.equal(providers[0]?.status, "failed");
    assert.equal(providers[0]?.errorCode, "incomplete_attempt");
  });

  it("keeps completion monotonic while preserving metrics in a cancellation race", async () => {
    const run = await createTestRun();
    const provider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await cancelSyncProviderRun(provider.id);

    const persisted = await completeSyncProviderRun(
      provider.id,
      completedMetrics
    );

    assert.equal(persisted?.status, "cancelled");
    assert.equal(persisted?.errorCode, "cancelled");
    assert.equal(persisted?.itemsFetched, completedMetrics.itemsFetched);
    assert.equal(persisted?.itemsCreated, completedMetrics.itemsCreated);
  });

  it("keeps partial failure monotonic while preserving metrics in a cancellation race", async () => {
    const run = await createTestRun();
    const provider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await cancelSyncProviderRun(provider.id);

    const persisted = await partialSyncProviderRun(provider.id, {
      metrics: partialMetrics,
      errorMessage: "One item failed.",
    });

    assert.equal(persisted?.status, "cancelled");
    assert.equal(persisted?.errorCode, "cancelled");
    assert.equal(persisted?.itemsFetched, partialMetrics.itemsFetched);
    assert.equal(
      persisted?.itemsExtractionFailed,
      partialMetrics.itemsExtractionFailed
    );
  });

  it("keeps failure monotonic while preserving available metrics in a cancellation race", async () => {
    const run = await createTestRun();
    const provider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await cancelSyncProviderRun(provider.id);

    const persisted = await failSyncProviderRun(provider.id, {
      errorCode: "sync_error",
      errorMessage: "Provider failed.",
      metrics: failedMetrics,
    });

    assert.equal(persisted?.status, "cancelled");
    assert.equal(persisted?.errorCode, "cancelled");
    assert.equal(persisted?.itemsFetched, failedMetrics.itemsFetched);
    assert.equal(persisted?.itemsFailed, failedMetrics.itemsFailed);
  });

  it("finishes a cancellation as cancelled rather than failed", async () => {
    const run = await createTestRun();
    await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await requestSyncRunCancel(run.id);

    const finalized = await finalizeFailedSyncRun({
      id: run.id,
      phase: "sync-provider",
      completedAt: fixedNow,
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(finalized?.status, "cancelled");
    assert.equal(providers[0]?.status, "cancelled");
    assert.equal(providers[0]?.errorCode, "cancelled");
  });

  it("uses the failure plan for provider cleanup on duplicate delivery", async () => {
    const run = await createTestRun();
    const provider = await startSyncProviderRun({
      syncRunId: run.id,
      provider: "jira",
    });
    await execute(
      db
        .update(syncRuns)
        .set({
          status: "failed",
          completedAt: fixedNow,
          cancelRequestedAt: "2026-07-25T08:29:00.000Z",
          errorSummary: "Original failure.",
        })
        .where(inArray(syncRuns.id, [run.id]))
    );

    await finalizeFailedSyncRun({
      id: run.id,
      phase: "post-sync-hooks",
      completedAt: "2026-07-25T08:31:00.000Z",
    });
    const providers = await listSyncProviderRuns(run.id);

    assert.equal(providers.find((entry) => entry.id === provider.id)?.status, "cancelled");
    assert.equal(
      providers.find((entry) => entry.id === provider.id)?.errorCode,
      "cancelled"
    );
  });

  it("recovers stale active runs after the immediate finalizer could not persist", async () => {
    const staleRunning = await createTestRun();
    const staleRunningProvider = await startSyncProviderRun({
      syncRunId: staleRunning.id,
      provider: "jira",
    });
    const staleCancelling = await createTestRun();
    const staleCancellingProvider = await startSyncProviderRun({
      syncRunId: staleCancelling.id,
      provider: "gmail",
    });
    await requestSyncRunCancel(staleCancelling.id);
    const recentRunning = await createTestRun();
    const alreadyCompleted = await createTestRun();
    await finalizeSyncRun({
      id: alreadyCompleted.id,
      status: "completed",
    });

    await execute(
      db
        .update(syncRuns)
        .set({ startedAt: "2020-07-25T14:00:00.000Z" })
        .where(
          inArray(syncRuns.id, [
            staleRunning.id,
            staleCancelling.id,
            alreadyCompleted.id,
          ])
        )
    );
    await execute(
      db
        .update(syncRuns)
        .set({ startedAt: "2020-07-25T15:59:30.000Z" })
        .where(inArray(syncRuns.id, [recentRunning.id]))
    );

    const recovery = await recoverStaleSyncRuns({
      now: new Date("2020-07-25T16:00:00.000Z"),
      staleAfterMs: 60_000,
      limit: 10,
    });
    const [
      recoveredFailure,
      recoveredCancellation,
      recent,
      completed,
    ] = await Promise.all([
      getSyncRunById(staleRunning.id),
      getSyncRunById(staleCancelling.id),
      getSyncRunById(recentRunning.id),
      getSyncRunById(alreadyCompleted.id),
    ]);
    const [failedProviders, cancelledProviders] = await Promise.all([
      listSyncProviderRuns(staleRunning.id),
      listSyncProviderRuns(staleCancelling.id),
    ]);

    assert.equal(recovery.candidateCount, 2);
    assert.deepEqual(
      recovery.recoveredIds.sort((a, b) => a - b),
      [staleRunning.id, staleCancelling.id].sort((a, b) => a - b)
    );
    assert.equal(recoveredFailure?.status, "failed");
    assert.equal(
      failedProviders.find((entry) => entry.id === staleRunningProvider.id)
        ?.status,
      "failed"
    );
    assert.equal(recoveredCancellation?.status, "cancelled");
    assert.equal(
      cancelledProviders.find(
        (entry) => entry.id === staleCancellingProvider.id
      )?.status,
      "cancelled"
    );
    assert.equal(recent?.status, "running");
    assert.equal(completed?.status, "completed");
  });
});
