/**
 * WL-07: pure application of the reflect stage's keep/discard decisions
 * onto the original candidate list — kept separate from the LLM call itself
 * (`taskReflect.ts`) so the actual decision-merging logic (index alignment,
 * fail-open defaults) is unit-testable without mocking the router.
 */
export interface ReflectFilterResult {
  /** Same length/order as the input candidates. */
  keepFlags: boolean[];
  reasons: string[];
  /** False when the reflect stage was skipped or failed — every candidate was kept by default. */
  ranReflectStage: boolean;
}

export interface ReflectDecision {
  index: number;
  keep: boolean;
  reason: string;
}

/** Fail-open default: every candidate survives, unlabeled. */
export function keepAllReflectResult(candidateCount: number): ReflectFilterResult {
  return {
    keepFlags: Array.from({ length: candidateCount }, () => true),
    reasons: Array.from({ length: candidateCount }, () => "reflect stage not applied"),
    ranReflectStage: false,
  };
}

/**
 * Merges validated LLM decisions back onto the original candidate indices.
 * A missing decision for a given index defaults to `keep: true` — the
 * reflect stage can only ever remove candidates it explicitly flagged, never
 * silently drop one it forgot to mention.
 */
export function applyReflectDecisions(
  candidateCount: number,
  decisions: ReflectDecision[]
): ReflectFilterResult {
  const decisionByIndex = new Map(decisions.map((decision) => [decision.index, decision]));
  const keepFlags = Array.from({ length: candidateCount }, (_, index) => decisionByIndex.get(index)?.keep ?? true);
  const reasons = Array.from(
    { length: candidateCount },
    (_, index) => decisionByIndex.get(index)?.reason ?? "no decision returned for this index — kept by default"
  );
  return { keepFlags, reasons, ranReflectStage: true };
}
