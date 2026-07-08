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

export interface WorkTask {
  id: number;
  projectId: number | null;
  title: string;
  status: WorkTaskStatus;
  priorityScore: number | null;
  /** 0..1 */
  confidence: number | null;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  dueDate: string | null;
  owner: string | null;
  waitingOn: string | null;
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
      "projectId" | "priorityScore" | "confidence" | "dueDate" | "owner" | "waitingOn"
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
