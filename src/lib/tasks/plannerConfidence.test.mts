import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveExtractionConfidence,
  isConfidenceContaminatedByPriority,
  resolvePlannerConfidence,
  shouldRouteLowConfidenceToUnclear,
  UNSCORED_CONFIDENCE_DEFAULT,
} from "./plannerConfidence.ts";

describe("plannerConfidence", () => {
  it("detects confidence copied from priorityScore", () => {
    assert.equal(isConfidenceContaminatedByPriority(0.156, 0.156), true);
    assert.equal(isConfidenceContaminatedByPriority(0.9, 0.156), false);
    assert.equal(isConfidenceContaminatedByPriority(null, 0.156), false);
  });

  it("never resolves confidence from priorityScore", () => {
    assert.equal(
      resolvePlannerConfidence({
        semanticConfidence: 0.82,
        existingConfidence: 0.1,
        priorityScore: 0.1,
      }),
      0.82
    );
    assert.equal(
      resolvePlannerConfidence({
        semanticConfidence: null,
        existingConfidence: 0.91,
        priorityScore: 0.2,
      }),
      0.91
    );
  });

  // WL-05: an unscored task must be treated as neutral, never as fully
  // trusted. This replaces the old default of `1.0`, which silently
  // inflated the confidence of every task with no semantic/existing score.
  it("defaults an unscored task to neutral (0.5), never to fully trusted (1.0)", () => {
    assert.equal(UNSCORED_CONFIDENCE_DEFAULT, 0.5);
    assert.equal(
      resolvePlannerConfidence({
        semanticConfidence: null,
        existingConfidence: null,
        priorityScore: 0.156,
      }),
      UNSCORED_CONFIDENCE_DEFAULT
    );
    assert.equal(
      resolvePlannerConfidence({
        semanticConfidence: undefined,
        existingConfidence: 0.156,
        priorityScore: 0.156,
      }),
      UNSCORED_CONFIDENCE_DEFAULT
    );
  });

  it("treats contaminated confidence as unknown for visibility", () => {
    assert.equal(
      effectiveExtractionConfidence({ confidence: 0.156, priorityScore: 0.156 }),
      null
    );
    assert.equal(
      effectiveExtractionConfidence({ confidence: 0.4, priorityScore: 0.9 }),
      0.4
    );
  });

  it("routes only genuine low confidence to Unclear", () => {
    assert.equal(
      shouldRouteLowConfidenceToUnclear({
        confidence: 0.156,
        priorityScore: 0.156,
      }),
      false
    );
    assert.equal(
      shouldRouteLowConfidenceToUnclear({
        confidence: 0.3,
        priorityScore: 0.9,
      }),
      true
    );
    assert.equal(
      shouldRouteLowConfidenceToUnclear({
        confidence: 0.3,
        priorityScore: 0.9,
        forceInclude: true,
      }),
      false
    );
    assert.equal(
      shouldRouteLowConfidenceToUnclear({
        confidence: 0.3,
        priorityScore: 0.9,
        explicitMyJiraAssignee: true,
      }),
      false
    );
  });
});
