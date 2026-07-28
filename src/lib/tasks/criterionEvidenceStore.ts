import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskCriterionEvidence as taskCriterionEvidenceTable } from "@/db/tables";
import { fetchAll } from "@/db/query";
import type { StoredCriterionEvidenceLink } from "@/lib/tasks/criterionEvidence";

export async function replaceCriterionEvidenceLinks(
  taskId: number,
  links: StoredCriterionEvidenceLink[]
): Promise<void> {
  const createdAt = new Date().toISOString();

  // Delete + insert must share a transaction: a failing insert would otherwise
  // leave the task with no criterion evidence at all.
  await db.transaction(async (tx) => {
    await tx.delete(taskCriterionEvidenceTable).where(eq(taskCriterionEvidenceTable.taskId, taskId));
    if (links.length === 0) return;

    await tx.insert(taskCriterionEvidenceTable).values(
      links.map((link) => ({
        taskId,
        criterionItemId: link.criterionItemId,
        evidenceId: link.evidenceId,
        createdAt,
      }))
    );
  });
}

export async function listCriterionEvidenceLinks(
  taskId: number
): Promise<{ criterionItemId: string; evidenceId: number }[]> {
  const rows = await fetchAll(
    db
      .select({
        criterionItemId: taskCriterionEvidenceTable.criterionItemId,
        evidenceId: taskCriterionEvidenceTable.evidenceId,
      })
      .from(taskCriterionEvidenceTable)
      .where(eq(taskCriterionEvidenceTable.taskId, taskId))
  );
  return rows;
}
