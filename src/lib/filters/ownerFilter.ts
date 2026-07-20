import type { WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import type { StoredTodayBriefing } from "@/lib/llm/prompts/todayBriefing";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";

export type TodayQueue = Record<Exclude<WorkTaskStatus, "done">, WorkTaskWithEvidence[]>;

function normalizePerson(value: string): string {
  return value.trim().toLowerCase();
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
  if (!task.owner?.trim()) return false;
  return ownerParts(task.owner).some((part) => personMatchesFilter(part, selectedOwners, myName));
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
