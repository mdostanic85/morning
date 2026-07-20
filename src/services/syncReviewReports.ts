import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { syncReviewReports as syncReviewReportsTable } from "@/db/tables";
import { fetchOne, fetchReturning } from "@/db/query";
import type { NewSyncReviewReport, SyncReviewReport } from "@/domain/syncReviewReport";

function toSyncReviewReport(row: typeof syncReviewReportsTable.$inferSelect): SyncReviewReport {
  return {
    id: row.id,
    taskId: row.taskId,
    summary: row.summary,
    ok: row.ok ?? [],
    notOk: row.notOk ?? [],
    conflicts: row.conflicts ?? [],
    githubBranch: row.githubBranch,
    figmaUrl: row.figmaUrl,
    recommendedNextAction: row.recommendedNextAction,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export async function createSyncReviewReport(input: NewSyncReviewReport): Promise<SyncReviewReport> {
  const [row] = await fetchReturning(
    db
      .insert(syncReviewReportsTable)
      .values({
        taskId: input.taskId,
        summary: input.summary,
        ok: input.ok ?? [],
        notOk: input.notOk ?? [],
        conflicts: input.conflicts ?? [],
        githubBranch: input.githubBranch ?? null,
        figmaUrl: input.figmaUrl ?? null,
        recommendedNextAction: input.recommendedNextAction,
        confidence: input.confidence ?? null,
      })
      .returning()
  );
  return toSyncReviewReport(row);
}

export async function getLatestSyncReviewReport(taskId: number): Promise<SyncReviewReport | null> {
  const row = await fetchOne(
    db.select().from(syncReviewReportsTable).where(eq(syncReviewReportsTable.taskId, taskId)).orderBy(desc(syncReviewReportsTable.createdAt))
  );
  return row ? toSyncReviewReport(row) : null;
}
