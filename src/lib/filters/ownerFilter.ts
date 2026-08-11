import type { OwnershipDecision, WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import { isConfirmedOwnership, isRejectedOwnership } from "@/lib/tasks/ownershipDecision";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import type { StoredTodayBriefing } from "@/lib/llm/prompts/todayBriefing";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { normalizePersonName, extractDisplayName } from "@/lib/tasks/personIdentity";
import { matchesStakeholder } from "@/lib/tasks/highAuthorityPeople";

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
  /**
   * People @mentioned in the Jira issue or its comments. A mention says the
   * issue is pointed at someone without saying they own the work.
   */
  jiraMentions?: readonly (string | null | undefined)[] | null;
  /** Jira labels on the issue — a label naming a person tags it for them. */
  jiraLabels?: readonly (string | null | undefined)[] | null;
  ownershipDecision?: OwnershipDecision | null;
  /**
   * Verbatim quotes taken from the source itself. This is the only free text
   * allowed to prove ownership — `title`/`reason`/`nextAction` are written by
   * the LLM, so a paraphrase like "Milos needs to…" is not evidence.
   */
  evidenceQuotes?: readonly (string | null | undefined)[] | null;
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

export function firstPersonCommitment(text: string): boolean {
  return /\b(i(?:'ll| will| am going to| need to)|my action|for me to)\b/i.test(text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex fragment matching the user's first name, optionally followed by the surname. */
function myNamePattern(myName: string): string | null {
  const me = normalizePerson(myName);
  if (!me) return null;
  const firstName = me.split(/\s+/)[0] ?? "";
  if (firstName.length < 3) return null;
  const surname = me.slice(firstName.length).trim();
  return surname
    ? `${escapeRegex(firstName)}(?:\\s+${escapeRegex(surname)})?`
    : escapeRegex(firstName);
}

/**
 * True only when the user is named as the actor — not merely mentioned
 * (e.g. "according to Milos design" must not count as ownership).
 *
 * Only meaningful on verbatim source text. Never call it on LLM-authored
 * fields: the model writing "Milos must confirm…" is not an ownership signal.
 */
export function namedMeAsActor(text: string, myName: string): boolean {
  const nameAlt = myNamePattern(myName);
  if (!nameAlt || !text.trim()) return false;

  const patterns = [
    new RegExp(`\\b${nameAlt}\\s+(?:to|will|should|needs?\\s+to|must)\\b`, "i"),
    new RegExp(
      `\\b(?:assigned to|owner[:\\s]+|action(?:\\s+item)?\\s+for)\\s*${nameAlt}\\b`,
      "i"
    ),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

/** "assigned to Milos", "Owner: Milos" — an explicit assignment written in the source. */
export function assignsWorkToMe(text: string, myName: string): boolean {
  const nameAlt = myNamePattern(myName);
  if (!nameAlt || !text.trim()) return false;
  return new RegExp(
    `\\b(?:assigned to|owner[:\\s]+|action(?:\\s+item)?\\s+for)\\s*${nameAlt}\\b`,
    "i"
  ).test(text);
}

/**
 * Someone speaking to the user: "Milos, can you…", "@Milos please…", "Hey Milos".
 */
export function addressesMe(text: string, myName: string): boolean {
  const nameAlt = myNamePattern(myName);
  if (!nameAlt || !text.trim()) return false;
  const patterns = [
    new RegExp(`@${nameAlt}\\b`, "i"),
    new RegExp(
      `\\b${nameAlt}\\b[,:]?\\s+(?:can|could|will|would|do)\\s+you\\b`,
      "i"
    ),
    new RegExp(`\\b${nameAlt}\\b\\s*[,:]\\s*(?:please|pls)\\b`, "i"),
    new RegExp(`\\b(?:hey|hi|hello)\\s+${nameAlt}\\b`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * The user's own speaker turn stating what he will do — e.g.
 * "Milos: I will finish the remaining Canvas screens."
 *
 * The commitment must be attributed to the user's turn. Bare first-person text
 * ("I'll send it") proves nothing, because the speaker may be anyone.
 */
export function myOwnCommitmentTurn(text: string, myName: string): boolean {
  const nameAlt = myNamePattern(myName);
  if (!nameAlt || !text.trim()) return false;
  const turn = new RegExp(`^[\\s>*-]*${nameAlt}\\s*[:\\-—–]\\s*(.+)$`, "im");
  const match = text.match(turn);
  return match ? firstPersonCommitment(match[1] ?? "") : false;
}

/**
 * Matt Pettit (PM) or Lucas Saeed (Design Lead) telling the user what they
 * expect, or handing him new information.
 */
export function stakeholderDirectedAtMe(text: string, myName: string): boolean {
  if (!text.trim() || !matchesStakeholder(text)) return false;
  if (addressesMe(text, myName) || assignsWorkToMe(text, myName)) return true;

  const speakerTurn = text.match(
    /^[\s>*-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:\-—–]\s*(.+)$/m
  );
  if (!speakerTurn) return false;

  const speaker = speakerTurn[1] ?? "";
  const said = speakerTurn[2] ?? "";
  if (!matchesStakeholder(speaker, undefined, { authorField: true })) return false;
  // A stakeholder naming a different actor is an instruction to that person.
  if (namedForeignActor(said, myName)) return false;

  if (namedMeAsActor(said, myName)) return true;
  // Expectation or handover aimed at "you" inside the stakeholder's own turn.
  return /\b(?:please|can you|could you|i need you to|i want you to|you (?:should|need to|must|can)|heads up|fyi|for your awareness)\b/i.test(
    said
  );
}

/**
 * Another person's speaker turn committing to the work — "Sofija: I'll send
 * the credentials". The same sentence without the speaker prefix proves
 * nothing, which is exactly why first-person text alone is never trusted.
 */
export function foreignCommitmentTurn(text: string, myName: string | null): boolean {
  if (!text.trim()) return false;
  const turn = text.match(
    /^[\s>*-]*([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\s*[:\-—–]\s*(.+)$/m
  );
  if (!turn) return false;

  const speaker = turn[1] ?? "";
  if (NON_PERSON_ACTORS.has(speaker.split(/\s+/)[0]?.toLowerCase() ?? "")) return false;
  if (myName) {
    const selected = myOwnerFilter(myName);
    if (selected && personMatchesFilter(speaker, selected, myName)) return false;
  }
  return firstPersonCommitment(turn[2] ?? "");
}

function usableQuotes(
  quotes: TaskOwnershipSignals["evidenceQuotes"]
): string[] {
  if (!quotes?.length) return [];
  return quotes
    .map((quote) => (typeof quote === "string" ? quote.trim() : ""))
    .filter((quote) => quote.length > 0);
}

/**
 * Source-backed proof that the work is the user's. Accepts only verbatim
 * source quotes — see `TaskOwnershipSignals.evidenceQuotes`.
 */
export function evidenceProvesMine(
  quotes: readonly (string | null | undefined)[] | null | undefined,
  myName: string | null
): boolean {
  if (!myName?.trim()) return false;
  return usableQuotes(quotes).some(
    (quote) =>
      addressesMe(quote, myName) ||
      myOwnCommitmentTurn(quote, myName) ||
      stakeholderDirectedAtMe(quote, myName) ||
      assignsWorkToMe(quote, myName)
  );
}

/** True when one of the Jira @mentions is the user. */
export function jiraMentionsMe(
  mentions: TaskOwnershipSignals["jiraMentions"],
  myName: string | null
): boolean {
  if (!mentions?.length || !myName?.trim()) return false;
  const selected = myOwnerFilter(myName);
  if (!selected) return false;
  return mentions.some((mention) => {
    const value = typeof mention === "string" ? mention.trim() : "";
    if (!value) return false;
    return personMatchesFilter(value, selected, myName);
  });
}

/**
 * True when a Jira label names the user. Labels carry no spaces, so
 * "milos-dostanic" / "milos_dostanic" are unpacked before matching.
 */
export function jiraLabelNamesMe(
  labels: TaskOwnershipSignals["jiraLabels"],
  myName: string | null
): boolean {
  if (!labels?.length || !myName?.trim()) return false;
  const selected = myOwnerFilter(myName);
  if (!selected) return false;
  return labels.some((label) => {
    const value = typeof label === "string" ? label.trim() : "";
    if (!value) return false;
    return personMatchesFilter(value.replace(/[-_.]+/g, " "), selected, myName);
  });
}

/**
 * Classify whether a task belongs on the user's brief.
 *
 * A task is "mine" only when a real source signal says so:
 *   1. the resolved `owner` field, or the Jira assignee;
 *   2. a source quote addressed to the user;
 *   3. the user's own speaker turn committing to the work;
 *   4. a Matt Pettit / Lucas Saeed instruction or handover directed at the user;
 *   5. explicit assignment wording inside a source quote.
 *
 * Precedence: a resolved `owner` settles it outright. With no owner, source
 * proof (2–5) is checked *before* the "someone else is the assignee" verdict —
 * an issue assigned to another person can still carry an explicit "@Milos, you
 * own the contract part" instruction, and that instruction is the user's work
 * even though the assignee differs.
 *
 * A bare Jira @mention or a label naming the user is weaker — it says the issue
 * is pointed at them, not that the work is theirs. That lands as "unclear": it
 * stays visible and one click away from being claimed, instead of being hidden
 * as someone else's like it used to be.
 *
 * `title` / `reason` / `nextAction` are LLM-authored, so they can only ever
 * disown a task (naming a different actor) — never claim it. Everything
 * unproven stays "unclear" rather than being forced onto the user.
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

  const quotes = usableQuotes(task.evidenceQuotes);
  const llmProse = [task.title, task.reason, task.nextAction].filter(Boolean).join("\n");

  // Mentioned or tagged, but nothing directed at the user: related to them,
  // ownership still open. Never "other" — that would hide it entirely.
  const taggedForMe =
    jiraMentionsMe(task.jiraMentions, myName) || jiraLabelNamesMe(task.jiraLabels, myName);
  const unprovenClass: TaskOwnershipClass = taggedForMe ? "unclear" : "other";

  // The resolved `owner` decides on its own, before anything else. It is only
  // written when the source itself named who owns the work, so it outranks both
  // the mechanical Jira assignee and quote-level proof — the same reason a merge
  // may never overwrite an owner with a different person (`resolveMergedOwner`).
  if (task.owner?.trim()) {
    return ownerParts(task.owner).some((part) => personMatchesFilter(part, selected, myName))
      ? "mine"
      : unprovenClass;
  }

  if (task.jiraAssignee?.trim() && personMatchesFilter(task.jiraAssignee, selected, myName)) {
    return "mine";
  }

  // With no resolved owner, source proof outranks a *mechanical* Jira assignee:
  // an issue assigned to another person can still carry an explicit "@Milos, you
  // own the contract part" instruction, and that instruction is the user's work.
  if (evidenceProvesMine(quotes, myName)) return "mine";

  if (task.jiraAssignee?.trim()) return unprovenClass;

  // Attribution to a named third party disowns the task, from either text.
  if (namedForeignActor(llmProse, myName)) return unprovenClass;
  if (
    quotes.some(
      (quote) =>
        namedForeignActor(quote, myName) || foreignCommitmentTurn(quote, myName)
    )
  ) {
    return unprovenClass;
  }

  // No owner, no assignee, no source quote proving this is the user's work.
  // "Milos needs to…" written by the model is not evidence — stay unclear.
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
