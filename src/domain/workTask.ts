import type { TaskWorkContextSnapshot } from "./taskWorkContext";
import type { ConfidenceComponents } from "@/lib/tasks/confidenceModel";
import type { TaskOverrideRecord } from "@/lib/tasks/taskOverride";

export interface TaskMeetingContextEntry {
  sourceItemId: number;
  sourceTitle: string;
  sourceType: string;
  sourceDate: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  requestedChanges: string[];
  openQuestions: string[];
  evidenceQuotes: string[];
  confidence: number;
}

export const WORK_TASK_STATUSES = [
  "now",
  "next",
  "later",
  "waiting",
  "tomorrow",
  "unclear",
  "done",
] as const;
export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];

/** The statuses shown in the Today queue — "done" tasks are archived out of view. */
export const OPEN_QUEUE_STATUSES = WORK_TASK_STATUSES.filter(
  (s) => s !== "done"
) as Exclude<WorkTaskStatus, "done">[];

export const REVIEW_STATUSES = ["pending", "approved"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const OWNERSHIP_DECISIONS = ["confirmed_mine", "rejected_not_mine"] as const;
export type OwnershipDecision = (typeof OWNERSHIP_DECISIONS)[number];

export const CONFLICT_RESOLUTION_DECISIONS = [
  "keep_open",
  "mark_done_locally",
  "decide_later",
] as const;
export type ConflictResolutionDecision = (typeof CONFLICT_RESOLUTION_DECISIONS)[number];

export interface WorkTask {
  id: number;
  projectId: number | null;
  title: string;
  status: WorkTaskStatus;
  /** True once the user explicitly set the status — the planner must not overwrite it. */
  statusManuallySet: boolean;
  /** "pending" tasks await user approval in the Inbox and stay out of the Today queue. */
  reviewStatus: ReviewStatus;
  priorityScore: number | null;
  /** 0..1 */
  confidence: number | null;
  /** WL-05: the deterministic component breakdown that produced `confidence`. Null for tasks created before WL-05. */
  confidenceComponents: ConfidenceComponents | null;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  /** Detailed, source-grounded meeting context, newest source first. */
  meetingContext: TaskMeetingContextEntry[];
  /**
   * Critical overrides: task information a newer meeting contradicted, newest
   * first, each carrying the transcript quote that caused the change.
   */
  overrides: TaskOverrideRecord[];
  dueDate: string | null;
  owner: string | null;
  waitingOn: string | null;
  figmaFrameUrl: string | null;
  localRepoPath: string | null;
  githubRepo: string | null;
  workContext: TaskWorkContextSnapshot | null;
  /** Stable identity e.g. jira:{site}:{KEY}. */
  canonicalKey: string | null;
  /** User-confirmed ownership decision — null until the user chooses. */
  ownershipDecision: OwnershipDecision | null;
  createdAt: string;
  updatedAt: string;
}

export type NewWorkTask = Pick<
  WorkTask,
  "title" | "status" | "reason" | "nextAction" | "doneCriteria"
> &
  Partial<
    Pick<
      WorkTask,
      | "projectId"
      | "priorityScore"
      | "confidence"
      | "confidenceComponents"
      | "dueDate"
      | "owner"
      | "waitingOn"
      | "meetingContext"
      | "overrides"
      | "figmaFrameUrl"
      | "localRepoPath"
      | "githubRepo"
      | "workContext"
      | "canonicalKey"
      | "reviewStatus"
      | "statusManuallySet"
      | "ownershipDecision"
    >
  >;

export type WorkTaskPatch = Partial<Omit<WorkTask, "id" | "createdAt" | "updatedAt">>;

/**
 * A task must never be treated as actionable without a next action and at
 * least one done criterion — this is the single invariant every task
 * creation path (manual or LLM-extracted) must satisfy.
 */
export function hasRequiredPillars(task: Pick<NewWorkTask, "nextAction" | "doneCriteria">): boolean {
  return task.nextAction.trim().length > 0 && task.doneCriteria.length > 0;
}
