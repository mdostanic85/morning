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
import { myOwnerFilter, personMatchesFilter, classifyTaskOwnership } from "@/lib/filters/ownerFilter";
import { isQuoteRelevantToTask, taskDomainText } from "@/lib/tasks/evidenceRelevance";
import { computeTaskConfidence } from "@/lib/tasks/taskConfidence";
import { getApplicableIngestionRules } from "@/services/ingestionRules";
import { resolveOrCreatePerson } from "@/services/people";
import { reflectOnExtractedTasks } from "@/lib/tasks/taskReflect";

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
    owner: task.owner,
  }));
}

/** WL-10: best-effort identity resolution — must never block extraction on failure. */
async function resolvePersonIdForOwner(ownerName: string | null): Promise<number | null> {
  if (!ownerName?.trim()) return null;
  try {
    const { personId } = await resolveOrCreatePerson(ownerName);
    return personId;
  } catch {
    return null;
  }
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

interface EvidenceInputRow {
  quote: string;
  summary: string;
  sourceDate: string;
  url?: string;
}

/**
 * EV-03 write-time guard: when a transcript's extracts merge onto an existing
 * Jira-anchored task, keep only the quotes that are actually about that task.
 * A multi-topic meeting ("Milos & Lucas sync") resolves to the ticket it
 * mentions, but its lines about *other* tasks must not ride along as evidence
 * for this one. Uses the same per-quote predicate as display/prune so all three
 * layers agree. Falls back to the unfiltered set if filtering would leave the
 * source with no evidence at all (so a task update never lands unsupported —
 * the display/prune layers still hide/remove any residual off-topic rows).
 */
function filterEvidenceForTarget(
  evidenceInput: EvidenceInputRow[],
  target: { title: string; reason: string; nextAction: string },
  source: { sourceType: string; sourceExternalId: string | null; sourceDate: string }
): EvidenceInputRow[] {
  const taskKey = jiraKeyForTask({ title: target.title });
  if (!taskKey) return evidenceInput; // only anchored tasks get strict filtering
  const domain = taskDomainText(target);
  const sourceMs = new Date(source.sourceDate).getTime();
  const newestSourceTime = Number.isNaN(sourceMs) ? 0 : sourceMs;
  const relevant = evidenceInput.filter(
    (row) =>
      isQuoteRelevantToTask({
        taskKey,
        domain,
        newestSourceTime,
        source,
        quoteText: row.quote,
      }).relevant
  );
  return relevant.length > 0 ? relevant : evidenceInput;
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
  const ingestionRules = await getApplicableIngestionRules({
    sourceType: sourceItem.sourceType,
    projectId: sourceItem.projectId,
  });

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
      ingestionRules: ingestionRules.map((rule) => rule.rule),
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

  // WL-07 stage 2: a separate, cheap LLM call filters obvious noise out of
  // the extraction stage's candidates before any merge/persist logic runs.
  // Fails open — a reflect-stage error or skip keeps every candidate, so
  // this can only ever narrow the candidate set, never break extraction.
  const reflection = await reflectOnExtractedTasks({
    sourceBody: sourceItem.body,
    candidates: output.tasks,
    existingOpenTaskTitles: existingTasks.map((task) => task.title),
  });
  const survivingTasks = output.tasks.filter((_, index) => reflection.keepFlags[index]);
  if (reflection.ranReflectStage && survivingTasks.length < output.tasks.length) {
    const discarded = output.tasks
      .map((task, index) => ({ task, index }))
      .filter(({ index }) => !reflection.keepFlags[index]);
    console.info(
      `[task_reflect] discarded ${discarded.length}/${output.tasks.length} candidate(s) for source ${sourceItem.id}: ${discarded
        .map(({ task, index }) => `"${task.title}" (${reflection.reasons[index]})`)
        .join("; ")}`
    );
  }

  type ResolvedGroup = {
    targetId: number | null;
    mode: "full" | "evidence";
    items: ExtractedTask[];
  };

  const groups = new Map<string, ResolvedGroup>();

  for (const extracted of survivingTasks) {
    const resolution = resolveTranscriptMergeTarget({
      source: sourceItem,
      extracted,
      existingTasks: mergeCandidates,
      myName: currentUserName,
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

      // EV-03: strip lines that belong to a different task before they persist.
      const targetEvidenceInput = filterEvidenceForTarget(evidenceInput, existing, {
        sourceType: sourceItem.sourceType,
        sourceExternalId: sourceItem.sourceExternalId,
        sourceDate: sourceItem.sourceDate,
      });

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
          targetEvidenceInput
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

      const mergedOwner = primary.owner ?? existing.owner;
      const mergedConfidence = incomingIsLatest
        ? computeTaskConfidence({
            ownerName: mergedOwner,
            extractionConfidence: primary.confidence,
            title: primary.title,
            reason,
            nextAction: primary.nextAction,
            currentUserName,
            primarySource: sourceItem,
            hasProject: (existing.projectId ?? sourceItem.projectId) != null,
            evidenceSources: [sourceItem, ...existingSources],
            resolvedPersonId: await resolvePersonIdForOwner(mergedOwner),
          })
        : null;

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
            confidence: mergedConfidence?.finalConfidence ?? primary.confidence,
            confidenceComponents: mergedConfidence?.components ?? null,
            dueDate: primary.dueDate ?? existing.dueDate,
            owner: mergedOwner,
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
        targetEvidenceInput
      );
      savedTasks.push(updated ?? existing);
      savedEvidence.push(...replacedEvidence);
      continue;
    }

    // Drop tasks the LLM attributed to someone else — either via owner field
    // or via clear third-person attribution in the extracted text.
    if (currentUserName !== null) {
      const ownership = classifyTaskOwnership(
        {
          owner: primary.owner,
          title: primary.title,
          reason: primary.reason,
          nextAction: primary.nextAction,
        },
        currentUserName
      );
      if (ownership === "other") continue;
      if (
        primary.owner !== null &&
        !personMatchesFilter(
          primary.owner,
          myOwnerFilter(currentUserName) ?? new Set(),
          currentUserName
        )
      ) {
        continue;
      }
    }

    // WL-05: decomposed, deterministic confidence — the LLM only supplies
    // `extractionConfidence`; everything else is derived from real signals.
    const newTaskConfidence = computeTaskConfidence({
      ownerName: primary.owner,
      extractionConfidence: primary.confidence,
      title: primary.title,
      reason,
      nextAction: primary.nextAction,
      currentUserName,
      primarySource: sourceItem,
      hasProject: sourceItem.projectId != null,
      evidenceSources: [sourceItem],
      resolvedPersonId: await resolvePersonIdForOwner(primary.owner),
    });

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
        confidence: newTaskConfidence.finalConfidence,
        confidenceComponents: newTaskConfidence.components,
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
