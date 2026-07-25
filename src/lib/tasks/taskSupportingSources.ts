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
import { isQuoteRelevantToTask, taskDomainText } from "./evidenceRelevance";

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
  /**
   * The one sentence from this source's quotes that most concretely describes
   * what to do for this task — surfaced inline so the user sees the actionable
   * line without expanding every quote. Null when no quote text exists.
   */
  actionSnippet: string | null;
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

/** Verbs/modals that signal a concrete instruction or requirement in a quote. */
const ACTION_HINT_RE =
  /\b(add|adds|update|updates|create|creates|build|builds|implement|implements|fix|fixes|change|changes|remove|removes|display|displays|show|shows|send|sends|handle|handles|replace|replaces|ensure|ensures|make|makes|set|sets|enable|enables|support|supports|need|needs|needed|should|must|require|requires|required|allow|allows|move|moves|rename|refactor|introduce|configure|verify|clarify|simplify|investigate|evaluate|integrate|generate|render|renders|expose|surface|deliver)\b/i;

const SNIPPET_MAX_CHARS = 180;

function snippetTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
    (token) => !/^\d+$/.test(token)
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 12);
}

function clampSnippet(sentence: string, max = SNIPPET_MAX_CHARS): string {
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

/**
 * Picks the single quote sentence that best describes the concrete work for a
 * task, scoring each sentence by how many task-domain tokens it shares with the
 * task's title + next action, plus a bonus for imperative/requirement wording.
 * Falls back to the first available sentence so a snippet is always shown when
 * any quote text exists. Pure and unit-testable.
 */
export function pickActionSnippet(quotes: string[], actionText: string): string | null {
  const domain = new Set(snippetTokens(actionText));

  const sentences: string[] = [];
  for (const quote of quotes) {
    if (!quote?.trim()) continue;
    const parts = splitSentences(quote);
    if (parts.length === 0) sentences.push(quote.replace(/\s+/g, " ").trim());
    else sentences.push(...parts);
  }
  if (sentences.length === 0) return null;

  let best = sentences[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  sentences.forEach((sentence, index) => {
    const seen = new Set<string>();
    let overlap = 0;
    for (const token of snippetTokens(sentence)) {
      if (seen.has(token)) continue;
      seen.add(token);
      if (domain.has(token)) overlap += 1;
    }
    const actionBonus = ACTION_HINT_RE.test(sentence) ? 2 : 0;
    // Earlier sentences win ties — the extractor tends to cite the key line first.
    const score = overlap + actionBonus - index * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  });

  return clampSnippet(best);
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
        actionSnippet: null,
      };
      groupsBySource.set(item.sourceItemId, group);
    }
    if (quoteText && !group.quotes.some((q) => q.text === quoteText)) {
      group.quotes.push({ id: item.id, text: quoteText });
    }
  }

  let groups = [...groupsBySource.values()];

  // Safety net for every task, including meeting-created tasks without Jira:
  // judge each quote independently and drop a source when none of its quotes
  // concern this task. Jira anchors remain as proof of existence.
  const domain = taskDomainText({
    title: task.title,
    reason: task.reason,
    nextAction: task.nextAction,
  });
  const newestSourceTime = groups.reduce(
    (max, group) => Math.max(max, sourceTime(group.sourceDate)),
    0
  );
  for (const group of groups) {
    const source = sourceById.get(group.sourceItemId);
    group.quotes = group.quotes.filter(
      (quote) =>
        isQuoteRelevantToTask({
          taskKey: targetKey,
          domain,
          newestSourceTime,
          source: {
            sourceType: group.sourceType,
            sourceExternalId: source?.sourceExternalId ?? null,
            sourceDate: group.sourceDate,
          },
          quoteText: quote.text,
        }).relevant
    );
  }
  groups = groups.filter((group) => group.isAnchor || group.quotes.length > 0);

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

  // Surface the most action-relevant sentence per source, scored against the
  // task's own title + next action so it reads as "what to do" for this task.
  const actionText = `${task.title}\n${task.nextAction}`;
  for (const group of groups) {
    group.actionSnippet = pickActionSnippet(
      group.quotes.map((quote) => quote.text),
      actionText
    );
  }

  // Order: the Jira anchor first (proof of existence), then remaining sources
  // newest-first so the freshest guidance is nearest the top.
  groups.sort((a, b) => {
    if (a.isAnchor !== b.isAnchor) return a.isAnchor ? -1 : 1;
    return sourceTime(b.sourceDate) - sourceTime(a.sourceDate);
  });

  return { groups, conflicts };
}
