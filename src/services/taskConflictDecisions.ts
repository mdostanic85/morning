import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskConflictDecisions as taskConflictDecisionsTable } from "@/db/tables";
import type { ConflictResolutionDecision } from "@/domain/workTask";
import { fetchAll, fetchOne, fetchReturning } from "@/db/query";
import { conflictKeyForSummary } from "@/lib/tasks/criterionEvidence";

export interface TaskConflictDecision {
  id: number;
  taskId: number;
  conflictKey: string;
  summary: string;
  decision: ConflictResolutionDecision;
  evidenceSourceItemIds: number[];
  createdAt: string;
  updatedAt: string;
}

function toDecision(row: typeof taskConflictDecisionsTable.$inferSelect): TaskConflictDecision {
  return {
    id: row.id,
    taskId: row.taskId,
    conflictKey: row.conflictKey,
    summary: row.summary,
    decision: row.decision as ConflictResolutionDecision,
    evidenceSourceItemIds: row.evidenceSourceItemIds ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getTaskConflictDecision(
  taskId: number,
  summary: string
): Promise<TaskConflictDecision | null> {
  const conflictKey = conflictKeyForSummary(summary);
  const row = await fetchOne(
    db
      .select()
      .from(taskConflictDecisionsTable)
      .where(
        and(
          eq(taskConflictDecisionsTable.taskId, taskId),
          eq(taskConflictDecisionsTable.conflictKey, conflictKey)
        )
      )
  );
  return row ? toDecision(row) : null;
}

export async function listTaskConflictDecisions(taskId: number): Promise<TaskConflictDecision[]> {
  const rows = await fetchAll(
    db.select().from(taskConflictDecisionsTable).where(eq(taskConflictDecisionsTable.taskId, taskId))
  );
  return rows.map(toDecision);
}

export async function upsertTaskConflictDecision(input: {
  taskId: number;
  summary: string;
  decision: ConflictResolutionDecision;
  evidenceSourceItemIds: number[];
}): Promise<TaskConflictDecision> {
  const now = new Date().toISOString();
  const conflictKey = conflictKeyForSummary(input.summary);
  const existing = await getTaskConflictDecision(input.taskId, input.summary);

  if (existing) {
    const [row] = await fetchReturning(
      db
        .update(taskConflictDecisionsTable)
        .set({
          decision: input.decision,
          evidenceSourceItemIds: input.evidenceSourceItemIds,
          updatedAt: now,
        })
        .where(eq(taskConflictDecisionsTable.id, existing.id))
        .returning()
    );
    return toDecision(row!);
  }

  const [row] = await fetchReturning(
    db
      .insert(taskConflictDecisionsTable)
      .values({
        taskId: input.taskId,
        conflictKey,
        summary: input.summary,
        decision: input.decision,
        evidenceSourceItemIds: input.evidenceSourceItemIds,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
  );
  return toDecision(row!);
}
