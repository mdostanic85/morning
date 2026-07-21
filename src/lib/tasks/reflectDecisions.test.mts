import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyReflectDecisions, keepAllReflectResult } from "./reflectDecisions";

describe("keepAllReflectResult (WL-07 fail-open default)", () => {
  it("keeps every candidate and marks the stage as not applied", () => {
    const result = keepAllReflectResult(3);
    assert.deepEqual(result.keepFlags, [true, true, true]);
    assert.equal(result.ranReflectStage, false);
    assert.equal(result.reasons.length, 3);
  });

  it("handles zero candidates", () => {
    const result = keepAllReflectResult(0);
    assert.deepEqual(result.keepFlags, []);
  });
});

describe("applyReflectDecisions (WL-07)", () => {
  it("applies keep:false only to explicitly flagged indices", () => {
    const result = applyReflectDecisions(3, [
      { index: 0, keep: true, reason: "well evidenced" },
      { index: 1, keep: false, reason: "duplicate of index 0" },
      { index: 2, keep: true, reason: "genuinely new" },
    ]);
    assert.deepEqual(result.keepFlags, [true, false, true]);
    assert.equal(result.ranReflectStage, true);
    assert.equal(result.reasons[1], "duplicate of index 0");
  });

  // Critical safety property: a decision that never mentions an index must
  // never silently discard it — only an explicit keep:false can drop a
  // candidate.
  it("defaults a missing decision to keep:true, never to a silent discard", () => {
    const result = applyReflectDecisions(3, [{ index: 1, keep: false, reason: "noise" }]);
    assert.deepEqual(result.keepFlags, [true, false, true]);
  });

  it("handles an empty decision list by keeping everything", () => {
    const result = applyReflectDecisions(2, []);
    assert.deepEqual(result.keepFlags, [true, true]);
  });

  it("is robust to out-of-range or duplicate indices in the decision list", () => {
    const result = applyReflectDecisions(2, [
      { index: 0, keep: false, reason: "noise" },
      { index: 99, keep: false, reason: "out of range, ignored" },
    ]);
    assert.deepEqual(result.keepFlags, [false, true]);
  });
});
