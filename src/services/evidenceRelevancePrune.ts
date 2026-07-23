import "server-only";
import { deleteEvidenceByIds } from "@/services/evidence";
import { getSourceItems } from "@/services/sourceItems";
import { getWorkTasks } from "@/services/workTasks";
import {
  planEvidenceRelevancePrune,
  type PruneSourceInfo,
} from "@/lib/tasks/evidenceRelevance";

/**
 * Retroactively removes evidence rows that were wrongly attached to
 * Jira-anchored tasks (stale or off-topic sources), keeping the anchor and
 * genuinely relevant fresh sources. Runs on every queue rebuild so the DB
 * self-heals — a one-off manual cleanup is not enough because later syncs,
 * adoption, and duplicate merges keep re-attaching contamination.
 */
export async function pruneIrrelevantTaskEvidence(): Promise<{ removed: number }> {
  const [tasks, sources] = await Promise.all([getWorkTasks(), getSourceItems()]);

  const sourceById = new Map<number, PruneSourceInfo>(
    sources.map((source) => [
      source.id,
      {
        sourceType: source.sourceType,
        sourceExternalId: source.sourceExternalId,
        sourceDate: source.sourceDate,
      },
    ])
  );

  const plan = planEvidenceRelevancePrune({
    tasks: tasks
      .filter((task) => task.status !== "done")
      .map((task) => ({
        id: task.id,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
        evidence: task.evidence.map((item) => ({
          id: item.id,
          sourceItemId: item.sourceItemId,
          quote: item.quote,
          summary: item.summary,
          sourceDate: item.sourceDate,
        })),
      })),
    sourceById,
  });

  if (plan.length === 0) return { removed: 0 };

  await deleteEvidenceByIds(plan.map((row) => row.evidenceId));
  const byTask = new Map<number, number>();
  for (const row of plan) byTask.set(row.taskId, (byTask.get(row.taskId) ?? 0) + 1);
  console.info(
    `[evidence_prune] removed ${plan.length} irrelevant evidence row(s) across ${byTask.size} task(s): ` +
      [...byTask.entries()].map(([taskId, count]) => `#${taskId}:${count}`).join(", ")
  );

  return { removed: plan.length };
}
