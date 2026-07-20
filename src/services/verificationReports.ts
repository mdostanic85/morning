import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  verificationReports as verificationReportsTable,
  workTasks as workTasksTable,
} from "@/db/tables";
import { fetchAll, fetchReturning, execute } from "@/db/query";
import type { NewVerificationReport, VerificationReport } from "@/domain/verificationReport";

function toVerificationReport(
  row: typeof verificationReportsTable.$inferSelect
): VerificationReport {
  return {
    id: row.id,
    taskId: row.taskId,
    verdict: row.verdict,
    matches: row.matches ?? [],
    missing: row.missing ?? [],
    risks: row.risks ?? [],
    recommendedNextAction: row.recommendedNextAction,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export async function createVerificationReport(
  input: NewVerificationReport
): Promise<VerificationReport> {
  const [row] = await fetchReturning(
    db
      .insert(verificationReportsTable)
      .values({
        taskId: input.taskId,
        verdict: input.verdict,
        matches: input.matches ?? [],
        missing: input.missing ?? [],
        risks: input.risks ?? [],
        recommendedNextAction: input.recommendedNextAction,
        confidence: input.confidence ?? null,
      })
      .returning()
  );
  return toVerificationReport(row);
}

export async function getVerificationReportsForTask(
  taskId: number
): Promise<VerificationReport[]> {
  const rows = await fetchAll(
    db.select().from(verificationReportsTable).where(eq(verificationReportsTable.taskId, taskId)).orderBy(desc(verificationReportsTable.createdAt))
  );
  return rows.map(toVerificationReport);
}

export async function getLatestVerificationReport(
  taskId: number
): Promise<VerificationReport | null> {
  const reports = await getVerificationReportsForTask(taskId);
  return reports[0] ?? null;
}

export async function getVerificationReports(): Promise<VerificationReport[]> {
  const rows = await fetchAll(db.select().from(verificationReportsTable).orderBy(desc(verificationReportsTable.createdAt)));
  return rows.map(toVerificationReport);
}

export async function getVerificationReportsForProject(
  projectId: number
): Promise<VerificationReport[]> {
  const taskRows = await fetchAll(db.select({ id: workTasksTable.id }).from(workTasksTable).where(eq(workTasksTable.projectId, projectId)));
  const taskIds = new Set(taskRows.map((task) => task.id));
  if (taskIds.size === 0) return [];

  const rows = (await fetchAll(db.select().from(verificationReportsTable).orderBy(desc(verificationReportsTable.createdAt)))).filter((report) => taskIds.has(report.taskId));

  return rows.map(toVerificationReport);
}

export async function deleteVerificationReport(id: number): Promise<void> {
  await execute(db.delete(verificationReportsTable).where(eq(verificationReportsTable.id, id)));
}
