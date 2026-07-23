import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { evidence as evidenceTable } from "@/db/tables";
import { isPostgresDatabase } from "@/db/dialect";
import { fetchAll, fetchReturning, execute, withTransaction, syncRun, syncAll } from "@/db/query";
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

export async function deleteEvidence(id: number): Promise<void> {
  await execute(db.delete(evidenceTable).where(eq(evidenceTable.id, id)));
}

export async function deleteEvidenceByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  await execute(db.delete(evidenceTable).where(inArray(evidenceTable.id, ids)));
  return ids.length;
}

export async function replaceEvidenceForTaskSource(
  taskId: number,
  sourceItemId: number,
  items: Omit<NewEvidence, "taskId" | "sourceItemId">[]
): Promise<Evidence[]> {
  if (isPostgresDatabase()) {
    return db.transaction(async (tx) => {
      await tx
        .delete(evidenceTable)
        .where(and(eq(evidenceTable.taskId, taskId), eq(evidenceTable.sourceItemId, sourceItemId)));

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
    syncRun(
      tx.delete(evidenceTable)
      .where(and(eq(evidenceTable.taskId, taskId), eq(evidenceTable.sourceItemId, sourceItemId)))
    );

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
