import type { WorkTaskStatus } from "@/domain/workTask";
import { effectiveExtractionConfidence } from "@/lib/tasks/plannerConfidence";
import {
  classifyTaskOwnership,
  myOwnerFilter,
  taskMatchesOwner,
} from "@/lib/filters/ownerFilter";
import { isConfirmedOwnership, isRejectedOwnership } from "@/lib/tasks/ownershipDecision";

export type TaskForVisibility = {
  id: number;
  owner: string | null;
  confidence: number | null;
  priorityScore: number | null;
  ownershipDecision?: import("@/domain/workTask").OwnershipDecision | null;
  status?: WorkTaskStatus;
  title?: string;
  reason?: string;
  nextAction?: string;
  jiraAssignee?: string | null;
  /** Verbatim source quotes — the only free text allowed to prove ownership. */
  evidence?: readonly { quote: string | null }[];
};

/**
 * Ownership inputs for one task. Evidence quotes come from the source, so they
 * may prove ownership; title/reason/nextAction are LLM-authored and may not.
 */
function ownershipSignalsFor(task: TaskForVisibility) {
  return {
    owner: task.owner,
    title: task.title,
    reason: task.reason,
    nextAction: task.nextAction,
    jiraAssignee: task.jiraAssignee,
    ownershipDecision: task.ownershipDecision,
    evidenceQuotes: task.evidence?.map((item) => item.quote),
  };
}

export type VisibilityReason =
  | "owned"
  | "null_owner_needs_classification"
  | "other_owner"
  | "confidence_unknown_ok"
  | "low_confidence_show_as_unclear";

export type TaskVisibilityDecision = {
  visible: boolean;
  reason: VisibilityReason;
  /** When true, UI should treat the task as Unclear even if status differs. */
  treatAsUnclear: boolean;
};

/**
 * Today visibility rules (Paket 2):
 * - explicit owned / my-name match → visible
 * - owner null with no foreign attribution → visible as Unclear (needs classification)
 * - other owner / foreign attribution → hidden
 * - low real confidence → still visible, marked Unclear (never drop via 0.8 gate)
 * - confidence that equals priorityScore is ignored (contaminated)
 */
export function decideTaskVisibility(
  task: TaskForVisibility,
  myName: string | null
): TaskVisibilityDecision {
  if (isRejectedOwnership(task)) {
    return {
      visible: false,
      reason: "other_owner",
      treatAsUnclear: false,
    };
  }

  const ownership = isConfirmedOwnership(task)
    ? "mine"
    : classifyTaskOwnership(ownershipSignalsFor(task), myName);

  if (ownership === "other") {
    return {
      visible: false,
      reason: "other_owner",
      treatAsUnclear: false,
    };
  }

  // Keep legacy owner-field check for callers that only pass owner.
  const selectedOwners = myOwnerFilter(myName);
  if (selectedOwners !== null && !taskMatchesOwner(task, selectedOwners, myName)) {
    return {
      visible: false,
      reason: "other_owner",
      treatAsUnclear: false,
    };
  }

  if (ownership === "unclear" || !task.owner?.trim()) {
    return {
      visible: true,
      reason: "null_owner_needs_classification",
      treatAsUnclear: true,
    };
  }

  const confidence = effectiveExtractionConfidence({
    confidence: task.confidence,
    priorityScore: task.priorityScore,
  });

  if (confidence != null && confidence < 0.5) {
    return {
      visible: true,
      reason: "low_confidence_show_as_unclear",
      treatAsUnclear: true,
    };
  }

  if (confidence == null) {
    return {
      visible: true,
      reason: "confidence_unknown_ok",
      treatAsUnclear: false,
    };
  }

  return {
    visible: true,
    reason: "owned",
    treatAsUnclear: false,
  };
}

/** Filter open tasks for Today — no global confidence >= 0.8 drop. */
export function filterTasksForTodayView<T extends TaskForVisibility>(
  tasks: T[],
  myName: string | null
): T[] {
  return tasks.filter((task) => decideTaskVisibility(task, myName).visible);
}

export type TodayOwnershipPartition<T> = {
  /** Work a real source signal proves is the user's — the main Today list. */
  mine: T[];
  /** Visible elsewhere, but nothing proves who owns it — excluded from Today. */
  noOwner: T[];
};

/**
 * Split visible Today work by whether ownership is actually proven.
 *
 * Unowned tasks are never silently mixed into the main list. They stay out of
 * the Today brief until ownership is resolved (claim / mark not mine).
 */
export function partitionTasksByOwnership<T extends TaskForVisibility>(
  tasks: T[],
  myName: string | null
): TodayOwnershipPartition<T> {
  const mine: T[] = [];
  const noOwner: T[] = [];

  for (const task of tasks) {
    if (!decideTaskVisibility(task, myName).visible) continue;
    const ownership = isConfirmedOwnership(task)
      ? "mine"
      : classifyTaskOwnership(ownershipSignalsFor(task), myName);
    if (ownership === "mine") mine.push(task);
    else noOwner.push(task);
  }

  return { mine, noOwner };
}

/** Ranked brief slots (todayFirst / afterThat) — only work clearly owned by the user. */
export function filterTasksForBriefPriority<T extends TaskForVisibility>(
  tasks: T[],
  myName: string | null
): T[] {
  return tasks.filter(
    (task) => classifyTaskOwnership(ownershipSignalsFor(task), myName) === "mine"
  );
}
