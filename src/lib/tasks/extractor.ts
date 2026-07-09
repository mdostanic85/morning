import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  taskExtractionOutputSchema,
  buildTaskExtractorSystemPrompt,
  buildTaskExtractorUserPrompt,
  type TaskExtractorProjectContext,
} from "@/lib/llm/prompts/taskExtractor";
import { createWorkTaskWithEvidence } from "@/services/workTasks";
import { getActiveProjects } from "@/services/projects";
import { matchAndAssignTaskToProject } from "@/lib/tasks/projectMatcher";
import type { SourceItem } from "@/domain/sourceItem";
import type { WorkTask, WorkTaskStatus } from "@/domain/workTask";
import type { Evidence } from "@/domain/evidence";
import type { KnowledgeItem } from "@/domain/knowledgeItem";

export interface ExtractTasksOptions {
  sourceItem: SourceItem;
  /** Used only to help the model judge ownership/terminology — never a source of tasks by itself. */
  project?: TaskExtractorProjectContext | null;
  /** Who "the user" is, for the ownership rules (an owner named as someone else lowers confidence / routes to waiting-unclear). */
  currentUserName?: string | null;
}

export interface TaskExtractionRunResult {
  ok: boolean;
  sourceItemId: number;
  tasks: WorkTask[];
  evidence: Evidence[];
  decisions: KnowledgeItem[];
  openQuestions: KnowledgeItem[];
  risks: KnowledgeItem[];
  deadlines: KnowledgeItem[];
  acceptanceCriteria: KnowledgeItem[];
  /** Present only when ok is false — nothing was saved. */
  error?: string;
}

// A freshly extracted "actionable" task hasn't been triaged for urgency yet —
// it lands in "later" so the priority_planning job (not this one) decides
// whether it's actually a "now"/"next"/"tomorrow" priority.
const EXTRACTED_STATUS_TO_QUEUE_STATUS: Record<"actionable" | "waiting" | "unclear", WorkTaskStatus> = {
  actionable: "later",
  waiting: "waiting",
  unclear: "unclear",
};

function emptyResult(sourceItemId: number, error?: string): TaskExtractionRunResult {
  return {
    ok: !error,
    sourceItemId,
    tasks: [],
    evidence: [],
    decisions: [],
    openQuestions: [],
    risks: [],
    deadlines: [],
    acceptanceCriteria: [],
    error,
  };
}

/**
 * Extracts candidate tasks from one source item, then persists WorkTask +
 * Evidence rows for tasks. Durable knowledge is handled by
 * `lib/knowledge/extractor.ts`, so this task path does not save KnowledgeItem
 * rows.
 */
export async function extractTasksFromSourceItem(
  options: ExtractTasksOptions
): Promise<TaskExtractionRunResult> {
  const { sourceItem, project = null, currentUserName = null } = options;

  const result = await runLlmJob({
    jobType: "task_extraction",
    systemPrompt: buildTaskExtractorSystemPrompt({ currentUserName }),
    userPrompt: buildTaskExtractorUserPrompt({
      sourceTitle: sourceItem.title,
      sourceType: sourceItem.sourceType,
      sourceDate: sourceItem.sourceDate,
      sourceAuthor: sourceItem.author,
      sourceBody: sourceItem.body,
      project,
    }),
    schema: taskExtractionOutputSchema,
  });

  if (!result.ok) {
    return emptyResult(sourceItem.id, `${result.kind}: ${result.error}`);
  }

  const output = result.data;

  const savedTasks: WorkTask[] = [];
  const savedEvidence: Evidence[] = [];
  const taskMatchProjects = sourceItem.projectId === null ? await getActiveProjects() : null;

  for (const extracted of output.tasks) {
    // WorkTask has no dedicated "why is this unclear" column, so fold it
    // into `reason` — waitingOn is reserved for the "waiting" status's
    // blocked-on-whom/what meaning and shouldn't be overloaded with it.
    const reason =
      extracted.status === "unclear" && extracted.unclearReason
        ? `${extracted.reason} (Unclear: ${extracted.unclearReason})`
        : extracted.reason;

    // Extracted tasks go straight into the Today queue — no manual approval step.
    const created = await createWorkTaskWithEvidence(
      {
        projectId: sourceItem.projectId,
        title: extracted.title,
        status: EXTRACTED_STATUS_TO_QUEUE_STATUS[extracted.status],
        reviewStatus: "approved",
        reason,
        nextAction: extracted.nextAction,
        doneCriteria: extracted.doneCriteria,
        confidence: extracted.confidence,
        dueDate: extracted.dueDate,
        owner: extracted.owner,
        waitingOn: extracted.waitingOn,
      },
      extracted.evidence.map((item) => ({
        sourceItemId: sourceItem.id,
        quote: item.quote,
        summary: extracted.reason,
        sourceDate: sourceItem.sourceDate,
        url: sourceItem.url ?? undefined,
      }))
    );

    let task = created.task;
    if (task.projectId === null && taskMatchProjects && taskMatchProjects.length > 0) {
      const projectMatch = await matchAndAssignTaskToProject({
        task,
        sourceItem,
        projects: taskMatchProjects,
      });
      task = projectMatch.task;
    }

    savedTasks.push(task);
    savedEvidence.push(...created.evidence);
  }

  return {
    ok: true,
    sourceItemId: sourceItem.id,
    tasks: savedTasks,
    evidence: savedEvidence,
    decisions: [],
    openQuestions: [],
    risks: [],
    deadlines: [],
    acceptanceCriteria: [],
  };
}
