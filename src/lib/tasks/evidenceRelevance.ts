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
 * The rule that reliably separates signal from that noise:
 *
 *   1. The Jira ticket itself (matching key) is always relevant — the anchor.
 *   2. Any source whose attached quotes name the ticket key is relevant.
 *   3. Otherwise a source is relevant only if it is BOTH
 *        (a) within the per-task freshness window (see sourceAuthority), and
 *        (b) its *attached evidence quotes* — not the whole source body —
 *            share ≥2 domain tokens with the task.
 *
 * Using the attached quotes (what the extractor actually pulled onto the task)
 * instead of the full body is the crucial part: long multi-topic standup
 * transcripts overlap almost any task on their full text, but the specific
 * lines cited for an unrelated task do not overlap the banner work.
 *
 * Pure and dependency-light so it can be unit-tested and used both at display
 * time (to hide) and at rebuild time (to prune) with identical behavior.
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

export interface RelevanceSourceGroup {
  sourceItemId: number;
  sourceType: string;
  sourceExternalId: string | null;
  /** Best available date for the source (source item date, else evidence date). */
  sourceDate: string | null;
  /** Concatenated quotes/summaries actually attached to this task for the source. */
  quotesText: string;
}

export interface RelevanceDecision {
  relevant: boolean;
  reason: string;
}

/**
 * Decide whether a single source (as cited by a task) is relevant to that task.
 * `taskKey` is the task's Jira key (or null for non-anchored tasks).
 */
export function isSourceRelevantToTask(input: {
  taskKey: string | null;
  domain: string;
  newestSourceTime: number;
  group: RelevanceSourceGroup;
}): RelevanceDecision {
  const { taskKey, domain, newestSourceTime, group } = input;

  if (taskKey) {
    if (
      group.sourceType === "jira" &&
      group.sourceExternalId?.toUpperCase() === taskKey
    ) {
      return { relevant: true, reason: "jira anchor (proof of existence)" };
    }
    if (extractJiraKeysFromText(group.quotesText).includes(taskKey)) {
      return { relevant: true, reason: `cites ${taskKey}` };
    }
  }

  const time = sourceTime(group.sourceDate);
  const stale =
    newestSourceTime > 0 &&
    time > 0 &&
    newestSourceTime - time > TASK_SOURCE_FRESHNESS_WINDOW_MS;
  if (stale) {
    return { relevant: false, reason: "older than freshness window" };
  }

  const overlap = topicOverlapScore(group.quotesText, domain);
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
 * Plans which evidence rows to remove from Jira-anchored tasks because their
 * source is not relevant to the task. Non-anchored (meeting-only) tasks are
 * left untouched — the anchor is what makes strict pruning safe (the task can
 * never lose its proof of existence). Pure; callers persist the deletions.
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

    // Collapse evidence rows into one group per source item.
    const groups = new Map<
      number,
      { rows: PruneEvidenceRow[]; quotes: string[] }
    >();
    for (const row of task.evidence) {
      let group = groups.get(row.sourceItemId);
      if (!group) {
        group = { rows: [], quotes: [] };
        groups.set(row.sourceItemId, group);
      }
      group.rows.push(row);
      const quote = (row.quote ?? "").trim() || row.summary.trim();
      if (quote) group.quotes.push(quote);
    }

    // Newest signal across all sources cited by the task.
    let newestSourceTime = 0;
    for (const [sourceItemId, group] of groups) {
      const source = sourceById.get(sourceItemId);
      const date = source?.sourceDate ?? group.rows[0]?.sourceDate ?? null;
      const time = sourceTime(date);
      if (time > newestSourceTime) newestSourceTime = time;
    }

    for (const [sourceItemId, group] of groups) {
      const source = sourceById.get(sourceItemId);
      const decision = isSourceRelevantToTask({
        taskKey,
        domain,
        newestSourceTime,
        group: {
          sourceItemId,
          sourceType: source?.sourceType ?? "other",
          sourceExternalId: source?.sourceExternalId ?? null,
          sourceDate: source?.sourceDate ?? group.rows[0]?.sourceDate ?? null,
          quotesText: group.quotes.join("\n"),
        },
      });
      if (decision.relevant) continue;
      for (const row of group.rows) {
        pruned.push({
          evidenceId: row.id,
          taskId: task.id,
          sourceItemId,
          reason: decision.reason,
        });
      }
    }
  }

  return pruned;
}
