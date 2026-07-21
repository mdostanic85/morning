import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { workTasks as workTasksTable, evidence as evidenceTable } from "@/db/tables";
import { execute, fetchAll } from "@/db/query";
import { getSourceItems } from "@/services/sourceItems";
import { getWorkTasks } from "@/services/workTasks";
import {
  planDuplicateJiraTaskMerge,
  planJiraDoneReconciliation,
} from "@/lib/imports/jiraDoneReconciliation";
import { planSelfReportedCompletionReconciliation } from "@/lib/imports/selfReportedCompletionReconciliation";
import { resolveCanonicalKeyForTask } from "@/lib/tasks/canonicalKey";

/**
 * Apply Jira Done close + duplicate merge before queue rebuild.
 * Preserves evidence (moves onto canonical) and statusManuallySet tasks.
 */
export async function reconcileJiraWorkItems(): Promise<{
  closedDone: number;
  mergedDuplicates: number;
}> {
  const [tasks, sources] = await Promise.all([getWorkTasks(), getSourceItems()]);

  const reconcileTasks = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    statusManuallySet: task.statusManuallySet,
    canonicalKey:
      task.canonicalKey ?? resolveCanonicalKeyForTask({ title: task.title }),
    evidence: task.evidence.map((item) => ({ sourceItemId: item.sourceItemId })),
  }));

  const doneActions = planJiraDoneReconciliation({
    tasks: reconcileTasks,
    sources: sources.map((source) => ({
      id: source.id,
      sourceType: source.sourceType,
      sourceExternalId: source.sourceExternalId,
      title: source.title,
      metadata: source.metadata,
    })),
  });

  const now = new Date().toISOString();
  for (const action of doneActions) {
    await execute(
      db
        .update(workTasksTable)
        .set({
          status: "done",
          reason: action.reason,
          canonicalKey: action.canonicalKey,
          updatedAt: now,
        })
        .where(eq(workTasksTable.id, action.taskId))
    );
  }

  const openTasks = (await getWorkTasks()).filter((task) => task.status !== "done");
  const mergePlans = planDuplicateJiraTaskMerge({
    tasks: openTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      statusManuallySet: task.statusManuallySet,
      canonicalKey:
        task.canonicalKey ?? resolveCanonicalKeyForTask({ title: task.title }),
      evidence: task.evidence.map((item) => ({ sourceItemId: item.sourceItemId })),
    })),
  });

  let mergedDuplicates = 0;
  for (const plan of mergePlans) {
    const duplicateEvidence = await fetchAll(
      db
        .select()
        .from(evidenceTable)
        .where(inArray(evidenceTable.taskId, plan.duplicateTaskIds))
    );

    const existing = await fetchAll(
      db
        .select()
        .from(evidenceTable)
        .where(eq(evidenceTable.taskId, plan.canonicalTaskId))
    );

    for (const row of duplicateEvidence) {
      const already = existing.some(
        (item) =>
          item.sourceItemId === row.sourceItemId &&
          (item.quote ?? "") === (row.quote ?? "")
      );
      if (already) continue;
      await execute(
        db.insert(evidenceTable).values({
          taskId: plan.canonicalTaskId,
          sourceItemId: row.sourceItemId,
          quote: row.quote,
          summary: row.summary,
          sourceDate: row.sourceDate,
          url: row.url,
        })
      );
    }

    for (const duplicateId of plan.duplicateTaskIds) {
      await execute(
        db
          .update(workTasksTable)
          .set({
            status: "done",
            reason: `Merged into canonical ${plan.jiraKey} task #${plan.canonicalTaskId}.`,
            updatedAt: now,
          })
          .where(eq(workTasksTable.id, duplicateId))
      );
      mergedDuplicates += 1;
    }

    await execute(
      db
        .update(workTasksTable)
        .set({
          canonicalKey: plan.canonicalKey,
          updatedAt: now,
        })
        .where(eq(workTasksTable.id, plan.canonicalTaskId))
    );
  }

  return { closedDone: doneActions.length, mergedDuplicates };
}

/**
 * Close tasks whose own freshest evidence (a meeting note, usually) reports
 * the underlying work is already finished — a self-reported completion
 * claim distinct from a mechanical Jira Done status. Run alongside
 * reconcileJiraWorkItems() before the queue is ranked, so a task like
 * "Review Content File Manager" never surfaces as active work when today's
 * notes already say the design is finalized.
 */
export async function reconcileSelfReportedCompletion(): Promise<{ closed: number }> {
  const tasks = await getWorkTasks();

  const actions = planSelfReportedCompletionReconciliation({
    tasks: tasks
      .filter((task) => task.status !== "done")
      .map((task) => ({
        id: task.id,
        status: task.status,
        statusManuallySet: task.statusManuallySet,
        evidence: task.evidence.map((item) => ({
          sourceItemId: item.sourceItemId,
          quote: item.quote,
          summary: item.summary,
          sourceDate: item.sourceDate,
        })),
      })),
  });

  const now = new Date().toISOString();
  for (const action of actions) {
    await execute(
      db
        .update(workTasksTable)
        .set({
          status: "done",
          reason: action.reason,
          updatedAt: now,
        })
        .where(eq(workTasksTable.id, action.taskId))
    );
  }

  return { closed: actions.length };
}
