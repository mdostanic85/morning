import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NonRetriableError,
  RetryAfterError,
  serializeError,
  StepError,
} from "inngest";
import {
  deriveSyncRunCompletionStatus,
  failurePhaseFromError,
  planTerminalSyncFailure,
  rebuildDiagnosticsFromResult,
  retryTerminalSyncFailureFinalization,
  runPlannerSummaryWrite,
  runSyncPhase,
} from "./syncRunCompletion";

describe("sync run completion status", () => {
  it("completed when all providers and briefing succeed", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 0,
        briefingOk: true,
      }),
      "completed"
    );
  });

  it("partially_completed when one provider fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 1,
        briefingOk: true,
      }),
      "partially_completed"
    );
  });

  it("partially_completed when only the briefing fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 0,
        briefingOk: false,
      }),
      "partially_completed"
    );
  });

  it("partially_completed when every provider fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 4,
        briefingOk: true,
      }),
      "partially_completed"
    );
  });

  it("completed when no providers are connected", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 0,
        briefingOk: true,
      }),
      "completed"
    );
  });
});

describe("terminal sync failure lifecycle (P1-3)", () => {
  it("accepts memoized rebuild output from before diagnostics existed", () => {
    const oldRebuildResult = {
      ok: true as const,
      updatedTaskCount: 3,
    };

    assert.deepEqual(rebuildDiagnosticsFromResult(oldRebuildResult), []);
    assert.equal(
      deriveSyncRunCompletionStatus({
        failedProviderCount: 0,
        briefingOk: true,
      }),
      "completed"
    );
  });

  const fixedNow = "2026-07-25T08:30:00.000Z";

  it("identifies failures before, during, and after provider execution by durable step id", () => {
    assert.equal(
      failurePhaseFromError({ stepId: "approve-pending" }),
      "approve-pending"
    );
    assert.equal(
      failurePhaseFromError({ stepId: "sync-provider-jira" }),
      "sync-provider"
    );
    assert.equal(
      failurePhaseFromError({ stepId: "backfill-sources" }),
      "backfill-sources"
    );
    assert.equal(
      failurePhaseFromError({ stepId: "rebuild-queue" }),
      "rebuild-queue"
    );
  });

  it("preserves the earliest known causal phase through wrapped errors", () => {
    assert.equal(
      failurePhaseFromError({
        stepId: "workflow",
        cause: { stepId: "import-linked-jira" },
      }),
      "import-linked-jira"
    );
  });

  it("preserves the causal phase through Inngest step and failure-event serialization", async () => {
    let taggedError: unknown;
    try {
      await runSyncPhase("rebuild-queue", async () => {
        throw new Error("database payload intentionally not asserted");
      });
    } catch (error) {
      taggedError = error;
    }

    const stepError = new StepError(
      "executor-step-id",
      serializeError(taggedError)
    );
    const failureEventError = serializeError(stepError);

    assert.equal(
      failurePhaseFromError(failureEventError),
      "rebuild-queue"
    );
    assert.doesNotMatch(failureEventError.message, /database payload/);
  });

  it("preserves Inngest retry-control errors without wrapping them", async () => {
    const nonRetriable = new NonRetriableError("do not retry");
    const retryAfter = new RetryAfterError("retry later", 5_000);

    await assert.rejects(
      runSyncPhase("rebuild-queue", async () => {
        throw nonRetriable;
      }),
      (error) => error === nonRetriable
    );
    await assert.rejects(
      runSyncPhase("rebuild-queue", async () => {
        throw retryAfter;
      }),
      (error) => error === retryAfter
    );
  });

  it("terminally fails an active run and all running provider rows", () => {
    const plan = planTerminalSyncFailure({
      run: {
        status: "running",
        cancelRequestedAt: null,
      },
      providerRuns: [
        { id: 10, status: "completed" },
        { id: 11, status: "running" },
        { id: 12, status: "failed" },
      ],
      phase: "backfill-sources",
      completedAt: fixedNow,
    });

    assert.equal(plan.syncRun.status, "failed");
    assert.equal(plan.syncRun.completedAt, fixedNow);
    assert.match(plan.syncRun.errorSummary ?? "", /source content/);
    assert.doesNotMatch(plan.syncRun.errorSummary ?? "", /backfill-sources/);
    assert.deepEqual(
      plan.providerRuns.map((run) => run.status),
      ["completed", "failed", "failed"]
    );
    assert.equal(plan.providerRuns[1]?.errorCode, "workflow_failure");
  });

  it("keeps cancellation distinct from exhausted failure", () => {
    const plan = planTerminalSyncFailure({
      run: {
        status: "cancelling",
        cancelRequestedAt: "2026-07-25T08:29:00.000Z",
      },
      providerRuns: [{ id: 20, status: "running" }],
      phase: "sync-provider",
      completedAt: fixedNow,
    });

    assert.equal(plan.syncRun.status, "cancelled");
    assert.equal(plan.providerRuns[0]?.status, "cancelled");
    assert.equal(plan.providerRuns[0]?.errorCode, "cancelled");
  });

  it("is idempotent for duplicate failure delivery and repairs a running provider", () => {
    const first = planTerminalSyncFailure({
      run: {
        status: "running",
        cancelRequestedAt: null,
      },
      providerRuns: [{ id: 30, status: "running" }],
      phase: "rebuild-queue",
      completedAt: fixedNow,
    });
    const second = planTerminalSyncFailure({
      run: {
        status: first.syncRun.status,
        cancelRequestedAt: null,
        completedAt: first.syncRun.completedAt,
        errorSummary: first.syncRun.errorSummary,
      },
      providerRuns: [{ id: 30, status: "running" }],
      phase: "post-sync-hooks",
      completedAt: "2026-07-25T08:31:00.000Z",
    });

    assert.deepEqual(second.syncRun, first.syncRun);
    assert.equal(second.providerRuns[0]?.status, "failed");
  });

  it("never downgrades an already successful run on delayed duplicate failure", () => {
    const plan = planTerminalSyncFailure({
      run: {
        status: "completed",
        cancelRequestedAt: null,
        completedAt: fixedNow,
        errorSummary: null,
      },
      providerRuns: [{ id: 40, status: "completed" }],
      phase: "rebuild-queue",
      completedAt: "2026-07-25T08:31:00.000Z",
    });

    assert.equal(plan.syncRun.status, "completed");
    assert.equal(plan.syncRun.completedAt, fixedNow);
    assert.equal(plan.syncRun.errorSummary, null);
    assert.equal(plan.providerRuns[0]?.status, "completed");
  });

  it("retries a transient finalization failure without changing the logical outcome", async () => {
    let attempts = 0;
    const result = await retryTerminalSyncFailureFinalization(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient database failure");
        return "failed" as const;
      },
      {
        attempts: 3,
        delay: async () => undefined,
      }
    );

    assert.equal(result, "failed");
    assert.equal(attempts, 2);
  });

  it("logs a planner-summary write failure without exposing implementation details", async () => {
    const result = await runPlannerSummaryWrite(async () => {
      throw new Error("injected filesystem failure");
    });

    assert.deepEqual(result, {
      ok: false,
      warning:
        "Planner summary could not be saved; the next sync will plan again.",
    });
  });
});
