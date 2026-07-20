import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoToGmailAfterDate } from "./providerCursorUtils";
import { resolveIncrementalSinceIso } from "./connectionCursorUtils";

describe("gmail connection cursor", () => {
  it("formats gmail after: date filter", () => {
    assert.equal(isoToGmailAfterDate("2026-07-18T10:30:00.000Z"), "2026/07/18");
  });

  it("incremental sync rewinds overlap from last successful sync", () => {
    const result = resolveIncrementalSinceIso({
      lastSuccessfulSyncAt: "2026-07-17T12:00:00.000Z",
      overlapDurationMs: 86_400_000,
      initialLookbackMs: 30 * 24 * 60 * 60 * 1000,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });
    assert.equal(result.isFirstSync, false);
    assert.equal(result.sinceIso, "2026-07-16T12:00:00.000Z");
  });
});
