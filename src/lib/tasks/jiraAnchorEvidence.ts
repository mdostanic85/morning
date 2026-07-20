import { isTranscriptSource } from "@/lib/tasks/sourceAuthority";
import { jiraKeyForTask, topicOverlapScore } from "@/lib/tasks/transcriptTaskMerge";

/**
 * Retroactive evidence adoption for Jira anchor tasks.
 *
 * Meeting-note extractions that ran before merge-first logic existed (or that
 * never named the ticket) left transcript evidence on small fragment tasks
 * ("Finish remaining X screens", "Send screenshot to ...") while the real
 * Jira ticket task kept only its Jira snapshot as evidence. Ranking then
 * boosts the fragments (fresh transcript + attended meeting) and buries the
 * ticket the meetings were actually about.
 *
 * This pass runs on every queue rebuild: open Jira-anchored tasks adopt
 * transcript sources that clearly talk about the same topic, so the anchor
 * ticket inherits freshness/attendance boosts. Fragments keep their own
 * evidence — nothing is moved or deleted.
 *
 * Matching is per-source (title + short body), never "adopt everything on a
 * fragment because the fragment matched". That mistake previously dumped
 * unrelated Gmail notes onto UATL-367.
 */

export interface AnchorEvidenceTask {
  id: number;
  title: string;
  reason: string;
  nextAction: string;
  status: string;
  evidence: {
    sourceItemId: number;
    quote: string | null;
    summary: string;
    sourceDate: string;
    url: string | null;
  }[];
}

export interface AnchorSourceInfo {
  sourceType: string;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PlannedEvidenceAdoption {
  anchorTaskId: number;
  fragmentTaskId: number;
  sourceItemId: number;
  quote: string | null;
  summary: string;
  sourceDate: string;
  url: string | null;
}

/** Shared domain tokens required between a source and the Jira anchor. */
const MIN_SOURCE_OVERLAP = 2;

function anchorTopicText(task: AnchorEvidenceTask): string {
  // Strip the Jira key so overlap is about domain language, not the key.
  const title = task.title.replace(/\b[A-Z][A-Z0-9]+-\d+\b:?\s*/g, " ");
  return `${title}\n${task.reason}\n${task.nextAction}`;
}

function sourceTopicText(source: AnchorSourceInfo): string {
  // Prefer the title; only a short body prefix so long transcripts cannot
  // match every open Jira ticket by accident.
  const body = (source.body ?? "").slice(0, 280);
  return `${source.title ?? ""}\n${body}`;
}

/**
 * Plans which transcript evidence rows fragment tasks should share with a
 * Jira-anchored task. Pure — callers persist the returned rows.
 */
export function planJiraAnchorEvidenceAdoption(input: {
  tasks: AnchorEvidenceTask[];
  sourceById: Map<number, AnchorSourceInfo>;
}): PlannedEvidenceAdoption[] {
  const { tasks, sourceById } = input;

  const anchors = tasks.filter((task) => jiraKeyForTask(task) != null);
  const fragments = tasks.filter((task) => jiraKeyForTask(task) == null);
  if (anchors.length === 0 || fragments.length === 0) return [];

  const planned: PlannedEvidenceAdoption[] = [];

  for (const fragment of fragments) {
    for (const item of fragment.evidence) {
      const source = sourceById.get(item.sourceItemId);
      if (!source || !isTranscriptSource(source)) continue;

      const sourceText = sourceTopicText(source);
      // Title-only score — meetings named after the work ("Content File Mgr -
      // Review") must win even when the body is sparse.
      const titleText = source.title ?? "";

      const scored = anchors
        .map((anchor) => {
          const anchorText = anchorTopicText(anchor);
          const sourceScore = topicOverlapScore(sourceText, anchorText);
          const titleScore = topicOverlapScore(titleText, anchorText);
          const score = Math.max(sourceScore, titleScore);
          return { anchor, score };
        })
        .filter((entry) => entry.score >= MIN_SOURCE_OVERLAP)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;
      // Ambiguous — two anchors equally plausible; don't guess.
      if (scored.length > 1 && scored[0].score === scored[1].score) continue;

      const anchor = scored[0].anchor;
      if (anchor.evidence.some((existing) => existing.sourceItemId === item.sourceItemId)) {
        continue;
      }
      if (
        planned.some(
          (row) =>
            row.anchorTaskId === anchor.id && row.sourceItemId === item.sourceItemId
        )
      ) {
        continue;
      }

      planned.push({
        anchorTaskId: anchor.id,
        fragmentTaskId: fragment.id,
        sourceItemId: item.sourceItemId,
        quote: item.quote,
        summary: item.summary,
        sourceDate: item.sourceDate,
        url: item.url,
      });
    }
  }

  return planned;
}
