import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  taskExtractionOutputSchema,
  buildTaskExtractorSystemPrompt,
  buildTaskExtractorUserPrompt,
  type TaskExtractionOutput,
  type TaskExtractorProjectContext,
  type Insight,
} from "@/lib/llm/prompts/taskExtractor";
import { createWorkTask } from "@/services/workTasks";
import { createEvidence } from "@/services/evidence";
import { createKnowledgeItem } from "@/services/knowledgeItems";
import type { SourceItem } from "@/domain/sourceItem";
import type { WorkTask, WorkTaskStatus } from "@/domain/workTask";
import type { Evidence } from "@/domain/evidence";
import type { KnowledgeItem, KnowledgeItemType } from "@/domain/knowledgeItem";

export interface ExtractTasksOptions {
  sourceItem: SourceItem;
  /** Used only to help the model judge ownership/terminology — never a source of tasks by itself. */
  project?: TaskExtractorProjectContext | null;
  /** Who "the user" is, for the ownership rules (an owner named as someone else lowers confidence / routes to waiting-unclear). */
  currentUserName?: string | null;
  /**
   * Skips the LLM call entirely and returns a deterministic, schema-valid
   * result — lets the save pipeline (DB writes, return shape) be exercised
   * without an API key or network access. Falls back to the
   * TASK_EXTRACTOR_MOCK env var when not passed explicitly.
   */
  mock?: boolean;
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
 * A deterministic, schema-valid stand-in for a real model response. Its one
 * task always lands in "unclear" with low confidence — it exists to test the
 * save pipeline, not to substitute for real extraction quality.
 */
function buildMockExtraction(sourceItem: SourceItem): TaskExtractionOutput {
  const quote = sourceItem.body.trim().slice(0, 160) || sourceItem.title;
  return {
    tasks: [
      {
        title: `Review: ${sourceItem.title}`,
        reason: "Mock extraction — no real analysis was performed on this source.",
        nextAction: "Read the source and decide whether a real task is needed.",
        doneCriteria: ["Source has been read and reviewed."],
        status: "unclear",
        waitingOn: null,
        unclearReason: "This is a mock extraction result generated for testing, not real analysis.",
        owner: null,
        dueDate: null,
        confidence: 0.2,
        evidence: [{ quote }],
      },
    ],
    decisions: [],
    openQuestions: [],
    risks: [],
    deadlines: [],
    acceptanceCriteria: [],
  };
}

async function saveInsightBucket(
  items: Insight[],
  type: KnowledgeItemType,
  sourceItem: SourceItem
): Promise<KnowledgeItem[]> {
  const saved: KnowledgeItem[] = [];
  for (const item of items) {
    saved.push(
      await createKnowledgeItem({
        projectId: sourceItem.projectId,
        type,
        title: item.title,
        content: item.content,
        sourceItemId: sourceItem.id,
        confidence: item.confidence,
      })
    );
  }
  return saved;
}

/**
 * Extracts candidate tasks and supporting knowledge signals (decisions, open
 * questions, risks, deadlines, acceptance criteria) from one source item,
 * then persists everything the model returned: WorkTask + Evidence rows for
 * tasks, KnowledgeItem rows for the rest. Never invents anything not backed
 * by the source — the schema enforces at least one verbatim quote per item,
 * and the router discards/retries responses that don't validate.
 */
export async function extractTasksFromSourceItem(
  options: ExtractTasksOptions
): Promise<TaskExtractionRunResult> {
  const { sourceItem, project = null, currentUserName = null } = options;
  const mock = options.mock ?? process.env.TASK_EXTRACTOR_MOCK === "true";

  let output: TaskExtractionOutput;

  if (mock) {
    try {
      output = taskExtractionOutputSchema.parse(buildMockExtraction(sourceItem));
    } catch (err) {
      return emptyResult(
        sourceItem.id,
        `mock_validation_failed: ${err instanceof Error ? err.message : "Unknown error building mock extraction."}`
      );
    }
  } else {
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
    output = result.data;
  }

  const savedTasks: WorkTask[] = [];
  const savedEvidence: Evidence[] = [];

  for (const extracted of output.tasks) {
    // WorkTask has no dedicated "why is this unclear" column, so fold it
    // into `reason` — waitingOn is reserved for the "waiting" status's
    // blocked-on-whom/what meaning and shouldn't be overloaded with it.
    const reason =
      extracted.status === "unclear" && extracted.unclearReason
        ? `${extracted.reason} (Unclear: ${extracted.unclearReason})`
        : extracted.reason;

    const task = await createWorkTask({
      projectId: sourceItem.projectId,
      title: extracted.title,
      status: EXTRACTED_STATUS_TO_QUEUE_STATUS[extracted.status],
      reason,
      nextAction: extracted.nextAction,
      doneCriteria: extracted.doneCriteria,
      confidence: extracted.confidence,
      dueDate: extracted.dueDate,
      owner: extracted.owner,
      waitingOn: extracted.waitingOn,
    });
    savedTasks.push(task);

    for (const item of extracted.evidence) {
      savedEvidence.push(
        await createEvidence({
          taskId: task.id,
          sourceItemId: sourceItem.id,
          quote: item.quote,
          summary: extracted.reason,
          sourceDate: sourceItem.sourceDate,
          url: sourceItem.url ?? undefined,
        })
      );
    }
  }

  const [decisions, openQuestions, risks, deadlines, acceptanceCriteria] = await Promise.all([
    saveInsightBucket(output.decisions, "decision", sourceItem),
    saveInsightBucket(output.openQuestions, "open_question", sourceItem),
    saveInsightBucket(output.risks, "risk", sourceItem),
    saveInsightBucket(
      output.deadlines.map((d) => ({
        title: d.title,
        content: d.date ? `${d.content} (due ${d.date})` : d.content,
        confidence: d.confidence,
        evidence: d.evidence,
      })),
      "deadline",
      sourceItem
    ),
    saveInsightBucket(output.acceptanceCriteria, "acceptance_criteria", sourceItem),
  ]);

  return {
    ok: true,
    sourceItemId: sourceItem.id,
    tasks: savedTasks,
    evidence: savedEvidence,
    decisions,
    openQuestions,
    risks,
    deadlines,
    acceptanceCriteria,
  };
}
