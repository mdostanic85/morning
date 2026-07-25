import "server-only";
import { deleteEvidenceByIds } from "@/services/evidence";
import { getSourceItems } from "@/services/sourceItems";
import {
  getWorkTasksWithRawEvidenceForPrune,
  updateWorkTask,
} from "@/services/workTasks";
import {
  filterMeetingContextForTask,
  planEvidenceRelevancePrune,
  type PruneSourceInfo,
} from "@/lib/tasks/evidenceRelevance";

/**
 * Retroactively removes evidence rows that were wrongly attached to any task
 * (stale or off-topic sources), keeping Jira anchors and genuinely relevant
 * fresh sources. Runs on every queue rebuild so the DB self-heals.
 */
export async function pruneIrrelevantTaskEvidence(
  options: { taskIds?: number[] } = {}
): Promise<{ removed: number; contextsCleaned: number }> {
  const [tasks, sources] = await Promise.all([
    getWorkTasksWithRawEvidenceForPrune(),
    getSourceItems(),
  ]);
  const scopedTaskIds =
    options.taskIds && options.taskIds.length > 0
      ? new Set(options.taskIds)
      : null;
  const scopedTasks = scopedTaskIds
    ? tasks.filter((task) => scopedTaskIds.has(task.id))
    : tasks;

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
    tasks: scopedTasks.map((task) => ({
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

  const contextUpdates = scopedTasks.flatMap((task) => {
    const meetingContext = filterMeetingContextForTask({
      task,
      entries: task.meetingContext,
      sourceById,
    });
    return JSON.stringify(meetingContext) === JSON.stringify(task.meetingContext)
      ? []
      : [{ taskId: task.id, meetingContext }];
  });

  if (plan.length > 0) {
    await deleteEvidenceByIds(plan.map((row) => row.evidenceId));
  }
  await Promise.all(
    contextUpdates.map(({ taskId, meetingContext }) =>
      updateWorkTask(taskId, { meetingContext })
    )
  );

  const byTask = new Map<number, number>();
  for (const row of plan) byTask.set(row.taskId, (byTask.get(row.taskId) ?? 0) + 1);
  if (plan.length > 0 || contextUpdates.length > 0) {
    console.info(
      `[evidence_prune] removed ${plan.length} irrelevant evidence row(s) across ${byTask.size} task(s)` +
        (byTask.size > 0
          ? `: ${[...byTask.entries()]
              .map(([taskId, count]) => `#${taskId}:${count}`)
              .join(", ")}`
          : "") +
        `; cleaned ${contextUpdates.length} meeting context(s)`
    );
  }

  return { removed: plan.length, contextsCleaned: contextUpdates.length };
}
