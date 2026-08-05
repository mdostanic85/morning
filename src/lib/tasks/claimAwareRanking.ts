/**
 * Claim-aware ranking adjustments (Paket 6).
 * Mechanical Jira status/assignment vs transcript instruction are separate dimensions.
 */

import { isJiraDoneStatus } from "@/lib/tasks/canonicalKey";

export type ClaimType =
  | "assignment"
  | "mechanical_status"
  | "priority_due"
  | "requirement_baseline"
  | "action_instruction"
  | "completion_evidence";

export type ClaimFact = {
  type: ClaimType;
  authority: "jira" | "transcript" | "prd" | "artifact";
  jiraKey?: string | null;
  isNewAssignment?: boolean;
  jiraStatus?: string | null;
  assignedToday?: boolean;
};

/** How long an update counts as "new / just landed" for queue priority. */
export const NEW_ASSIGNMENT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Boost for a fresh formal Jira assignment to the user. Recency is a
 * supporting/tiebreak signal, so this is intentionally small enough that it
 * can order two comparably-important items but cannot let a freshly-assigned
 * low-priority ticket outrank an important one. See day-sync forensic audit
 * §6.4 (importance must dominate recency).
 */
export const NEW_ASSIGNMENT_BOOST = 90;

/**
 * Boost when open Jira work was updated recently but we cannot confirm a
 * same-day assignee change — still prefer it over stale In Progress tickets,
 * but only as a tiebreak, never over explicit importance.
 */
export const FRESH_OPEN_UPDATE_BOOST = 60;

/** Penalty when transcript force-include conflicts with Jira Done. */
export const DONE_OVERRIDES_TRANSCRIPT_PENALTY = 900;

function personOverlap(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function timestampWithinWindow(
  timestamp: string | null | undefined,
  nowMs: number,
  windowMs: number
): boolean {
  if (!timestamp) return false;
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at)) return false;
  const age = nowMs - at;
  return age >= 0 && age <= windowMs;
}

/**
 * Evidence that the assignment itself changed, as opposed to the issue merely
 * being touched. Jira's `updated` moves for any edit — a comment on a ticket
 * assigned months ago bumps it exactly like a real assignment does — so
 * freshness of `updated` alone can never justify calling work "newly assigned".
 */
export type JiraAssignmentEvidence = {
  /**
   * When the issue was assigned to its current assignee, where a changelog or
   * first-seen record can say. Authoritative when present.
   */
  assignmentChangedAt?: string | null;
  /**
   * Previously observed assignee. `undefined` means no history is available;
   * `null` means the issue was previously unassigned.
   */
  previousAssignee?: string | null;
  /**
   * Jira issue creation time. An issue created inside the window already
   * assigned to the user is a new assignment by construction.
   */
  issueCreatedAt?: string | null;
};

/**
 * True when this Jira item is freshly *assigned* open work for the user —
 * assignee is the user AND something proves the assignment itself landed
 * inside the window. Uses a rolling 72h window (not just calendar "today")
 * so evening assigns still surface the next morning.
 *
 * Without any assignment evidence this returns false. A recently touched
 * ticket the user already owned is still ranked as fresh open work via
 * `isFreshOpenJiraUpdate`; it just is not announced as a new assignment.
 */
export function isNewJiraAssignment(
  input: {
    jiraUpdatedAt: string | null | undefined;
    /** Kept for call-site compatibility; window is absolute from now. */
    today: string;
    assignee: string | null | undefined;
    myName: string | null | undefined;
    /** Fallback when Jira assignee metadata is missing on the source row. */
    taskOwner?: string | null;
    nowMs?: number;
    windowMs?: number;
  } & JiraAssignmentEvidence
): boolean {
  const myName = input.myName?.trim() || null;
  if (!myName) return false;

  const assignee = input.assignee?.trim() || null;
  const taskOwner = input.taskOwner?.trim() || null;
  const owned =
    (assignee != null && personOverlap(assignee, myName)) ||
    (assignee == null && taskOwner != null && personOverlap(taskOwner, myName));
  if (!owned) return false;

  const nowMs = input.nowMs ?? Date.now();
  const windowMs = input.windowMs ?? NEW_ASSIGNMENT_WINDOW_MS;

  // A recorded assignment time settles it either way: inside the window it is
  // a new assignment, outside it the ticket has simply been touched since.
  if (input.assignmentChangedAt != null) {
    return timestampWithinWindow(input.assignmentChangedAt, nowMs, windowMs);
  }

  // History without a timestamp: only an assignee that actually changed to the
  // user counts, and the change must be what made the issue recent.
  if (input.previousAssignee !== undefined) {
    const previous = input.previousAssignee?.trim() || null;
    const changedToMe = previous == null || !personOverlap(previous, myName);
    return changedToMe && timestampWithinWindow(input.jiraUpdatedAt, nowMs, windowMs);
  }

  return timestampWithinWindow(input.issueCreatedAt, nowMs, windowMs);
}

/** Open (not Done) Jira work updated inside the freshness window. */
export function isFreshOpenJiraUpdate(input: {
  jiraUpdatedAt: string | null | undefined;
  jiraStatus: string | null | undefined;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  if (isJiraDoneStatus(input.jiraStatus)) return false;
  return timestampWithinWindow(
    input.jiraUpdatedAt,
    input.nowMs ?? Date.now(),
    input.windowMs ?? NEW_ASSIGNMENT_WINDOW_MS
  );
}

export function claimAwareScoreAdjustment(input: {
  forceInclude: boolean;
  jiraStatus: string | null | undefined;
  newAssignment: boolean;
  /** Recently updated open Jira — used when newAssignment is false. */
  freshOpenUpdate?: boolean;
}): { scoreDelta: number; forceInclude: boolean; notes: string[] } {
  const notes: string[] = [];
  let scoreDelta = 0;
  let forceInclude = input.forceInclude;

  if (isJiraDoneStatus(input.jiraStatus)) {
    // Jira mechanical Done beats transcript forceInclude for the same work item.
    forceInclude = false;
    scoreDelta -= DONE_OVERRIDES_TRANSCRIPT_PENALTY;
    notes.push("Jira Done overrides older meeting commitment for this work item");
  }

  if (input.newAssignment && !isJiraDoneStatus(input.jiraStatus)) {
    scoreDelta += NEW_ASSIGNMENT_BOOST;
    notes.push("New formal Jira assignment");
  } else if (input.freshOpenUpdate && !isJiraDoneStatus(input.jiraStatus)) {
    scoreDelta += FRESH_OPEN_UPDATE_BOOST;
    notes.push("Recently updated open Jira work");
  }

  return { scoreDelta, forceInclude, notes };
}

export function authorityForClaim(type: ClaimType): ClaimFact["authority"] {
  switch (type) {
    case "assignment":
    case "mechanical_status":
    case "priority_due":
      return "jira";
    case "requirement_baseline":
      return "prd";
    case "action_instruction":
      return "transcript";
    case "completion_evidence":
      return "artifact";
  }
}
