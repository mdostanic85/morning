import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LatestSyncRunSummary } from "@/services/syncRuns";
import { deriveSyncFreshnessState } from "./SyncFreshnessBanner";

function syncSummary(
  overrides: Partial<LatestSyncRunSummary["run"]> & {
    providerRuns?: LatestSyncRunSummary["providerRuns"];
  }
): LatestSyncRunSummary {
  const { providerRuns = [], ...runOverrides } = overrides;
  return {
    run: {
      id: 1,
      userId: null,
      trigger: "manual",
      mode: "full",
      status: "completed",
      startedAt: "2026-07-22T08:00:00.000Z",
      completedAt: "2026-07-22T08:05:00.000Z",
      cancelRequestedAt: null,
      errorSummary: null,
      whatsNew: null,
      createdAt: "2026-07-22T08:00:00.000Z",
      updatedAt: "2026-07-22T08:05:00.000Z",
      ...runOverrides,
    },
    providerRuns,
  };
}

function providerRun(provider: string, status: "completed" | "failed" | "cancelled") {
  return {
    id: 1,
    syncRunId: 1,
    provider,
    status,
    startedAt: "2026-07-22T08:00:00.000Z",
    completedAt: "2026-07-22T08:05:00.000Z",
    itemsFetched: 1,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 1,
    itemsFailed: 0,
    itemsExtractionFailed: 0,
    errorCode: status === "completed" ? null : "provider_error",
    errorMessage: status === "completed" ? null : "Provider failed",
  };
}

describe("deriveSyncFreshnessState", () => {
  it("returns no warnings for a fully successful run", () => {
    const state = deriveSyncFreshnessState(
      syncSummary({
        status: "completed",
        providerRuns: [providerRun("jira", "completed"), providerRun("granola", "completed")],
      })
    );
    assert.equal(state.showPartialWarning, false);
    assert.equal(state.showBriefFailure, false);
    assert.deepEqual(state.partialSourceLabels, []);
  });

  it("flags partial sync when a provider failed", () => {
    const state = deriveSyncFreshnessState(
      syncSummary({
        status: "partially_completed",
        providerRuns: [providerRun("jira", "completed"), providerRun("granola", "failed")],
      })
    );
    assert.equal(state.showPartialWarning, true);
    assert.deepEqual(state.partialSourceLabels, ["Granola"]);
  });

  it("flags brief failure when sync completed but brief rebuild failed", () => {
    const state = deriveSyncFreshnessState(
      syncSummary({
        status: "completed",
        errorSummary: "Daily brief rebuild failed after sync",
        providerRuns: [providerRun("jira", "completed")],
      })
    );
    assert.equal(state.showBriefFailure, true);
    assert.equal(state.showPartialWarning, false);
  });
});
