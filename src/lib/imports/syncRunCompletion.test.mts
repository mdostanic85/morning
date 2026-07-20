import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveSyncRunCompletionStatus } from "./syncRunCompletion";

describe("sync run completion status", () => {
  it("completed when all providers, rebuild, and briefing succeed", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 5,
        failedProviderCount: 0,
        rebuildOk: true,
        briefingOk: true,
      }),
      "completed"
    );
  });

  it("partially_completed when one provider fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 5,
        failedProviderCount: 1,
        rebuildOk: true,
        briefingOk: true,
      }),
      "partially_completed"
    );
  });

  it("partially_completed when rebuild fails but some providers succeed", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 5,
        failedProviderCount: 2,
        rebuildOk: false,
        briefingOk: true,
      }),
      "partially_completed"
    );
  });

  it("partially_completed when only the briefing fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 3,
        failedProviderCount: 0,
        rebuildOk: true,
        briefingOk: false,
      }),
      "partially_completed"
    );
  });

  it("failed when every provider fails and rebuild fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 4,
        failedProviderCount: 4,
        rebuildOk: false,
        briefingOk: false,
      }),
      "failed"
    );
  });

  it("partially_completed when every provider fails but rebuild succeeds", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 4,
        failedProviderCount: 4,
        rebuildOk: true,
        briefingOk: true,
      }),
      "partially_completed"
    );
  });

  it("failed when no providers are connected and rebuild fails", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 0,
        failedProviderCount: 0,
        rebuildOk: false,
        briefingOk: true,
      }),
      "failed"
    );
  });

  it("completed when no providers are connected and rebuild succeeds", () => {
    assert.equal(
      deriveSyncRunCompletionStatus({
        providerCount: 0,
        failedProviderCount: 0,
        rebuildOk: true,
        briefingOk: true,
      }),
      "completed"
    );
  });
});
