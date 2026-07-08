import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidence as evidenceTable } from "@/db/schema";
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
  const [row] = db
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
    .all();
  return toEvidence(row);
}

export async function getEvidenceForTask(taskId: number): Promise<Evidence[]> {
  const rows = db.select().from(evidenceTable).where(eq(evidenceTable.taskId, taskId)).all();
  return rows.map(toEvidence);
}

export async function deleteEvidence(id: number): Promise<void> {
  db.delete(evidenceTable).where(eq(evidenceTable.id, id)).run();
}
