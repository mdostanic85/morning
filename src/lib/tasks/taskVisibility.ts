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
};

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
    : classifyTaskOwnership(
    {
      owner: task.owner,
      title: task.title,
      reason: task.reason,
      nextAction: task.nextAction,
      jiraAssignee: task.jiraAssignee,
    },
    myName
  );

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

/** Ranked brief slots (todayFirst / afterThat) — only work clearly owned by the user. */
export function filterTasksForBriefPriority<T extends TaskForVisibility>(
  tasks: T[],
  myName: string | null
): T[] {
  return tasks.filter(
    (task) =>
      classifyTaskOwnership(
        {
          owner: task.owner,
          title: task.title,
          reason: task.reason,
          nextAction: task.nextAction,
          jiraAssignee: task.jiraAssignee,
        },
        myName
      ) === "mine"
  );
}
