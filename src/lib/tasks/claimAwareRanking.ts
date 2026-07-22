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

/** Boost for a fresh formal Jira assignment to the user. */
export const NEW_ASSIGNMENT_BOOST = 520;

/**
 * Boost when open Jira work was updated recently but we cannot confirm a
 * same-day assignee change — still prefer it over stale In Progress tickets.
 */
export const FRESH_OPEN_UPDATE_BOOST = 380;

/** Penalty when transcript force-include conflicts with Jira Done. */
export const DONE_OVERRIDES_TRANSCRIPT_PENALTY = 900;

function personOverlap(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function updatedWithinWindow(
  jiraUpdatedAt: string | null | undefined,
  nowMs: number,
  windowMs: number
): boolean {
  if (!jiraUpdatedAt) return false;
  const updated = new Date(jiraUpdatedAt).getTime();
  if (Number.isNaN(updated)) return false;
  const age = nowMs - updated;
  return age >= 0 && age <= windowMs;
}

/**
 * True when this Jira item looks like freshly owned open work for the user.
 * Uses a rolling 72h window (not just calendar "today") so evening assigns
 * still surface the next morning.
 */
export function isNewJiraAssignment(input: {
  jiraUpdatedAt: string | null | undefined;
  /** Kept for call-site compatibility; window is absolute from now. */
  today: string;
  assignee: string | null | undefined;
  myName: string | null | undefined;
  /** Fallback when Jira assignee metadata is missing on the source row. */
  taskOwner?: string | null;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  const myName = input.myName?.trim() || null;
  if (!myName) return false;

  const assignee = input.assignee?.trim() || null;
  const taskOwner = input.taskOwner?.trim() || null;
  const owned =
    (assignee != null && personOverlap(assignee, myName)) ||
    (assignee == null && taskOwner != null && personOverlap(taskOwner, myName));
  if (!owned) return false;

  return updatedWithinWindow(
    input.jiraUpdatedAt,
    input.nowMs ?? Date.now(),
    input.windowMs ?? NEW_ASSIGNMENT_WINDOW_MS
  );
}

/** Open (not Done) Jira work updated inside the freshness window. */
export function isFreshOpenJiraUpdate(input: {
  jiraUpdatedAt: string | null | undefined;
  jiraStatus: string | null | undefined;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  if (isJiraDoneStatus(input.jiraStatus)) return false;
  return updatedWithinWindow(
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
