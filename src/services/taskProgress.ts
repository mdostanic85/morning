import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskProgressState as taskProgressStateTable } from "@/db/tables";
import { execute, fetchAll } from "@/db/query";
import type { TaskProgressPatch, TaskProgressState } from "@/domain/taskProgress";

function toTaskProgressState(row: typeof taskProgressStateTable.$inferSelect): TaskProgressState {
  return {
    taskId: row.taskId,
    planVersion: row.planVersion,
    itemId: row.itemId,
    itemType: row.itemType,
    completed: row.completed,
    completedAt: row.completedAt,
  };
}

export async function listTaskProgressForTask(taskId: number): Promise<TaskProgressState[]> {
  const rows = await fetchAll(
    db.select().from(taskProgressStateTable).where(eq(taskProgressStateTable.taskId, taskId))
  );
  return rows.map(toTaskProgressState);
}

export async function listTaskProgressForPlan(
  taskId: number,
  planVersion: string
): Promise<TaskProgressState[]> {
  const rows = await fetchAll(
    db
      .select()
      .from(taskProgressStateTable)
      .where(
        and(
          eq(taskProgressStateTable.taskId, taskId),
          eq(taskProgressStateTable.planVersion, planVersion)
        )
      )
  );
  return rows.map(toTaskProgressState);
}

export async function upsertTaskProgress(
  taskId: number,
  patch: TaskProgressPatch
): Promise<TaskProgressState> {
  const completedAt = patch.completed ? new Date().toISOString() : null;
  const existing = await fetchAll(
    db
      .select()
      .from(taskProgressStateTable)
      .where(
        and(
          eq(taskProgressStateTable.taskId, taskId),
          eq(taskProgressStateTable.planVersion, patch.planVersion),
          eq(taskProgressStateTable.itemId, patch.itemId),
          eq(taskProgressStateTable.itemType, patch.itemType)
        )
      )
      .limit(1)
  );

  if (existing[0]) {
    await execute(
      db
        .update(taskProgressStateTable)
        .set({
          completed: patch.completed,
          completedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(taskProgressStateTable.id, existing[0].id))
    );
    return {
      taskId,
      planVersion: patch.planVersion,
      itemId: patch.itemId,
      itemType: patch.itemType,
      completed: patch.completed,
      completedAt,
    };
  }

  const inserted = await fetchAll(
    db
      .insert(taskProgressStateTable)
      .values({
        taskId,
        planVersion: patch.planVersion,
        itemId: patch.itemId,
        itemType: patch.itemType,
        completed: patch.completed,
        completedAt,
      })
      .returning()
  );

  return toTaskProgressState(inserted[0]);
}
