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

/** Boost for a same-day (or very fresh) formal Jira assignment. */
export const NEW_ASSIGNMENT_BOOST = 520;

/** Penalty when transcript force-include conflicts with Jira Done. */
export const DONE_OVERRIDES_TRANSCRIPT_PENALTY = 900;

export function isNewJiraAssignment(input: {
  jiraUpdatedAt: string | null | undefined;
  today: string;
  assignee: string | null | undefined;
  myName: string | null | undefined;
}): boolean {
  if (!input.assignee || !input.myName) return false;
  if (!personOverlap(input.assignee, input.myName)) return false;
  if (!input.jiraUpdatedAt) return false;
  return input.jiraUpdatedAt.slice(0, 10) === input.today;
}

function personOverlap(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

export function claimAwareScoreAdjustment(input: {
  forceInclude: boolean;
  jiraStatus: string | null | undefined;
  newAssignment: boolean;
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
