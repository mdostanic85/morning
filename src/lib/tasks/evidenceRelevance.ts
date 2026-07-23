/**
 * Deterministic "does this source actually belong on this task?" predicate.
 *
 * A Jira-anchored task (its title carries a ticket key like UATL-380) exists
 * because of that ticket — the ticket is its proof of existence. Everything
 * else attached to it is only justified if it genuinely concerns that ticket's
 * work. In practice, extraction merges, retroactive adoption, and duplicate
 * merges have over-attached unrelated sources (old Gmail threads, stale daily
 * standups covering many topics, unrelated 1:1 notes) onto anchored tasks.
 *
 * The rule that reliably separates signal from that noise, applied to each
 * cited quote INDIVIDUALLY (not the whole source at once):
 *
 *   1. The Jira ticket itself (matching key) is always relevant — the anchor.
 *   2. Any single quote that names the ticket key is relevant.
 *   3. Otherwise a quote is relevant only if it is BOTH
 *        (a) within the per-task freshness window (see sourceAuthority), and
 *        (b) that one quote shares ≥2 domain tokens with the task.
 *
 * Judging each quote on its own — rather than keeping every quote from a source
 * the moment ANY of its quotes cites the key — is the crucial part. One meeting
 * ("Milos & Lucas sync") routinely covers several tasks: the line that concerns
 * this task's work stays, but a sibling line about a *different* task (e.g. the
 * confidence-score placement) is dropped even though the same meeting also
 * mentions this ticket somewhere. Evidence for a task is the Jira ticket plus
 * only what was actually said about *this* task — of any kind (a requested
 * change, a decision, or important context), never another task's line that
 * merely rode along in the same source.
 *
 * Pure and dependency-light so it can be unit-tested and used both at display
 * time (to hide), at extraction time (to not attach), and at rebuild time (to
 * prune) with identical behavior.
 */
import { TASK_SOURCE_FRESHNESS_WINDOW_MS } from "./sourceAuthority";
import {
  extractJiraKeysFromText,
  jiraKeyForTask,
  topicOverlapScore,
} from "./transcriptTaskMerge";

/** Minimum shared domain tokens between a source's quotes and the task. */
export const MIN_QUOTE_OVERLAP = 2;

export function taskDomainText(task: {
  title: string;
  reason: string;
  nextAction: string;
}): string {
  // Strip the Jira key so overlap is about the work, not the ticket id.
  const title = task.title.replace(/\b[A-Z][A-Z0-9]+-\d+\b:?\s*/g, " ");
  return `${title}\n${task.reason}\n${task.nextAction}`;
}

function sourceTime(dateValue: string | null | undefined): number {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** The source a quote came from — used for the anchor and freshness checks. */
export interface RelevanceQuoteSource {
  sourceType: string;
  sourceExternalId: string | null;
  /** Best available date for the source (source item date, else evidence date). */
  sourceDate: string | null;
}

export interface RelevanceDecision {
  relevant: boolean;
  reason: string;
}

/**
 * Decide whether a single cited quote is relevant to a task. `taskKey` is the
 * task's Jira key (or null for non-anchored tasks). Each quote is judged on its
 * own so an on-topic line and an off-topic line from the same source get
 * different verdicts — the whole point of per-quote (not per-source) scoring.
 */
export function isQuoteRelevantToTask(input: {
  taskKey: string | null;
  domain: string;
  newestSourceTime: number;
  source: RelevanceQuoteSource;
  quoteText: string;
}): RelevanceDecision {
  const { taskKey, domain, newestSourceTime, source, quoteText } = input;

  if (taskKey) {
    // The Jira ticket itself is the task's proof of existence — always kept,
    // regardless of what its snapshot text says.
    if (
      source.sourceType === "jira" &&
      source.sourceExternalId?.toUpperCase() === taskKey
    ) {
      return { relevant: true, reason: "jira anchor (proof of existence)" };
    }
    // A quote that itself names the ticket key is about this task.
    if (extractJiraKeysFromText(quoteText).includes(taskKey)) {
      return { relevant: true, reason: `quote cites ${taskKey}` };
    }
  }

  const time = sourceTime(source.sourceDate);
  const stale =
    newestSourceTime > 0 &&
    time > 0 &&
    newestSourceTime - time > TASK_SOURCE_FRESHNESS_WINDOW_MS;
  if (stale) {
    return { relevant: false, reason: "older than freshness window" };
  }

  const overlap = topicOverlapScore(quoteText, domain);
  if (overlap >= MIN_QUOTE_OVERLAP) {
    return { relevant: true, reason: `fresh, quote overlap ${overlap}` };
  }
  return {
    relevant: false,
    reason: `fresh but quote overlap ${overlap} < ${MIN_QUOTE_OVERLAP}`,
  };
}

export interface PruneEvidenceRow {
  id: number;
  sourceItemId: number;
  quote: string | null;
  summary: string;
  sourceDate: string;
}

export interface PruneTask {
  id: number;
  title: string;
  reason: string;
  nextAction: string;
  evidence: PruneEvidenceRow[];
}

export interface PrunedEvidence {
  evidenceId: number;
  taskId: number;
  sourceItemId: number;
  reason: string;
}

export interface PruneSourceInfo {
  sourceType: string;
  sourceExternalId: string | null;
  sourceDate: string | null;
}

/**
 * Plans which individual evidence rows to remove from Jira-anchored tasks
 * because the specific quote they carry is not relevant to the task. Each row
 * is judged on its own quote, so an off-topic line is dropped even when a
 * sibling line from the same source is kept. Non-anchored (meeting-only) tasks
 * are left untouched — the anchor is what makes strict pruning safe (the task
 * can never lose its proof of existence). Pure; callers persist the deletions.
 */
export function planEvidenceRelevancePrune(input: {
  tasks: PruneTask[];
  sourceById: Map<number, PruneSourceInfo>;
}): PrunedEvidence[] {
  const { tasks, sourceById } = input;
  const pruned: PrunedEvidence[] = [];

  for (const task of tasks) {
    const taskKey = jiraKeyForTask({ title: task.title });
    if (!taskKey) continue; // only prune anchored tasks

    const domain = taskDomainText(task);

    // Newest signal across all evidence rows cited by the task.
    let newestSourceTime = 0;
    for (const row of task.evidence) {
      const source = sourceById.get(row.sourceItemId);
      const date = source?.sourceDate ?? row.sourceDate ?? null;
      const time = sourceTime(date);
      if (time > newestSourceTime) newestSourceTime = time;
    }

    for (const row of task.evidence) {
      const source = sourceById.get(row.sourceItemId);
      const quoteText = (row.quote ?? "").trim() || row.summary.trim();
      const decision = isQuoteRelevantToTask({
        taskKey,
        domain,
        newestSourceTime,
        source: {
          sourceType: source?.sourceType ?? "other",
          sourceExternalId: source?.sourceExternalId ?? null,
          sourceDate: source?.sourceDate ?? row.sourceDate ?? null,
        },
        quoteText,
      });
      if (decision.relevant) continue;
      pruned.push({
        evidenceId: row.id,
        taskId: task.id,
        sourceItemId: row.sourceItemId,
        reason: decision.reason,
      });
    }
  }

  return pruned;
}
