import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildJiraUpdatedClause,
  isoToJiraJqlDateTime,
  observedJiraLastSeenUpdatedAt,
} from "./providerCursorUtils";
import { resolveIncrementalSinceIso } from "./connectionCursorUtils";

describe("jira connection cursor", () => {
  it("formats ISO timestamps for Jira JQL", () => {
    assert.equal(isoToJiraJqlDateTime("2026-07-18T10:30:00.000Z"), "2026-07-18 10:30");
  });

  it("builds updated-since JQL clause", () => {
    assert.equal(
      buildJiraUpdatedClause("2026-07-18T10:30:00.000Z"),
      'updated >= "2026-07-18 10:30"'
    );
  });

  it("first sync uses lookback window", () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const result = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt: null,
      overlapDurationMs: 86_400_000,
      initialLookbackMs: 30 * 24 * 60 * 60 * 1000,
      now,
    });
    assert.equal(result.isFirstSync, true);
  });

  it("incremental sync applies overlap to last successful sync", () => {
    const result = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt: "2026-07-17T12:00:00.000Z",
      overlapDurationMs: 86_400_000,
      initialLookbackMs: 30 * 24 * 60 * 60 * 1000,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });
    assert.equal(result.isFirstSync, false);
    assert.equal(result.sinceIso, "2026-07-16T12:00:00.000Z");
  });

  it("observes issue and comment update timestamps", () => {
    const observed = observedJiraLastSeenUpdatedAt([
      {
        sourceType: "jira",
        sourceExternalId: "HYD-1",
        title: "HYD-1",
        body: "",
        sourceDate: "2026-07-18T09:00:00.000Z",
        metadata: { commentUpdatedAts: ["2026-07-18T10:00:00.000Z"] },
      },
    ]);
    assert.equal(observed, "2026-07-18T10:00:00.000Z");
  });
});
