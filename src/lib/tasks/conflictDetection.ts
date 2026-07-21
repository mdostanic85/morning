/**
 * WL-06 — structural conflict detection between sources on the task path.
 *
 * Worklight already silently resolves disagreement between sources (e.g.
 * `compareSourceAuthority`/`isIncomingSourceAuthoritative` in
 * `sourceAuthority.ts` pick a winner without ever recording that a
 * competing signal existed). This module makes one concrete case of that
 * disagreement explicit and structural, rather than silently applied.
 *
 * Deliberately dependency-free of the database and the LLM — detection is a
 * pure structural+freshness pre-filter over data Worklight already has.
 */
import { isJiraDoneMetadata } from "./canonicalKey";
import { jiraKeyForTask } from "./transcriptTaskMerge";

export interface ConflictCandidateSource {
  id: number;
  sourceType: string;
  sourceExternalId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConflictCandidateTask {
  status: string;
  title: string;
  evidence: { sourceItemId: number }[];
}

export interface DetectedSourceConflict {
  summary: string;
  evidenceIds: number[];
}

/**
 * Jira-Done-vs-still-open-in-transcript conflict: a ticket Jira reports as
 * Done while a non-"done" task still treats it as active work, either by
 * citing the Jira source directly or by carrying its key in the title.
 *
 * Evidence attached to the conflict is keyed to the task(s) that actually
 * cite or name *this* ticket — never every transcript-derived task in the
 * queue. (Fixes a false-positive risk in the original inline detector, which
 * collected transcript evidence ids across the whole task list regardless
 * of whether they referenced the ticket in question — the audit's
 * "source-wide, not task-keyed" finding.)
 */
export function detectJiraDoneVsOpenTaskConflicts(input: {
  tasks: ConflictCandidateTask[];
  sources: ConflictCandidateSource[];
}): DetectedSourceConflict[] {
  const conflicts: DetectedSourceConflict[] = [];

  for (const source of input.sources) {
    if (source.sourceType !== "jira" || !isJiraDoneMetadata(source.metadata)) continue;
    const key = source.sourceExternalId?.toUpperCase();
    if (!key) continue;

    const tasksCitingThisTicket = input.tasks.filter((task) => {
      if (task.status === "done") return false;
      const taskKey = jiraKeyForTask(task)?.toUpperCase();
      const cites = task.evidence.some((item) => item.sourceItemId === source.id);
      return cites || taskKey === key;
    });
    if (tasksCitingThisTicket.length === 0) continue;

    const citedEvidenceIds = tasksCitingThisTicket.flatMap((task) =>
      task.evidence.map((item) => item.sourceItemId)
    );

    conflicts.push({
      summary: `Transcript still treats ${key} work as open while Jira is Done`,
      evidenceIds: [...new Set([source.id, ...citedEvidenceIds])],
    });
  }

  return conflicts;
}
