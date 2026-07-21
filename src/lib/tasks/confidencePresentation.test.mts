import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confidenceBand,
  confidenceNeedsReview,
  formatConfidenceLabel,
} from "./confidencePresentation";

describe("confidencePresentation", () => {
  it("maps boundary values to bands", () => {
    assert.equal(confidenceBand(null), "not_scored");
    assert.equal(confidenceBand(0), "low");
    assert.equal(confidenceBand(0.39), "low");
    assert.equal(confidenceBand(0.4), "medium");
    assert.equal(confidenceBand(0.69), "medium");
    assert.equal(confidenceBand(0.7), "high");
    assert.equal(confidenceBand(1), "high");
  });

  it("formats labels consistently", () => {
    assert.equal(formatConfidenceLabel(null), "AI confidence: Not scored");
    assert.equal(formatConfidenceLabel(0.94), "AI confidence: High (94%)");
    assert.equal(formatConfidenceLabel(0.5), "AI confidence: Medium (40–69%)");
    assert.equal(formatConfidenceLabel(0.2), "AI confidence: Low (under 40%)");
  });

  it("flags low and unscored confidence for review", () => {
    assert.equal(confidenceNeedsReview(0.2), true);
    assert.equal(confidenceNeedsReview(null), true);
    assert.equal(confidenceNeedsReview(0.7), false);
  });
});
