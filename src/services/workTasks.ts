import "server-only";
import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { workTasks as workTasksTable, evidence as evidenceTable } from "@/db/schema";
import type { NewWorkTask, WorkTask, WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { Evidence } from "@/domain/evidence";
import { toEvidence } from "./evidence";

function toWorkTask(row: typeof workTasksTable.$inferSelect): WorkTask {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    priorityScore: row.priorityScore,
    confidence: row.confidence,
    reason: row.reason,
    nextAction: row.nextAction,
    doneCriteria: row.doneCriteria ?? [],
    dueDate: row.dueDate,
    owner: row.owner,
    waitingOn: row.waitingOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface WorkTaskWithEvidence extends WorkTask {
  evidence: Evidence[];
}

function attachEvidence(tasks: WorkTask[]): WorkTaskWithEvidence[] {
  if (tasks.length === 0) return [];
  const allEvidence = db.select().from(evidenceTable).all();
  const byTask = new Map<number, Evidence[]>();
  for (const e of allEvidence) {
    const list = byTask.get(e.taskId) ?? [];
    list.push(toEvidence(e));
    byTask.set(e.taskId, list);
  }
  return tasks.map((task) => ({ ...task, evidence: byTask.get(task.id) ?? [] }));
}

export async function createWorkTask(input: NewWorkTask): Promise<WorkTask> {
  const [row] = db
    .insert(workTasksTable)
    .values({
      projectId: input.projectId ?? null,
      title: input.title,
      status: input.status,
      priorityScore: input.priorityScore ?? null,
      confidence: input.confidence ?? null,
      reason: input.reason,
      nextAction: input.nextAction,
      doneCriteria: input.doneCriteria,
      dueDate: input.dueDate ?? null,
      owner: input.owner ?? null,
      waitingOn: input.waitingOn ?? null,
    })
    .returning()
    .all();
  return toWorkTask(row);
}

/** All non-done tasks, grouped by status, in the fixed queue order. Each status is sorted by priorityScore desc. */
export async function getTodayQueue(): Promise<Record<WorkTaskStatus, WorkTaskWithEvidence[]>> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(ne(workTasksTable.status, "done"))
    .orderBy(desc(workTasksTable.priorityScore))
    .all();

  const withEvidence = attachEvidence(rows.map(toWorkTask));

  const grouped = Object.fromEntries(
    OPEN_QUEUE_STATUSES.map((s) => [s, [] as WorkTaskWithEvidence[]])
  ) as unknown as Record<WorkTaskStatus, WorkTaskWithEvidence[]>;
  grouped.done = [];

  for (const task of withEvidence) {
    grouped[task.status].push(task);
  }

  return grouped;
}

export async function getWorkTaskById(id: number): Promise<WorkTaskWithEvidence | null> {
  const row = db.select().from(workTasksTable).where(eq(workTasksTable.id, id)).get();
  if (!row) return null;
  return attachEvidence([toWorkTask(row)])[0];
}

export async function getOpenTasksForProject(projectId: number): Promise<WorkTaskWithEvidence[]> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(eq(workTasksTable.projectId, projectId))
    .orderBy(desc(workTasksTable.priorityScore))
    .all()
    .filter((r) => r.status !== "done");

  return attachEvidence(rows.map(toWorkTask));
}

export async function updateWorkTask(id: number, patch: WorkTaskPatch): Promise<WorkTask | null> {
  const [row] = db
    .update(workTasksTable)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(workTasksTable.id, id))
    .returning()
    .all();
  return row ? toWorkTask(row) : null;
}

export async function deleteWorkTask(id: number): Promise<void> {
  db.delete(workTasksTable).where(eq(workTasksTable.id, id)).run();
}
