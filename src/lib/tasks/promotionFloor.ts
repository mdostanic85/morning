/**
 * WLA-01 promotion floor — "highest ranked" is not the same as "earns focus".
 *
 * `buildQueueDecisionsFromRanking` used to promote rank index 0 to `now` on
 * every sync with no score or evidence check. A queue whose best candidate
 * scored −45 (maintenance-only, stale evidence) still produced a confident
 * primary. The brief composer did the same for `todayFirst`.
 *
 * This module is the shared eligibility contract. A task clears the floor only
 * when it has a real promotion signal (fresh evidence, open Jira, due date,
 * attended-meeting force-include, or an explicit user pin) and a non-positive
 * score does not contradict that claim. Deferred / blocked statuses never
 * clear. Both the queue path and the brief composer must consume this
 * predicate so Today cannot assert a focus card the other path would refuse.
 *
 * Pure and clock-injectable so fixtures stay deterministic.
 */

import type { WorkTaskStatus } from "@/domain/workTask";

/** Evidence older than this cannot alone clear the floor. */
export const PROMOTION_FRESH_EVIDENCE_DAYS = 7;

/**
 * Absolute score at or below this cannot clear the floor (unless the caller
 * already short-circuited on forceInclude / manual pin). Negative nets mean
 * penalties dominate; zero is the empty-signal baseline for a plain `later`
 * task.
 */
export const PROMOTION_MIN_SCORE = 0;

export type PromotionFloorInput = {
  score: number;
  forceInclude: boolean;
  statusManuallySet: boolean;
  status: WorkTaskStatus;
  waitingOn: string | null;
  dueDate: string | null;
  /** ISO timestamps of cited evidence sources. */
  evidenceDates: readonly string[];
  /** Linked to an open (non-Done) Jira issue. */
  hasOpenJira: boolean;
  /** Injectable clock; defaults to Date.now(). */
  nowMs?: number;
};

function hasFreshEvidence(evidenceDates: readonly string[], nowMs: number): boolean {
  const windowMs = PROMOTION_FRESH_EVIDENCE_DAYS * 24 * 60 * 60 * 1000;
  return evidenceDates.some((date) => {
    const at = new Date(date).getTime();
    if (Number.isNaN(at)) return false;
    const age = nowMs - at;
    return age >= 0 && age <= windowMs;
  });
}

/**
 * True when the candidate may be promoted into the focus / `now` slot.
 * Rank order alone is never enough.
 */
export function clearsPromotionFloor(input: PromotionFloorInput): boolean {
  const nowMs = input.nowMs ?? Date.now();

  if (
    input.status === "waiting" ||
    input.status === "tomorrow" ||
    input.status === "unclear" ||
    input.status === "done" ||
    Boolean(input.waitingOn?.trim())
  ) {
    return false;
  }

  // Explicit user intent always earns the slot — they already chose.
  if (input.statusManuallySet) return true;

  // Attended-meeting commitment within the authority window.
  if (input.forceInclude) return true;

  const hasDue = Boolean(input.dueDate?.trim());
  const fresh = hasFreshEvidence(input.evidenceDates, nowMs);
  const hasRealSignal = hasDue || fresh || input.hasOpenJira;
  if (!hasRealSignal) return false;

  return input.score > PROMOTION_MIN_SCORE;
}
