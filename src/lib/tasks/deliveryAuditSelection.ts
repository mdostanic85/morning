/**
 * Which tasks deserve a delivery review after a sync.
 *
 * Today's queue is always reviewed. This picks the ones nobody would otherwise
 * look at: a task parked in "later" that just gained evidence pointing at a
 * finished frame — e.g. someone linked the design in a Jira comment. Without it,
 * that task's outcomes stay unchecked until it happens to reach the top of the
 * queue.
 */

import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";

export interface DeliveryAuditCandidate {
  taskId: number;
  status: string;
  /** Frame link resolved deterministically from the task's evidence. */
  frameUrl: string | null;
  newestEvidenceAt: string | null;
  lastReviewedAt: string | null;
}

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectDeliveryAudits(
  candidates: DeliveryAuditCandidate[],
  options: { skipTaskIds?: Iterable<number>; limit: number }
): number[] {
  const skip = new Set(options.skipTaskIds ?? []);

  return candidates
    .flatMap((candidate) => {
      if (candidate.status === "done") return [];
      if (skip.has(candidate.taskId)) return [];
      // Only frames pinned to a node: reviewing a whole file says nothing about
      // one outcome, and resolving the node would cost an LLM call this task has
      // not earned.
      if (!candidate.frameUrl || !parseFigmaUrl(candidate.frameUrl)?.nodeId) return [];

      const evidenceAt = time(candidate.newestEvidenceAt);
      if (evidenceAt == null) return [];
      const reviewedAt = time(candidate.lastReviewedAt);
      if (reviewedAt != null && evidenceAt <= reviewedAt) return [];

      return [{ taskId: candidate.taskId, evidenceAt }];
    })
    .sort((a, b) => b.evidenceAt - a.evidenceAt)
    .slice(0, Math.max(0, options.limit))
    .map((entry) => entry.taskId);
}
