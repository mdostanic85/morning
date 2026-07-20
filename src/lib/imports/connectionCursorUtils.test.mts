import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConnectionCursorAdvance,
  buildCursorAdvanceFromSync,
  maxIsoTimestamp,
  resolveIncrementalSinceIso,
  unchangedCursorSnapshot,
} from "./connectionCursorUtils";

const NOW = new Date("2026-07-18T12:00:00.000Z");
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

describe("connection cursor utils", () => {
  it("first sync uses initial lookback window", () => {
    const result = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt: null,
      overlapDurationMs: OVERLAP_MS,
      initialLookbackMs: LOOKBACK_MS,
      now: NOW,
    });

    assert.equal(result.isFirstSync, true);
    assert.equal(
      result.sinceIso,
      new Date(NOW.getTime() - LOOKBACK_MS).toISOString()
    );
  });

  it("incremental sync anchors from last successful sync", () => {
    const lastSuccessfulSyncAt = "2026-07-17T12:00:00.000Z";
    const result = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt,
      overlapDurationMs: OVERLAP_MS,
      initialLookbackMs: LOOKBACK_MS,
      now: NOW,
    });

    assert.equal(result.isFirstSync, false);
    assert.equal(
      result.sinceIso,
      new Date(Date.parse(lastSuccessfulSyncAt) - OVERLAP_MS).toISOString()
    );
  });

  it("overlap rewinds the incremental window", () => {
    const lastSuccessfulSyncAt = "2026-07-18T10:00:00.000Z";
    const withOverlap = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt,
      overlapDurationMs: OVERLAP_MS,
      initialLookbackMs: LOOKBACK_MS,
      now: NOW,
    });
    const withoutOverlap = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt,
      overlapDurationMs: 0,
      initialLookbackMs: LOOKBACK_MS,
      now: NOW,
    });

    assert.ok(Date.parse(withOverlap.sinceIso) < Date.parse(withoutOverlap.sinceIso));
  });

  it("failed sync preserves previous cursor snapshot", () => {
    const previous = unchangedCursorSnapshot({
      cursorValue: "2026-07-17T12:00:00.000Z",
      lastSeenUpdatedAt: "2026-07-17T11:00:00.000Z",
      overlapDurationMs: OVERLAP_MS,
      lastSuccessfulSyncAt: "2026-07-17T12:00:00.000Z",
    });

    const afterFailure = previous;
    assert.deepEqual(afterFailure, previous);
  });

  it("cancelled sync preserves previous cursor snapshot", () => {
    const previous = unchangedCursorSnapshot({
      cursorValue: "2026-07-17T12:00:00.000Z",
      lastSeenUpdatedAt: "2026-07-17T11:00:00.000Z",
      overlapDurationMs: OVERLAP_MS,
      lastSuccessfulSyncAt: "2026-07-17T12:00:00.000Z",
    });

    assert.equal(previous.lastSuccessfulSyncAt, "2026-07-17T12:00:00.000Z");
  });

  it("unchanged data still advances lastSuccessfulSyncAt on success", () => {
    const syncedAt = "2026-07-18T12:00:00.000Z";
    const advance = buildCursorAdvanceFromSync({
      existingLastSeenUpdatedAt: "2026-07-17T11:00:00.000Z",
      observedLastSeenUpdatedAt: "2026-07-17T11:00:00.000Z",
      overlapDurationMs: OVERLAP_MS,
      syncedAt,
      cursorValue: syncedAt,
    });

    assert.equal(advance.lastSuccessfulSyncAt, syncedAt);
    assert.equal(advance.lastSeenUpdatedAt, "2026-07-17T11:00:00.000Z");
  });

  it("successful sync advances lastSeenUpdatedAt when newer data appears", () => {
    const advance = buildConnectionCursorAdvance({
      existingLastSeenUpdatedAt: "2026-07-17T11:00:00.000Z",
      observedLastSeenUpdatedAt: "2026-07-18T09:30:00.000Z",
      overlapDurationMs: OVERLAP_MS,
      syncedAt: "2026-07-18T12:00:00.000Z",
      cursorValue: "2026-07-18T12:00:00.000Z",
    });

    assert.equal(advance.lastSeenUpdatedAt, "2026-07-18T09:30:00.000Z");
    assert.equal(maxIsoTimestamp("2026-07-17T11:00:00.000Z", "2026-07-18T09:30:00.000Z"), "2026-07-18T09:30:00.000Z");
  });
});
