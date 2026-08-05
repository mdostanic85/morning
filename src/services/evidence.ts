import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  evidence as evidenceTable,
  taskCriterionEvidence as taskCriterionEvidenceTable,
} from "@/db/tables";
import { isPostgresDatabase } from "@/db/dialect";
import { fetchAll, fetchReturning, withTransaction, syncRun, syncAll } from "@/db/query";
import type { Evidence, NewEvidence } from "@/domain/evidence";

export function toEvidence(row: typeof evidenceTable.$inferSelect): Evidence {
  return {
    id: row.id,
    taskId: row.taskId,
    sourceItemId: row.sourceItemId,
    quote: row.quote,
    summary: row.summary,
    sourceDate: row.sourceDate,
    url: row.url,
  };
}

export async function createEvidence(input: NewEvidence): Promise<Evidence> {
  const [row] = await fetchReturning(
    db
      .insert(evidenceTable)
      .values({
        taskId: input.taskId,
        sourceItemId: input.sourceItemId,
        quote: input.quote ?? null,
        summary: input.summary,
        sourceDate: input.sourceDate,
        url: input.url ?? null,
      })
      .returning()
  );
  return toEvidence(row);
}

export async function getEvidenceForTask(taskId: number): Promise<Evidence[]> {
  const rows = await fetchAll(db.select().from(evidenceTable).where(eq(evidenceTable.taskId, taskId)));
  return rows.map(toEvidence);
}

/** First task that already cites this source item as evidence, if any. */
export async function getTaskIdForSourceItem(sourceItemId: number): Promise<number | null> {
  const rows = await fetchAll(
    db
      .select({ taskId: evidenceTable.taskId })
      .from(evidenceTable)
      .where(eq(evidenceTable.sourceItemId, sourceItemId))
      .limit(1)
  );
  return rows[0]?.taskId ?? null;
}

export async function deleteEvidence(id: number): Promise<void> {
  await deleteEvidenceByIds([id]);
}

/**
 * `task_criterion_evidence.evidence_id` references `evidence.id` with no
 * ON DELETE CASCADE, so its links must be removed first — otherwise Postgres
 * rejects the delete (23503) and takes the whole queue rebuild down with it.
 * A link pointing at removed evidence is dangling by definition.
 */
export async function deleteEvidenceByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db.transaction(async (tx) => {
    await tx
      .delete(taskCriterionEvidenceTable)
      .where(inArray(taskCriterionEvidenceTable.evidenceId, ids));
    await tx.delete(evidenceTable).where(inArray(evidenceTable.id, ids));
  });
  return ids.length;
}

export async function replaceEvidenceForTaskSource(
  taskId: number,
  sourceItemId: number,
  items: Omit<NewEvidence, "taskId" | "sourceItemId">[]
): Promise<Evidence[]> {
  const scope = and(
    eq(evidenceTable.taskId, taskId),
    eq(evidenceTable.sourceItemId, sourceItemId)
  );

  if (isPostgresDatabase()) {
    return db.transaction(async (tx) => {
      const replaced = await tx.select({ id: evidenceTable.id }).from(evidenceTable).where(scope);
      if (replaced.length > 0) {
        await tx.delete(taskCriterionEvidenceTable).where(
          inArray(
            taskCriterionEvidenceTable.evidenceId,
            replaced.map((row) => row.id)
          )
        );
      }
      await tx.delete(evidenceTable).where(scope);

      const rows = await Promise.all(
        items.map((item) =>
          tx
            .insert(evidenceTable)
            .values({
              taskId,
              sourceItemId,
              quote: item.quote ?? null,
              summary: item.summary,
              sourceDate: item.sourceDate,
              url: item.url ?? null,
            })
            .returning()
        )
      );
      return rows.map(([row]) => toEvidence(row));
    });
  }

  return withTransaction((tx) => {
    const replaced = syncAll(tx.select({ id: evidenceTable.id }).from(evidenceTable).where(scope));
    if (replaced.length > 0) {
      syncRun(
        tx.delete(taskCriterionEvidenceTable).where(
          inArray(
            taskCriterionEvidenceTable.evidenceId,
            replaced.map((row) => row.id)
          )
        )
      );
    }
    syncRun(tx.delete(evidenceTable).where(scope));

    return items.map((item) => {
      const [row] = syncAll(
        tx
        .insert(evidenceTable)
        .values({
          taskId,
          sourceItemId,
          quote: item.quote ?? null,
          summary: item.summary,
          sourceDate: item.sourceDate,
          url: item.url ?? null,
        })
        .returning()
      );
      return toEvidence(row);
    });
  });
}
