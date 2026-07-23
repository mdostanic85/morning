/**
 * Builds the structured "Supporting sources" model shown on the task detail
 * page. It encodes the source logic the app follows for a Jira-backed task:
 *
 *  1. The Jira ticket is the task's proof of existence — it anchors the task
 *     and carries the authoritative operational status (In Progress, Done, …).
 *  2. Newer meeting notes (Granola / Gemini / manual transcripts) attached to
 *     the task are additional sources; the newest one is highlighted so it is
 *     obvious what most recently changed the task.
 *  3. When a newer meeting still treats the work as open while Jira reports it
 *     Done (or vice-versa), that disagreement is surfaced explicitly as a
 *     conflict with a badge — never silently resolved out of view.
 *
 * Pure and DB/LLM-free so it can be unit-tested and rendered on the server
 * without side effects. Conflict detection reuses the existing deterministic
 * `detectJiraDoneVsOpenTaskConflicts` detector (see conflictDetection.ts).
 */
import type { Evidence } from "@/domain/evidence";
import type { SourceItem } from "@/domain/sourceItem";
import { isJiraDoneMetadata } from "./canonicalKey";
import { jiraKeyForTask } from "./transcriptTaskMerge";
import { detectJiraDoneVsOpenTaskConflicts } from "./conflictDetection";
import { isSourceRelevantToTask, taskDomainText } from "./evidenceRelevance";

export interface SupportingSourceQuote {
  id: number;
  text: string;
}

export interface SupportingSourceGroup {
  sourceItemId: number;
  sourceType: string;
  /** Human-readable source category, e.g. "Jira ticket", "Meeting note". */
  label: string;
  title: string;
  url: string | null;
  sourceDate: string;
  /** Present only for Jira sources — the ticket's operational status. */
  jiraStatus: string | null;
  isJiraDone: boolean;
  /** The Jira ticket that proves this task exists. */
  isAnchor: boolean;
  /** The single newest-dated source — what most recently shaped the task. */
  isLatest: boolean;
  /** This source participates in a detected conflict. */
  inConflict: boolean;
  quotes: SupportingSourceQuote[];
}

export interface SupportingSourceConflict {
  summary: string;
  /** One sentence explaining how the disagreement is resolved. */
  detail: string;
  sourceItemIds: number[];
}

export interface TaskSupportingSources {
  groups: SupportingSourceGroup[];
  conflicts: SupportingSourceConflict[];
}

export function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case "jira":
      return "Jira ticket";
    case "granola":
    case "drive":
      return "Meeting note";
    case "manual_transcript":
      return "Transcript";
    case "gmail":
      return "Email";
    case "calendar":
      return "Calendar";
    case "confluence":
      return "Confluence doc";
    case "figma":
      return "Figma";
    case "github":
      return "GitHub";
    case "discord":
      return "Discord";
    case "git":
      return "Git";
    default:
      return "Source";
  }
}

function sourceTime(dateValue: string | null | undefined): number {
  if (!dateValue) return 0;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? 0 : time;
}

interface TaskLike {
  title: string;
  status: string;
  reason: string;
  nextAction: string;
  evidence: Evidence[];
}

export function buildTaskSupportingSources(input: {
  task: TaskLike;
  sourceById: Map<number, SourceItem>;
}): TaskSupportingSources {
  const { task, sourceById } = input;
  const targetKey = jiraKeyForTask({ title: task.title })?.toUpperCase() ?? null;

  // Collapse the flat evidence rows into one group per source item.
  const groupsBySource = new Map<number, SupportingSourceGroup>();
  for (const item of task.evidence) {
    const source = sourceById.get(item.sourceItemId) ?? null;
    const quoteText = (item.quote ?? "").trim() || item.summary.trim();

    let group = groupsBySource.get(item.sourceItemId);
    if (!group) {
      const sourceType = source?.sourceType ?? "other";
      const metadata = source?.metadata ?? null;
      const jiraStatus =
        sourceType === "jira" && typeof metadata?.status === "string"
          ? (metadata.status as string)
          : null;
      const isAnchor =
        sourceType === "jira" &&
        (targetKey == null || source?.sourceExternalId?.toUpperCase() === targetKey);

      group = {
        sourceItemId: item.sourceItemId,
        sourceType,
        label: sourceTypeLabel(sourceType),
        title: source?.title ?? item.summary ?? "Source evidence",
        url: item.url ?? source?.url ?? null,
        sourceDate: source?.sourceDate ?? item.sourceDate,
        jiraStatus,
        isJiraDone: sourceType === "jira" && isJiraDoneMetadata(metadata),
        isAnchor,
        isLatest: false,
        inConflict: false,
        quotes: [],
      };
      groupsBySource.set(item.sourceItemId, group);
    }
    if (quoteText && !group.quotes.some((q) => q.text === quoteText)) {
      group.quotes.push({ id: item.id, text: quoteText });
    }
  }

  let groups = [...groupsBySource.values()];

  // Safety net: for a Jira-anchored task, hide sources that don't genuinely
  // belong to it (stale or off-topic evidence wrongly attached by earlier
  // syncs/merges). Uses the same predicate as the rebuild-time prune, so what
  // renders always matches what the DB self-heals to. Non-anchored tasks keep
  // every source — the anchor is what makes strict filtering safe.
  if (targetKey != null) {
    const domain = taskDomainText({
      title: task.title,
      reason: task.reason,
      nextAction: task.nextAction,
    });
    const newestSourceTime = groups.reduce(
      (max, group) => Math.max(max, sourceTime(group.sourceDate)),
      0
    );
    groups = groups.filter((group) => {
      const source = sourceById.get(group.sourceItemId);
      return isSourceRelevantToTask({
        taskKey: targetKey,
        domain,
        newestSourceTime,
        group: {
          sourceItemId: group.sourceItemId,
          sourceType: group.sourceType,
          sourceExternalId: source?.sourceExternalId ?? null,
          sourceDate: group.sourceDate,
          quotesText: group.quotes.map((q) => q.text).join("\n"),
        },
      }).relevant;
    });
  }

  // Mark the single newest-dated source (typically the latest meeting note).
  let latestId: number | null = null;
  let latestTime = -1;
  for (const group of groups) {
    const time = sourceTime(group.sourceDate);
    if (time > latestTime) {
      latestTime = time;
      latestId = group.sourceItemId;
    }
  }
  if (latestId != null) {
    const latest = groups.find((g) => g.sourceItemId === latestId);
    if (latest) latest.isLatest = true;
  }

  // Deterministic conflict detection, scoped to this one task. Reuses the
  // shared detector over just the sources this task actually cites.
  const conflictSources = groups
    .map((group) => {
      const source = sourceById.get(group.sourceItemId);
      if (!source) return null;
      return {
        id: source.id,
        sourceType: source.sourceType,
        sourceExternalId: source.sourceExternalId,
        metadata: source.metadata,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null);

  const detected = detectJiraDoneVsOpenTaskConflicts({
    tasks: [
      {
        status: task.status,
        title: task.title,
        evidence: groups.map((g) => ({ sourceItemId: g.sourceItemId })),
      },
    ],
    sources: conflictSources,
  });

  const conflicts: SupportingSourceConflict[] = detected.map((conflict) => {
    for (const id of conflict.evidenceIds) {
      const group = groups.find((g) => g.sourceItemId === id);
      if (group) group.inConflict = true;
    }
    return {
      summary: conflict.summary,
      detail:
        "A newer meeting still treats this as active work, so the task stays open. Close it here once you confirm the Jira ticket is genuinely done.",
      sourceItemIds: conflict.evidenceIds,
    };
  });

  // Order: the Jira anchor first (proof of existence), then remaining sources
  // newest-first so the freshest guidance is nearest the top.
  groups.sort((a, b) => {
    if (a.isAnchor !== b.isAnchor) return a.isAnchor ? -1 : 1;
    return sourceTime(b.sourceDate) - sourceTime(a.sourceDate);
  });

  return { groups, conflicts };
}
