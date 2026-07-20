import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  taskExtractionOutputSchema,
  buildTaskExtractorSystemPrompt,
  buildTaskExtractorUserPrompt,
  type ExtractedTask,
  type TaskExtractorProjectContext,
} from "@/lib/llm/prompts/taskExtractor";
import {
  createWorkTaskWithEvidence,
  getWorkTasks,
  updateWorkTask,
} from "@/services/workTasks";
import { replaceEvidenceForTaskSource } from "@/services/evidence";
import { getActiveProjects } from "@/services/projects";
import { matchAndAssignTaskToProject } from "@/lib/tasks/projectMatcher";
import type { SourceItem } from "@/domain/sourceItem";
import type {
  TaskMeetingContextEntry,
  WorkTask,
  WorkTaskStatus,
} from "@/domain/workTask";
import type { Evidence } from "@/domain/evidence";
import {
  isIncomingSourceAuthoritative,
  isTranscriptSource,
} from "@/lib/tasks/sourceAuthority";
import { getSourceItemsByIds } from "@/services/sourceItems";
import {
  jiraKeyForTask,
  mergeTaskTitle,
  pickPrimaryExtractedTask,
  resolveTranscriptMergeTarget,
  type MergeCandidateTask,
} from "@/lib/tasks/transcriptTaskMerge";

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
    error,
  };
}

function toMergeCandidates(tasks: WorkTask[]): MergeCandidateTask[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    reason: task.reason,
    nextAction: task.nextAction,
    status: task.status,
    projectId: task.projectId,
  }));
}

function uniqueQuotes(items: { quote: string }[]): { quote: string }[] {
  const seen = new Set<string>();
  const out: { quote: string }[] = [];
  for (const item of items) {
    const quote = item.quote.trim();
    if (!quote) continue;
    const key = quote.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ quote });
  }
  return out;
}

function uniqueCriteria(groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      const value = item.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

function buildMeetingContextEntry(
  sourceItem: SourceItem,
  items: ExtractedTask[]
): TaskMeetingContextEntry | null {
  if (!isTranscriptSource(sourceItem)) return null;
  const contexts = items
    .map((item) => item.meetingContext)
    .filter((context): context is NonNullable<typeof context> => context != null);
  if (contexts.length === 0) return null;

  return {
    sourceItemId: sourceItem.id,
    sourceTitle: sourceItem.title,
    sourceType: sourceItem.sourceType,
    sourceDate: sourceItem.sourceDate,
    overview: contexts.map((context) => context.overview.trim()).filter(Boolean).join(" "),
    keyPoints: uniqueCriteria(contexts.map((context) => context.keyPoints)),
    decisions: uniqueCriteria(contexts.map((context) => context.decisions)),
    requestedChanges: uniqueCriteria(
      contexts.map((context) => context.requestedChanges)
    ),
    openQuestions: uniqueCriteria(contexts.map((context) => context.openQuestions)),
    evidenceQuotes: uniqueCriteria(contexts.map((context) => context.evidenceQuotes)),
    confidence: Math.min(...contexts.map((context) => context.confidence)),
  };
}

function upsertMeetingContext(
  existing: TaskMeetingContextEntry[],
  incoming: TaskMeetingContextEntry | null
): TaskMeetingContextEntry[] {
  if (!incoming) return existing;
  return [
    incoming,
    ...existing.filter((entry) => entry.sourceItemId !== incoming.sourceItemId),
  ]
    .sort(
      (a, b) =>
        new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime()
    )
    .slice(0, 10);
}

/**
 * Extracts candidate tasks from one source item, then persists WorkTask +
 * Evidence rows for tasks. Durable knowledge is handled by
 * `lib/knowledge/extractor.ts`, so this task path does not save KnowledgeItem
 * rows.
 *
 * For Granola/Gemini transcripts, a deterministic merge pass attaches updates
 * to the matching open Jira/active task instead of spawning parallel fragments.
 */
export async function extractTasksFromSourceItem(
  options: ExtractTasksOptions
): Promise<TaskExtractionRunResult> {
  const { sourceItem, project = null, currentUserName = null } = options;
  const existingTasks = (await getWorkTasks())
    .filter((task) => task.status !== "done")
    .filter(
      (task) =>
        sourceItem.projectId == null ||
        task.projectId == null ||
        task.projectId === sourceItem.projectId
    )
    .slice(0, 30);

  const mergeCandidates = toMergeCandidates(existingTasks);

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
      existingTasks: existingTasks.map((task) => ({
        id: task.id,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
        doneCriteria: task.doneCriteria,
        status: task.status,
        jiraKey: jiraKeyForTask(task),
      })),
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

  type ResolvedGroup = {
    targetId: number | null;
    mode: "full" | "evidence";
    items: ExtractedTask[];
  };

  const groups = new Map<string, ResolvedGroup>();

  for (const extracted of output.tasks) {
    const resolution = resolveTranscriptMergeTarget({
      source: sourceItem,
      extracted,
      existingTasks: mergeCandidates,
    });
    // Collapse only when multiple extracts resolve to the same open task.
    // Genuinely new items stay separate even if titles look similar.
    const key =
      resolution.taskId != null
        ? `merge:${resolution.taskId}:${resolution.mode}`
        : `new:${groups.size}`;
    const existingGroup = groups.get(key);
    if (existingGroup) {
      existingGroup.items.push(extracted);
    } else {
      groups.set(key, {
        targetId: resolution.taskId,
        mode: resolution.mode,
        items: [extracted],
      });
    }
  }

  for (const group of groups.values()) {
    const primary = pickPrimaryExtractedTask(group.items);
    const reason =
      primary.status === "unclear" && primary.unclearReason
        ? `${primary.reason} (Unclear: ${primary.unclearReason})`
        : primary.reason;
    const evidenceQuotes = uniqueQuotes(group.items.flatMap((item) => item.evidence));
    const doneCriteria = uniqueCriteria(group.items.map((item) => item.doneCriteria));
    const meetingContextEntry = buildMeetingContextEntry(sourceItem, group.items);
    const evidenceInput = evidenceQuotes.map((item) => ({
      quote: item.quote,
      summary: primary.reason,
      sourceDate: sourceItem.sourceDate,
      url: sourceItem.url ?? undefined,
    }));

    if (group.targetId != null) {
      const existing = existingTasks.find((task) => task.id === group.targetId) ?? null;
      if (!existing) continue;

      if (group.mode === "evidence") {
        const contextUpdated = meetingContextEntry
          ? await updateWorkTask(existing.id, {
              meetingContext: upsertMeetingContext(
                existing.meetingContext,
                meetingContextEntry
              ),
            })
          : existing;
        const replacedEvidence = await replaceEvidenceForTaskSource(
          existing.id,
          sourceItem.id,
          evidenceInput
        );
        savedTasks.push(contextUpdated ?? existing);
        savedEvidence.push(...replacedEvidence);
        continue;
      }

      const existingSourceIds = Array.from(
        new Set(existing.evidence.map((item) => item.sourceItemId))
      );
      const existingSources =
        existingSourceIds.length > 0 ? await getSourceItemsByIds(existingSourceIds) : [];
      const incomingIsLatest = isIncomingSourceAuthoritative({
        incoming: sourceItem,
        existingEvidenceDates: existing.evidence.map((item) => item.sourceDate),
        existingSources,
      });

      const updated = incomingIsLatest
        ? await updateWorkTask(existing.id, {
            projectId: existing.projectId ?? sourceItem.projectId,
            title: mergeTaskTitle(existing.title, primary.title),
            // Merging transcript updates onto an open task must not demote a
            // now/next item into "later" — only waiting/unclear may change status.
            status: existing.statusManuallySet
              ? existing.status
              : primary.status === "waiting" || primary.status === "unclear"
                ? EXTRACTED_STATUS_TO_QUEUE_STATUS[primary.status]
                : existing.status,
            reason,
            nextAction: primary.nextAction,
            doneCriteria: doneCriteria.length > 0 ? doneCriteria : primary.doneCriteria,
            meetingContext: upsertMeetingContext(
              existing.meetingContext,
              meetingContextEntry
            ),
            confidence: primary.confidence,
            dueDate: primary.dueDate ?? existing.dueDate,
            owner: primary.owner ?? existing.owner,
            waitingOn: primary.status === "waiting" ? primary.waitingOn : null,
          })
        : meetingContextEntry
          ? await updateWorkTask(existing.id, {
              meetingContext: upsertMeetingContext(
                existing.meetingContext,
                meetingContextEntry
              ),
            })
          : existing;
      const replacedEvidence = await replaceEvidenceForTaskSource(
        existing.id,
        sourceItem.id,
        evidenceInput
      );
      savedTasks.push(updated ?? existing);
      savedEvidence.push(...replacedEvidence);
      continue;
    }

    // Drop tasks the LLM explicitly attributed to someone else. If the source
    // names a specific owner and we know who the user is, and the owner clearly
    // isn't the user, there is nothing for the user to do — skip creation.
    if (
      primary.owner !== null &&
      currentUserName !== null &&
      !primary.owner.toLowerCase().includes(currentUserName.toLowerCase()) &&
      !currentUserName.toLowerCase().includes(primary.owner.toLowerCase())
    ) {
      continue;
    }

    // Extracted tasks go straight into the Today queue — no manual approval step.
    const created = await createWorkTaskWithEvidence(
      {
        projectId: sourceItem.projectId,
        title: primary.title,
        status: EXTRACTED_STATUS_TO_QUEUE_STATUS[primary.status],
        reviewStatus: "approved",
        reason,
        nextAction: primary.nextAction,
        doneCriteria: doneCriteria.length > 0 ? doneCriteria : primary.doneCriteria,
        meetingContext: meetingContextEntry ? [meetingContextEntry] : [],
        confidence: primary.confidence,
        dueDate: primary.dueDate,
        owner: primary.owner,
        waitingOn: primary.waitingOn,
      },
      evidenceInput.map((item) => ({
        sourceItemId: sourceItem.id,
        quote: item.quote,
        summary: item.summary,
        sourceDate: item.sourceDate,
        url: item.url,
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
  };
}
