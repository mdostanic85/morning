import type { OwnershipDecision, WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import { isConfirmedOwnership, isRejectedOwnership } from "@/lib/tasks/ownershipDecision";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import type { StoredTodayBriefing } from "@/lib/llm/prompts/todayBriefing";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { normalizePersonName, extractDisplayName } from "@/lib/tasks/personIdentity";

export { extractDisplayName };

export type TodayQueue = Record<Exclude<WorkTaskStatus, "done">, WorkTaskWithEvidence[]>;

function normalizePerson(value: string): string {
  return normalizePersonName(value);
}

/** Split compound owners like "Milos Dostanic and Loza" or "A, B". */
export function ownerParts(owner: string): string[] {
  return owner
    .split(/\s*,\s*|\s+and\s+/i)
    .map(normalizePerson)
    .filter(Boolean);
}

/**
 * True when `person` is the selected user — handles "Milos" vs "Milos Dostanic".
 */
export function personMatchesFilter(
  person: string,
  selectedOwners: Set<string>,
  myName: string | null
): boolean {
  const normalized = normalizePerson(person);
  if (!normalized) return false;

  for (const selected of selectedOwners) {
    if (normalized === selected) return true;
    if (normalized.startsWith(`${selected} `)) return true;
    if (selected.startsWith(`${normalized} `)) return true;
  }

  if (myName) {
    const me = normalizePerson(myName);
    if (normalized === me || normalized.startsWith(`${me} `)) return true;
  }

  return false;
}

export function myOwnerFilter(myName: string | null): Set<string> | null {
  if (!myName?.trim()) return null;
  return new Set([normalizePerson(myName)]);
}

/** @deprecated URL param kept for backwards compat — always returns my-only filter when name is set. */
export function parseSelectedOwners(
  _rawOwners: string | null | undefined,
  myName: string | null
): Set<string> | null {
  return myOwnerFilter(myName);
}

export function taskMatchesOwner(
  task: Pick<WorkTaskWithEvidence, "owner">,
  selectedOwners: Set<string> | null,
  myName: string | null = null
): boolean {
  if (selectedOwners === null) return true;
  // Null/empty owner needs classification — never silently hide via this helper alone.
  // Prefer classifyTaskOwnership() when title/reason evidence is available.
  if (!task.owner?.trim()) return true;
  return ownerParts(task.owner).some((part) => personMatchesFilter(part, selectedOwners, myName));
}

/** Words that look like names in title case but are not people. */
export const NON_PERSON_ACTORS = new Set([
  "please",
  "today",
  "tomorrow",
  "review",
  "make",
  "send",
  "finish",
  "update",
  "check",
  "confirm",
  "waiting",
  "status",
  "priority",
  "project",
  "content",
  "discord",
  "credentials",
  "team",
  "someone",
  "anyone",
  "everyone",
  "user",
  "owner",
  "assignee",
  "jira",
  "figma",
  "design",
  "frontend",
  "backend",
  "hydra",
  "canvas",
  "task",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "next",
  "open",
  "closed",
  "done",
  "blocked",
  "scope",
  "action",
  "item",
]);

export type TaskOwnershipClass = "mine" | "other" | "unclear";

/**
 * Marker appended to a task's reason when the user explicitly disowns it via
 * the "Not mine" control. An explicit user decision must win over every
 * heuristic ownership signal, everywhere the classifier runs.
 */
export const NOT_MINE_NOTE = "Not mine: user marked this as not their responsibility.";

export function isMarkedNotMine(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.includes("Not mine:");
}

export type TaskOwnershipSignals = {
  owner?: string | null;
  title?: string | null;
  reason?: string | null;
  nextAction?: string | null;
  /** Jira assignee when the task is backed by a Jira issue. */
  jiraAssignee?: string | null;
  ownershipDecision?: OwnershipDecision | null;
};

/**
 * Extract a named person attributed as the actor (not the user) from free text.
 * Examples: "Sofija to send…", "assigned to Lucas", "Daniel will follow up".
 */
export function namedForeignActor(
  text: string,
  myName: string | null
): string | null {
  if (!text.trim()) return null;
  const selected = myOwnerFilter(myName);
  const patterns = [
    /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s+(?:to|will|should|needs?\s+to|must)\b/g,
    /\b(?:assigned to|owner[:\s]+|action(?:\s+item)?\s+for)\s*([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) != null) {
      const candidate = match[1]?.trim();
      if (!candidate) continue;
      const first = candidate.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (NON_PERSON_ACTORS.has(first)) continue;
      if (selected && personMatchesFilter(candidate, selected, myName)) continue;
      if (!selected && myName && personMatchesFilter(candidate, new Set([normalizePerson(myName)]), myName)) {
        continue;
      }
      return candidate;
    }
  }
  return null;
}

function firstPersonCommitment(text: string): boolean {
  return /\b(i(?:'ll| will| am going to| need to)|my action|for me to)\b/i.test(text);
}

/**
 * True only when the user is named as the actor — not merely mentioned
 * (e.g. "according to Milos design" must not count as ownership).
 */
export function namedMeAsActor(text: string, myName: string): boolean {
  const me = normalizePerson(myName);
  if (!me || !text.trim()) return false;
  const firstName = me.split(/\s+/)[0];
  if (firstName.length < 3) return false;

  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameAlt = `${escape(firstName)}(?:\\s+${escape(me.slice(firstName.length).trim())})?`;
  const patterns = [
    new RegExp(`\\b${nameAlt}\\s+(?:to|will|should|needs?\\s+to|must)\\b`, "i"),
    new RegExp(
      `\\b(?:assigned to|owner[:\\s]+|action(?:\\s+item)?\\s+for)\\s*${nameAlt}\\b`,
      "i"
    ),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Classify whether a task belongs on the user's brief.
 * - mine: explicit owner/assignee match, or first-person / my-name-as-actor signal
 * - other: explicit other owner/assignee, or text attributes the action to someone else
 * - unclear: no owner and no reliable signal (never force into ranked priorities)
 */
export function classifyTaskOwnership(
  task: TaskOwnershipSignals,
  myName: string | null
): TaskOwnershipClass {
  // Durable user decisions beat every heuristic, including legacy reason notes.
  if (isRejectedOwnership(task)) return "other";
  if (isConfirmedOwnership(task)) return "mine";
  // Legacy "Not mine" note still wins when ownershipDecision is unset.
  if (isMarkedNotMine(task.reason)) return "other";
  if (!myName?.trim()) return "unclear";

  const selected = myOwnerFilter(myName);
  if (!selected) return "unclear";

  if (task.owner?.trim()) {
    return ownerParts(task.owner).some((part) => personMatchesFilter(part, selected, myName))
      ? "mine"
      : "other";
  }

  if (task.jiraAssignee?.trim()) {
    return personMatchesFilter(task.jiraAssignee, selected, myName) ? "mine" : "other";
  }

  const blob = [task.title, task.reason, task.nextAction].filter(Boolean).join("\n");
  const foreign = namedForeignActor(blob, myName);
  if (foreign) return "other";

  if (firstPersonCommitment(blob)) return "mine";
  if (namedMeAsActor(blob, myName)) return "mine";

  // A bare mention of the user's name (e.g. "according to Milos design") is
  // not ownership. Leave unattributed work as unclear — never force it.
  return "unclear";
}

/** True when the task may appear in todayFirst / afterThat. */
export function taskEligibleForBriefPriority(
  task: TaskOwnershipSignals,
  myName: string | null
): boolean {
  if (isRejectedOwnership(task)) return false;
  if (isConfirmedOwnership(task)) return true;
  return classifyTaskOwnership(task, myName) === "mine";
}

export function parseJiraAssigneeFromText(text: string): string | null {
  const match = text.match(/^Assignee:\s*(.+)$/im);
  const value = match?.[1]?.trim();
  if (!value || value === "unknown" || value === "unassigned") return null;
  return value;
}

function jiraAssigneeMatches(
  assignee: string | null | undefined,
  selectedOwners: Set<string>,
  myName: string | null
): boolean {
  if (!assignee?.trim()) return false;
  return personMatchesFilter(assignee, selectedOwners, myName);
}

function jiraBriefingItemMatchesAssignee(
  item: StoredTodayBriefing["jiraPending"][number],
  selectedOwners: Set<string>,
  myName: string | null,
  jiraSourceByKey: Map<string, string>
): boolean {
  if (jiraAssigneeMatches(item.assignee, selectedOwners, myName)) return true;

  for (const quote of item.evidenceQuotes) {
    const assignee = parseJiraAssigneeFromText(quote.quote);
    if (assignee && personMatchesFilter(assignee, selectedOwners, myName)) return true;
  }

  const sourceBody = jiraSourceByKey.get(item.key);
  if (sourceBody) {
    const assignee = parseJiraBodyFields(sourceBody).assignee;
    if (jiraAssigneeMatches(assignee, selectedOwners, myName)) return true;
  }

  return false;
}

export function filterQueueByOwners(
  queue: TodayQueue,
  selectedOwners: Set<string> | null,
  myName: string | null = null
): TodayQueue {
  if (selectedOwners === null) return queue;

  const filtered = { ...queue };
  for (const status of OPEN_QUEUE_STATUSES) {
    filtered[status] = queue[status].filter((task) =>
      taskMatchesOwner(task, selectedOwners, myName)
    );
  }
  return filtered;
}

export function filterBriefingByOwners(
  briefing: StoredTodayBriefing,
  allTasksById: Map<number, WorkTaskWithEvidence>,
  selectedOwners: Set<string> | null,
  myName: string | null = null,
  jiraSourceByKey: Map<string, string> = new Map()
): StoredTodayBriefing {
  if (selectedOwners === null) return briefing;

  const focusItems = briefing.focusItems.filter((item) => {
    if (item.linkedTaskId != null) {
      const task = allTasksById.get(item.linkedTaskId);
      return task != null && taskMatchesOwner(task, selectedOwners, myName);
    }
    if (item.linkedJiraKey) {
      const jiraItem = briefing.jiraPending.find((entry) => entry.key === item.linkedJiraKey);
      if (
        jiraItem &&
        jiraBriefingItemMatchesAssignee(jiraItem, selectedOwners, myName, jiraSourceByKey)
      ) {
        return true;
      }
      const sourceBody = jiraSourceByKey.get(item.linkedJiraKey);
      if (sourceBody) {
        const assignee = parseJiraBodyFields(sourceBody).assignee;
        return jiraAssigneeMatches(assignee, selectedOwners, myName);
      }
    }
    return false;
  });

  const jiraPending = briefing.jiraPending.filter((item) =>
    jiraBriefingItemMatchesAssignee(item, selectedOwners, myName, jiraSourceByKey)
  );

  return {
    ...briefing,
    focusItems,
    jiraPending,
    waitingOn: [],
    risks: [],
    jiraIssueCount: jiraPending.length,
    summary:
      focusItems.length > 0
        ? `Your focus today: ${focusItems[0].title}.`
        : briefing.jiraIssueCount > 0
          ? `No queued tasks matched your name — ${briefing.jiraIssueCount} assigned Jira issue(s) in the background.`
          : "Nothing assigned to you in today's briefing. Sync again after updating your name in Settings.",
  };
}

export function ownerFilterLabel(
  selectedOwners: Set<string> | null,
  _owners: string[],
  myName: string | null
): string | null {
  if (selectedOwners === null) return null;
  if (myName && selectedOwners.has(normalizePerson(myName))) return "Assigned to me";
  return "My tasks";
}
