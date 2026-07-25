import { extractJiraKeyFromTitle } from "@/lib/tasks/resolveFocusTask";
import { isTranscriptSource } from "@/lib/tasks/sourceAuthority";
import { classifyTaskOwnership } from "@/lib/filters/ownerFilter";

/** Open queue statuses that can receive transcript merges as the "active" anchor. */
const ACTIVE_MERGE_STATUSES = new Set(["now", "next", "later"]);

const STOP_WORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "your",
  "have",
  "will",
  "into",
  "then",
  "than",
  "when",
  "what",
  "which",
  "their",
  "there",
  "about",
  "after",
  "before",
  "review",
  "design",
  "update",
  "create",
  "finish",
  "remaining",
  "screens",
  "ticket",
  "issue",
  "task",
  "work",
  "meeting",
  "notes",
  "daily",
  "hydra",
  "sync",
  "discussed",
  // Dates describe when two items happened, not whether they concern the same
  // work. Without these, a generic "July sync" can look topically related to
  // a task whose reason also happens to mention July and a sync.
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  // Common participants occur across many unrelated meetings and must not
  // count as domain-topic proof on their own.
  "milos",
  "dostanic",
  "lucas",
  "matt",
]);

export interface MergeCandidateTask {
  id: number;
  title: string;
  reason: string;
  nextAction: string;
  status: string;
  projectId: number | null;
  /** Used only to block cross-owner exact-title dedupe (EV-06) — never required elsewhere. */
  owner?: string | null;
}

export interface ExtractedTaskForMerge {
  title: string;
  reason: string;
  nextAction: string;
  status: "actionable" | "waiting" | "unclear";
  existingTaskId: number | null;
  owner?: string | null;
}

export type TranscriptMergeMode =
  | "full" // update nextAction / doneCriteria / reason
  | "evidence"; // attach evidence only; keep task fields

export interface TranscriptMergeResolution {
  taskId: number | null;
  mode: TranscriptMergeMode;
  reason: string;
}

/** All Jira-like keys mentioned in free text (UATL-367, ABC-12, …). */
export function extractJiraKeysFromText(text: string): string[] {
  const matches = text.toUpperCase().match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [];
  return [...new Set(matches)];
}

/**
 * Map spoken "ticket 367" mentions onto open tasks like UATL-367 when the
 * numeric suffix uniquely identifies one open task.
 */
export function inferJiraKeysFromBareTicketMentions(
  text: string,
  tasks: MergeCandidateTask[]
): string[] {
  const numbers = [
    ...new Set(
      [...text.matchAll(/\b(?:ticket|issue)\s*#?\s*(\d+)\b/gi)].map((match) => match[1])
    ),
  ];
  if (numbers.length === 0) return [];

  const resolved: string[] = [];
  for (const num of numbers) {
    const matches = tasks
      .map((task) => jiraKeyForTask(task))
      .filter((key): key is string => Boolean(key && key.endsWith(`-${num}`)));
    const unique = [...new Set(matches)];
    if (unique.length === 1) resolved.push(unique[0]);
  }
  return resolved;
}

export function jiraKeyForTask(task: Pick<MergeCandidateTask, "title">): string | null {
  const fromStart = extractJiraKeyFromTitle(task.title)?.toUpperCase();
  if (fromStart) return fromStart;
  return extractJiraKeysFromText(task.title)[0] ?? null;
}

function findTaskByJiraKey(
  tasks: MergeCandidateTask[],
  key: string
): MergeCandidateTask | null {
  const upper = key.toUpperCase();
  const ranked = tasks
    .map((task) => {
      const fromTitle = jiraKeyForTask(task);
      if (fromTitle === upper) return { task, rank: 0 };
      if (task.title.toUpperCase().includes(upper)) return { task, rank: 1 };
      if (`${task.reason} ${task.nextAction}`.toUpperCase().includes(upper)) {
        return { task, rank: 2 };
      }
      return null;
    })
    .filter((entry): entry is { task: MergeCandidateTask; rank: number } => entry != null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const statusRank = (status: string) =>
        status === "now" ? 0 : status === "next" ? 1 : status === "later" ? 2 : 3;
      return statusRank(a.task.status) - statusRank(b.task.status);
    });
  return ranked[0]?.task ?? null;
}

/** Strips a leading "KEY · "/"KEY: "/"KEY - " Jira-key prefix so titles that
 * only differ by that prefix compare as identical. */
function normalizeTitleForDedupe(title: string): string {
  return title
    .replace(/^[A-Z][A-Z0-9]+-\d+\s*[·:\-–]\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * EV-06: two tasks that describe the same work but were created from
 * different sources (e.g. a transcript before the Jira ticket existed, then
 * the Jira sync itself) often only differ by a Jira-key title prefix. An
 * exact title match (after stripping that prefix) is a much stronger signal
 * than topic overlap — it is the real incident behind task #468 ("Design
 * Part Search Banner") and #487 ("UATL-380 · Design Part Search Banner")
 * both surfacing as if they were unrelated. Still blocked when the existing
 * task explicitly belongs to someone else, so an identical title from a
 * different person's task never silently merges.
 */
export function findTaskByExactTitleMatch(
  tasks: MergeCandidateTask[],
  title: string,
  myName: string | null
): MergeCandidateTask | null {
  const normalized = normalizeTitleForDedupe(title);
  if (!normalized) return null;
  return (
    tasks.find((task) => {
      if (normalizeTitleForDedupe(task.title) !== normalized) return false;
      const ownership = classifyTaskOwnership(
        { owner: task.owner ?? null, title: task.title, reason: task.reason, nextAction: task.nextAction },
        myName
      );
      return ownership !== "other";
    }) ?? null
  );
}

function significantTokens(text: string): Set<string> {
  const tokens = (text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
    (token) => !STOP_WORDS.has(token) && !/^\d+$/.test(token)
  );
  return new Set(tokens);
}

export function topicOverlapScore(a: string, b: string): number {
  const left = significantTokens(a);
  const right = significantTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  // Prefer denser overlap; require at least two shared domain tokens.
  if (shared < 2) return 0;
  return shared;
}

export interface RelevanceCheckExtract {
  title: string;
  reason: string;
  nextAction: string;
  owner?: string | null;
}

export interface RelevanceCheckResult {
  relevant: boolean;
  reason: string;
}

/**
 * EV-00 shared relevance predicate (see
 * docs/architecture/evidence-relevance-fix-plan.md). A source/extract is only
 * relevant to a task when:
 *  (a) it shares the task's Jira key, OR
 *  (b) it explicitly names the current user as the owner of this specific
 *      work AND clears a minimum domain-topic overlap with the task.
 *
 * Same project alone, recency alone, or a single/incidental shared word are
 * never sufficient. This guards every place that would otherwise trust an
 * LLM `existingTaskId` hint or a topic-only anchor at face value — the
 * mechanism that previously dumped 40+ unrelated Gmail rows and a different
 * daily's action item onto UATL-380 ("Design Part Search Banner").
 */
export function isExtractRelevantToTask(input: {
  extract: RelevanceCheckExtract;
  /** Raw source text (title + body) used to scan for Jira keys / topic overlap. */
  sourceText: string;
  target: Pick<MergeCandidateTask, "title" | "reason" | "nextAction">;
  myName: string | null;
}): RelevanceCheckResult {
  const { extract, sourceText, target, myName } = input;

  const targetKey = jiraKeyForTask({ title: target.title });
  if (targetKey) {
    if (extractJiraKeysFromText(sourceText).includes(targetKey)) {
      return { relevant: true, reason: `shares Jira key ${targetKey}` };
    }
  }

  const ownership = classifyTaskOwnership(
    {
      owner: extract.owner,
      title: extract.title,
      reason: extract.reason,
      nextAction: extract.nextAction,
    },
    myName
  );
  if (ownership !== "mine") {
    return { relevant: false, reason: "not explicitly the user's own work" };
  }

  const overlap = topicOverlapScore(
    sourceText,
    `${target.title}\n${target.reason}\n${target.nextAction}`
  );
  if (overlap >= 2) {
    return { relevant: true, reason: `explicit ownership, topic overlap ${overlap}` };
  }
  return {
    relevant: false,
    reason: `explicit ownership but topic overlap ${overlap} is too weak`,
  };
}

/**
 * When a transcript does not name a Jira key, find the active open task that
 * most clearly shares domain language with the meeting / extract. Purely a
 * topic-scoring helper — callers must still confirm the result against
 * `isExtractRelevantToTask` (explicit ownership) before merging on it. No
 * status shortcut: being the sole "now"/"next" task is never itself a reason
 * to win — it must be the strongest (or only) topical match among all open
 * tasks, so a prominent task can't become a magnet for unrelated items.
 */
export function findOnlyActiveTopicAnchor(
  tasks: MergeCandidateTask[],
  topicText: string
): MergeCandidateTask | null {
  const active = tasks.filter((task) => ACTIVE_MERGE_STATUSES.has(task.status));
  if (active.length === 0) return null;

  const scored = active
    .map((task) => ({
      task,
      score: topicOverlapScore(
        topicText,
        `${task.title}\n${task.reason}\n${task.nextAction}`
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const withOverlap = scored.filter((entry) => entry.score > 0);

  if (withOverlap.length === 0) return null;
  if (withOverlap.length === 1) return withOverlap[0].task;

  // Exactly one clear winner among several active tasks.
  if (withOverlap[0].score >= withOverlap[1].score + 2) {
    return withOverlap[0].task;
  }

  return null;
}

/**
 * Confirms an LLM `existingTaskId` hint against the shared relevance
 * predicate before it is trusted. Returns the merge resolution when the hint
 * is confirmed relevant, otherwise `null` so the caller falls through to the
 * next resolution strategy (e.g. a new task).
 */
function resolveExistingTaskIdHint(input: {
  extracted: ExtractedTaskForMerge;
  existingTasks: MergeCandidateTask[];
  haystack: string;
  myName: string | null;
  mode: TranscriptMergeMode;
  reasonPrefix: string;
}): TranscriptMergeResolution | null {
  const { extracted, existingTasks, haystack, myName, mode, reasonPrefix } = input;
  if (extracted.existingTaskId == null) return null;

  const target = existingTasks.find((task) => task.id === extracted.existingTaskId);
  if (!target) return null;

  const check = isExtractRelevantToTask({
    extract: extracted,
    sourceText: haystack,
    target,
    myName,
  });
  if (!check.relevant) return null;

  return {
    taskId: extracted.existingTaskId,
    mode,
    reason: `${reasonPrefix} (${check.reason})`,
  };
}

/**
 * Deterministic merge target for transcript extractions.
 * LLM `existingTaskId` is only a candidate — it must be confirmed by the
 * shared relevance predicate (shared Jira key, or explicit ownership +
 * topic overlap) before it is trusted. Jira key match wins outright; a
 * topic-only anchor must also clear that same ownership confirmation.
 * See docs/architecture/evidence-relevance-fix-plan.md (EV-00/01/02).
 */
export function resolveTranscriptMergeTarget(input: {
  source: {
    sourceType: string;
    title?: string | null;
    body?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  extracted: ExtractedTaskForMerge;
  existingTasks: MergeCandidateTask[];
  /** Current user's name, used to confirm explicit-ownership relevance. */
  myName?: string | null;
}): TranscriptMergeResolution {
  const { source, extracted, existingTasks, myName = null } = input;

  // Only raw source text may prove that a transcript belongs to an existing
  // task. Including the LLM-generated title/reason here creates a circular
  // check: the model can copy an existing task's wording and then use that
  // copied wording as "evidence" that its own existingTaskId guess was right.
  const sourceText = [
    source.title ?? "",
    source.body ?? "",
  ].join("\n");

  if (!isTranscriptSource(source)) {
    const hinted = resolveExistingTaskIdHint({
      extracted,
      existingTasks,
      haystack: sourceText,
      myName,
      mode: "full",
      reasonPrefix: "non-transcript existingTaskId",
    });
    if (hinted) return hinted;
    // EV-06: a Jira sync (or other non-transcript source) landing on a task
    // that was already created earlier from a transcript, before the ticket
    // existed, must not spawn a duplicate — same title text is the strongest
    // available signal here, stronger than any topic-overlap heuristic.
    const titleMatch = findTaskByExactTitleMatch(existingTasks, extracted.title, myName);
    if (titleMatch) {
      return { taskId: titleMatch.id, mode: "full", reason: "exact title match (dedupe)" };
    }
    return { taskId: null, mode: "full", reason: "non-transcript new work" };
  }

  // waiting / unclear stay as their own queue items unless the LLM already
  // pointed at an existing task — otherwise Sofija-owned grooming would get
  // swallowed into the user's design ticket.
  if (extracted.status !== "actionable") {
    const hinted = resolveExistingTaskIdHint({
      extracted,
      existingTasks,
      haystack: sourceText,
      myName,
      mode: "evidence",
      reasonPrefix: "llm existingTaskId (non-actionable)",
    });
    if (hinted) return hinted;
    const titleMatch = findTaskByExactTitleMatch(existingTasks, extracted.title, myName);
    if (titleMatch) {
      const check = isExtractRelevantToTask({
        extract: extracted,
        sourceText,
        target: titleMatch,
        myName,
      });
      if (check.relevant) {
        return {
          taskId: titleMatch.id,
          mode: "evidence",
          reason: `exact title match (dedupe; ${check.reason})`,
        };
      }
    }
    return { taskId: null, mode: "full", reason: "no merge for non-actionable" };
  }

  const keys = [
    ...extractJiraKeysFromText(sourceText),
    ...inferJiraKeysFromBareTicketMentions(sourceText, existingTasks),
  ];
  for (const key of [...new Set(keys)]) {
    const match = findTaskByJiraKey(existingTasks, key);
    if (!match) continue;
    return {
      taskId: match.id,
      mode: "full",
      reason: `jira key ${key}`,
    };
  }

  const hinted = resolveExistingTaskIdHint({
    extracted,
    existingTasks,
    haystack: sourceText,
    myName,
    mode: "full",
    reasonPrefix: "llm existingTaskId",
  });
  if (hinted) return hinted;

  // Topic-only anchor: still requires explicit ownership confirmation — a
  // sole prominent task must never become a magnet for unrelated items.
  const anchor = findOnlyActiveTopicAnchor(existingTasks, sourceText);
  if (anchor) {
    const check = isExtractRelevantToTask({
      extract: extracted,
      sourceText,
      target: anchor,
      myName,
    });
    if (check.relevant) {
      return {
        taskId: anchor.id,
        mode: "full",
        reason: `only-active topic anchor (${check.reason})`,
      };
    }
  }

  const titleMatch = findTaskByExactTitleMatch(existingTasks, extracted.title, myName);
  if (titleMatch) {
    const check = isExtractRelevantToTask({
      extract: extracted,
      sourceText,
      target: titleMatch,
      myName,
    });
    if (check.relevant) {
      return {
        taskId: titleMatch.id,
        mode: "full",
        reason: `exact title match (dedupe; ${check.reason})`,
      };
    }
  }

  return { taskId: null, mode: "full", reason: "genuinely new work" };
}

/** Prefer the most concrete user-owned next step when collapsing extracts. */
export function pickPrimaryExtractedTask<
  T extends ExtractedTaskForMerge & { doneCriteria?: string[] },
>(items: T[]): T {
  const actionable = items.filter((item) => item.status === "actionable");
  const pool = actionable.length > 0 ? actionable : items;
  return [...pool].sort((a, b) => {
    const aLen = a.nextAction.trim().length;
    const bLen = b.nextAction.trim().length;
    if (aLen !== bLen) return bLen - aLen;
    const aCriteria = a.doneCriteria?.length ?? 0;
    const bCriteria = b.doneCriteria?.length ?? 0;
    return bCriteria - aCriteria;
  })[0]!;
}

/** Keep Jira ticket identity in the title when merging transcript updates. */
export function mergeTaskTitle(existingTitle: string, extractedTitle: string): string {
  if (jiraKeyForTask({ title: existingTitle })) return existingTitle;
  return extractedTitle.trim() || existingTitle;
}
