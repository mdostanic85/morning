/**
 * Planner confidence is about task/ownership interpretation quality.
 * It must never be copied from priorityScore (ranking urgency).
 */

const EPSILON = 1e-9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** True when stored confidence is a contaminated copy of priorityScore. */
export function isConfidenceContaminatedByPriority(
  confidence: number | null | undefined,
  priorityScore: number | null | undefined
): boolean {
  if (!isFiniteNumber(confidence) || !isFiniteNumber(priorityScore)) return false;
  return Math.abs(confidence - priorityScore) < EPSILON;
}

/**
 * Effective extraction/ownership confidence for visibility and Unclear routing.
 * Contaminated priority copies are treated as unknown (not low-trust).
 */
export function effectiveExtractionConfidence(input: {
  confidence: number | null | undefined;
  priorityScore: number | null | undefined;
}): number | null {
  if (!isFiniteNumber(input.confidence)) return null;
  if (isConfidenceContaminatedByPriority(input.confidence, input.priorityScore)) {
    return null;
  }
  return clamp01(input.confidence);
}

/**
 * WL-05: an unscored task is neutral, never fully trusted by default. This
 * replaces the old `1.0` fallback, which silently treated every task with no
 * semantic/existing confidence as if it had been fully verified.
 */
export const UNSCORED_CONFIDENCE_DEFAULT = 0.5;

/**
 * Resolve confidence when applying planner decisions.
 * Never falls back to priorityScore.
 */
export function resolvePlannerConfidence(input: {
  semanticConfidence?: number | null;
  existingConfidence?: number | null;
  priorityScore: number;
}): number {
  if (isFiniteNumber(input.semanticConfidence)) {
    return clamp01(input.semanticConfidence);
  }

  const existing = input.existingConfidence;
  if (
    isFiniteNumber(existing) &&
    !isConfidenceContaminatedByPriority(existing, input.priorityScore)
  ) {
    return clamp01(existing);
  }

  // WL-05: neutral, not fully trusted — an unscored task has not been verified.
  return UNSCORED_CONFIDENCE_DEFAULT;
}

/** Below this (non-contaminated) confidence, route to Unclear unless exempt. */
export const LOW_OWNERSHIP_CONFIDENCE = 0.5;

export function shouldRouteLowConfidenceToUnclear(input: {
  confidence: number | null | undefined;
  priorityScore: number | null | undefined;
  forceInclude?: boolean;
  explicitMyJiraAssignee?: boolean;
}): boolean {
  if (input.forceInclude || input.explicitMyJiraAssignee) return false;
  const confidence = effectiveExtractionConfidence(input);
  if (confidence == null) return false;
  return confidence < LOW_OWNERSHIP_CONFIDENCE;
}
