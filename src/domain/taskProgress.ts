import type { TaskProgressItemType } from "@/lib/tasks/taskPlanVersion";

export interface TaskProgressState {
  taskId: number;
  planVersion: string;
  itemId: string;
  itemType: TaskProgressItemType;
  completed: boolean;
  completedAt: string | null;
}

export interface TaskProgressPatch {
  planVersion: string;
  itemId: string;
  itemType: TaskProgressItemType;
  completed: boolean;
}
