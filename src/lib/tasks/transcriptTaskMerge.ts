import { extractJiraKeyFromTitle } from "@/lib/tasks/resolveFocusTask";
import { isTranscriptSource } from "@/lib/tasks/sourceAuthority";

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
]);

export interface MergeCandidateTask {
  id: number;
  title: string;
  reason: string;
  nextAction: string;
  status: string;
  projectId: number | null;
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

/**
 * When a transcript does not name a Jira key, prefer the single active open
 * task that clearly shares domain language with the meeting / extract.
 */
export function findOnlyActiveTopicAnchor(
  tasks: MergeCandidateTask[],
  topicText: string
): MergeCandidateTask | null {
  const active = tasks.filter((task) => ACTIVE_MERGE_STATUSES.has(task.status));
  if (active.length === 0) return null;

  const focusActive = active.filter(
    (task) => task.status === "now" || task.status === "next"
  );

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

  // Sole now/next task + any domain overlap → that is the work being discussed.
  if (focusActive.length === 1) {
    const sole = focusActive[0];
    const soleScore =
      scored.find((entry) => entry.task.id === sole.id)?.score ?? 0;
    if (soleScore >= 1) return sole;
  }

  // Sole active open task (including later) with solid overlap.
  if (active.length === 1 && (scored[0]?.score ?? 0) >= 1) {
    return active[0];
  }

  if (withOverlap.length === 0) return null;
  if (withOverlap.length === 1) return withOverlap[0].task;

  // Exactly one clear winner among several active tasks.
  if (withOverlap[0].score >= withOverlap[1].score + 2) {
    return withOverlap[0].task;
  }

  return null;
}

/**
 * Deterministic merge target for transcript extractions.
 * LLM existingTaskId is a hint; Jira key + only-active topic win.
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
}): TranscriptMergeResolution {
  const { source, extracted, existingTasks } = input;

  if (!isTranscriptSource(source)) {
    if (
      extracted.existingTaskId != null &&
      existingTasks.some((task) => task.id === extracted.existingTaskId)
    ) {
      return {
        taskId: extracted.existingTaskId,
        mode: "full",
        reason: "non-transcript existingTaskId",
      };
    }
    return { taskId: null, mode: "full", reason: "non-transcript new work" };
  }

  const haystack = [
    source.title ?? "",
    source.body ?? "",
    extracted.title,
    extracted.reason,
    extracted.nextAction,
  ].join("\n");

  // waiting / unclear stay as their own queue items unless the LLM already
  // pointed at an existing task — otherwise Sofija-owned grooming would get
  // swallowed into the user's design ticket.
  if (extracted.status !== "actionable") {
    if (
      extracted.existingTaskId != null &&
      existingTasks.some((task) => task.id === extracted.existingTaskId)
    ) {
      return {
        taskId: extracted.existingTaskId,
        mode: "evidence",
        reason: "llm existingTaskId (non-actionable)",
      };
    }
    return { taskId: null, mode: "full", reason: "no merge for non-actionable" };
  }

  const keys = [
    ...extractJiraKeysFromText(haystack),
    ...inferJiraKeysFromBareTicketMentions(haystack, existingTasks),
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

  if (
    extracted.existingTaskId != null &&
    existingTasks.some((task) => task.id === extracted.existingTaskId)
  ) {
    return {
      taskId: extracted.existingTaskId,
      mode: "full",
      reason: "llm existingTaskId",
    };
  }

  const anchor = findOnlyActiveTopicAnchor(existingTasks, haystack);
  if (anchor) {
    return {
      taskId: anchor.id,
      mode: "full",
      reason: "only-active topic anchor",
    };
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
