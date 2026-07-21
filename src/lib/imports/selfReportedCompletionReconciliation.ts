import { detectSelfReportedCompletion, type CompletionEvidenceItem } from "@/lib/tasks/completionEvidence";

export type SelfReportedCompletionTask = {
  id: number;
  status: string;
  statusManuallySet: boolean;
  evidence: CompletionEvidenceItem[];
};

export type SelfReportedCompletionAction = {
  taskId: number;
  sourceItemId: number;
  reason: string;
};

/**
 * Close a task when its own freshest evidence explicitly reports the
 * underlying work is finished (e.g. "the design has been finalized" in
 * today's meeting notes) — even without a Jira ticket to mark Done. Like
 * Jira Done, this is authoritative for status: it isn't a dispute with a
 * manual pin, it's the same work item reporting it moved on.
 */
export function planSelfReportedCompletionReconciliation(input: {
  tasks: SelfReportedCompletionTask[];
}): SelfReportedCompletionAction[] {
  const actions: SelfReportedCompletionAction[] = [];
  for (const task of input.tasks) {
    if (task.status === "done") continue;
    const signal = detectSelfReportedCompletion(task.evidence);
    if (!signal) continue;
    actions.push({
      taskId: task.id,
      sourceItemId: signal.sourceItemId,
      reason: `Today's notes report this is already done ("${signal.matchedText}") — closing and moving forward.`,
    });
  }
  return actions;
}
