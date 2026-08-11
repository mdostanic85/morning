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
  buildCriterionEvidenceLinks,
} from "@/lib/tasks/criterionEvidence";
import { replaceCriterionEvidenceLinks } from "@/lib/tasks/criterionEvidenceStore";
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
import { enrichFigmaCommentSourceForMerge } from "@/lib/tasks/enrichFigmaCommentSource";
import {
  myOwnerFilter,
  personMatchesFilter,
  classifyTaskOwnership,
  parseJiraAssigneeFromText,
  NON_PERSON_ACTORS,
  type TaskOwnershipClass,
} from "@/lib/filters/ownerFilter";
import {
  parseJiraLabelsFromText,
  parseJiraMentionsFromText,
} from "@/lib/connectors/jiraText";
import {
  detectTaskFieldOverrides,
  mergeTaskOverrides,
} from "@/lib/tasks/taskOverride";
import { quoteAppearsInSource } from "@/lib/tasks/evidenceVerification";
import { normalizePersonName } from "@/lib/tasks/personIdentity";
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
    figmaFrameUrl: task.figmaFrameUrl,
  }));
}

/** WL-10: best-effort identity resolution — must never block extraction on failure. */
async function resolvePersonIdForOwner(
  ownerName: string | null
): Promise<{ personId: number | null; verified: boolean }> {
  const trimmed = ownerName?.trim() ?? "";
  if (!trimmed) return { personId: null, verified: false };

  // Skip person creation for strings that are not plausible person names.
  const firstName = trimmed.toLowerCase().split(/\s+/)[0] ?? "";
  if (firstName.length < 3 || NON_PERSON_ACTORS.has(firstName)) {
    return { personId: null, verified: false };
  }

  try {
    const { personId, created } = await resolveOrCreatePerson(trimmed);
    return { personId, verified: !created };
  } catch {
    return { personId: null, verified: false };
  }
}

/**
 * Ownership signals the model is allowed to claim. Each must be backed by a
 * quote that really appears in the source — the model may interpret the
 * source, but it may not invent the sentence it is interpreting.
 */
const SOURCE_OWNERSHIP_SIGNALS: ReadonlySet<string> = new Set([
  "jira_assignee",
  "addressed_to_user",
  "user_commitment",
  "stakeholder_instruction",
]);

/**
 * The model read the source and concluded the work is the user's. Accept that
 * only when it cites a verbatim source line and names the user in the slot the
 * signal depends on (who was addressed, or who made the commitment).
 */
function llmOwnershipClaimProvesMine(
  claim: ExtractedTask["ownershipEvidence"],
  sourceBody: string,
  currentUserName: string
): boolean {
  if (!claim || !SOURCE_OWNERSHIP_SIGNALS.has(claim.signal)) return false;
  if (!quoteAppearsInSource(claim.quote, sourceBody)) return false;

  const selected = myOwnerFilter(currentUserName);
  if (!selected) return false;

  const claimant =
    claim.signal === "user_commitment" ? claim.addressedBy : claim.addressedTo;
  if (!claimant?.trim()) return false;
  return personMatchesFilter(claimant, selected, currentUserName);
}

/**
 * Decide ownership for one extracted group from source-backed signals only,
 * and resolve the owner to persist.
 *
 * Runs before the merge branches so merged and newly created tasks pass the
 * same gate. When the source proves the work is the user's but named no owner,
 * the user is stamped as owner so the decision is durable rather than
 * re-derived from LLM prose on every read.
 */
function resolveOwnershipFromSource(input: {
  extracted: ExtractedTask;
  sourceItem: SourceItem;
  quotes: string[];
  currentUserName: string | null;
}): {
  ownership: TaskOwnershipClass;
  owner: string | null;
  verifiedQuotes: string[];
} {
  const { extracted, sourceItem, quotes, currentUserName } = input;
  // Only quotes that actually occur in the source may carry ownership weight.
  const verifiedQuotes = quotes.filter((quote) =>
    quoteAppearsInSource(quote, sourceItem.body)
  );

  if (currentUserName === null) {
    return { ownership: "unclear", owner: extracted.owner, verifiedQuotes };
  }

  const isJiraSource = sourceItem.sourceType === "jira";
  const jiraAssignee = isJiraSource ? parseJiraAssigneeFromText(sourceItem.body) : null;
  // An issue assigned to someone else can still be pointed at the user by an
  // @mention or a label naming them — that keeps ownership open instead of
  // discarding the task as another person's work.
  const jiraMentions = isJiraSource ? parseJiraMentionsFromText(sourceItem.body) : [];
  const jiraLabels = isJiraSource ? parseJiraLabelsFromText(sourceItem.body) : [];

  const ownership = classifyTaskOwnership(
    {
      owner: extracted.owner,
      title: extracted.title,
      reason: extracted.reason,
      nextAction: extracted.nextAction,
      jiraAssignee,
      jiraMentions,
      jiraLabels,
      evidenceQuotes: verifiedQuotes,
    },
    currentUserName
  );

  if (ownership === "other") {
    return { ownership, owner: extracted.owner, verifiedQuotes };
  }

  const provenMine =
    ownership === "mine" ||
    llmOwnershipClaimProvesMine(
      extracted.ownershipEvidence,
      sourceItem.body,
      currentUserName
    );

  if (!provenMine) {
    return { ownership: "unclear", owner: extracted.owner, verifiedQuotes };
  }
  // Keep the source's own wording when it named the owner.
  return {
    ownership: "mine",
    owner: extracted.owner ?? currentUserName,
    verifiedQuotes,
  };
}

/**
 * A merge must never silently replace the owner with a different person.
 * An incoming owner may fill an empty slot or restate the same person; a
 * different name leaves the existing owner untouched.
 */
function resolveMergedOwner(
  existingOwner: string | null,
  incomingOwner: string | null,
  currentUserName: string | null
): string | null {
  const incoming = incomingOwner?.trim() ?? "";
  if (!incoming) return existingOwner;

  const existing = existingOwner?.trim() ?? "";
  if (!existing) {
    if (currentUserName === null) return incoming;
    const selected = myOwnerFilter(currentUserName);
    return selected && personMatchesFilter(incoming, selected, currentUserName)
      ? incoming
      : null;
  }

  const samePerson = personMatchesFilter(
    incoming,
    new Set([normalizePersonName(existing)]),
    null
  );
  return samePerson ? existing : existingOwner;
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
 * task, keep only the quotes that are actually about that task.
 * A multi-topic meeting ("Milos & Lucas sync") resolves to the ticket it
 * mentions, but its lines about *other* tasks must not ride along as evidence
 * for this one. Uses the same per-quote predicate as display/prune so all three
 * layers agree. If filtering leaves no evidence, the merge is skipped below:
 * an update must never land without a quote that actually supports it.
 */
function filterEvidenceForTarget(
  evidenceInput: EvidenceInputRow[],
  target: { title: string; reason: string; nextAction: string },
  source: { sourceType: string; sourceExternalId: string | null; sourceDate: string }
): EvidenceInputRow[] {
  const taskKey = jiraKeyForTask({ title: target.title });
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
  return relevant;
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
  const { project = null, currentUserName = null } = options;
  const sourceItem = await enrichFigmaCommentSourceForMerge(options.sourceItem);
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

    // Ownership is decided once, before the merge branches below return early —
    // otherwise a merged task never passes the gate and can even overwrite the
    // owner with someone else's name.
    const ownershipProof = resolveOwnershipFromSource({
      extracted: primary,
      sourceItem,
      quotes: evidenceQuotes.map((item) => item.quote),
      currentUserName: currentUserName ?? null,
    });
    if (ownershipProof.ownership === "other") continue;
    const resolvedOwner = ownershipProof.owner;

    if (group.targetId != null) {
      const existing = existingTasks.find((task) => task.id === group.targetId) ?? null;
      if (!existing) continue;

      // EV-03: strip lines that belong to a different task before they persist.
      // Figma comments have already passed deterministic Jira/thread/node or
      // ownership+topic resolution. Their extracted quote is often only the
      // short reply ("make them lighter"), while the domain context lives in
      // the inherited parent message. Re-running the generic per-quote filter
      // loses that thread context and incorrectly drops valid feedback.
      const targetEvidenceInput =
        sourceItem.metadata?.importedFrom === "figma_comment"
          ? evidenceInput
          : filterEvidenceForTarget(evidenceInput, existing, {
              sourceType: sourceItem.sourceType,
              sourceExternalId: sourceItem.sourceExternalId,
              sourceDate: sourceItem.sourceDate,
            });
      // A multi-topic meeting may mention this task while the particular
      // extracted quote belongs to another topic. Do not update the task or
      // attach meeting context without at least one relevant individual quote.
      if (targetEvidenceInput.length === 0) continue;

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

      const mergedOwner = resolveMergedOwner(
        existing.owner,
        resolvedOwner,
        currentUserName ?? null
      );
      const mergedPersonResolution = await resolvePersonIdForOwner(mergedOwner);
      const mergedConfidence = incomingIsLatest
        ? computeTaskConfidence({
            ownerName: mergedOwner,
            extractionConfidence: primary.confidence,
            title: primary.title,
            reason,
            nextAction: primary.nextAction,
            evidenceQuotes: ownershipProof.verifiedQuotes,
            currentUserName,
            primarySource: sourceItem,
            hasProject: (existing.projectId ?? sourceItem.projectId) != null,
            evidenceSources: [sourceItem, ...existingSources],
            resolvedPersonId: mergedPersonResolution.personId,
            resolvedPersonVerified: mergedPersonResolution.verified,
          })
        : null;

      // Figma comments may add new scope requests on top of existing
      // outcomes; union rather than replace so nothing is lost.
      const mergedDoneCriteria =
        sourceItem.metadata?.importedFrom === "figma_comment"
          ? uniqueCriteria([existing.doneCriteria, doneCriteria.length > 0 ? doneCriteria : primary.doneCriteria])
          : doneCriteria.length > 0
            ? doneCriteria
            : primary.doneCriteria;
      const mergedDueDate = primary.dueDate ?? existing.dueDate;

      // A winning meeting rewrites what the task says. Record what it replaced
      // and the line that replaced it, so the change is visible instead of the
      // user silently continuing from instructions that no longer hold.
      const detectedOverrides = incomingIsLatest
        ? detectTaskFieldOverrides({
            existing: {
              reason: existing.reason,
              nextAction: existing.nextAction,
              doneCriteria: existing.doneCriteria,
              dueDate: existing.dueDate,
            },
            incoming: {
              reason,
              nextAction: primary.nextAction,
              doneCriteria: mergedDoneCriteria,
              dueDate: mergedDueDate,
            },
            source: {
              id: sourceItem.id,
              title: sourceItem.title,
              sourceType: sourceItem.sourceType,
              sourceDate: sourceItem.sourceDate,
              isTranscript: isTranscriptSource(sourceItem),
            },
            quotes: targetEvidenceInput.map((item) => item.quote),
            detectedAt: new Date().toISOString(),
          })
        : [];

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
            doneCriteria: mergedDoneCriteria,
            meetingContext: upsertMeetingContext(
              existing.meetingContext,
              meetingContextEntry
            ),
            ...(detectedOverrides.length > 0
              ? { overrides: mergeTaskOverrides(existing.overrides, detectedOverrides) }
              : {}),
            confidence: mergedConfidence?.finalConfidence ?? primary.confidence,
            confidenceComponents: mergedConfidence?.components ?? null,
            dueDate: mergedDueDate,
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
      // For Figma comments, rebuild criterion-evidence links so the new
      // criteria added by the comment are traceable back to the source quote.
      if (incomingIsLatest && sourceItem.metadata?.importedFrom === "figma_comment") {
        const criterionLinks = buildCriterionEvidenceLinks(
          (updated ?? existing).doneCriteria,
          primary.doneCriteriaEvidence ?? [],
          replacedEvidence,
          new Map([[sourceItem.id, sourceItem.body]])
        );
        if (criterionLinks.length > 0) {
          await replaceCriterionEvidenceLinks(existing.id, criterionLinks);
        }
      }
      savedTasks.push(updated ?? existing);
      savedEvidence.push(...replacedEvidence);
      continue;
    }

    // WL-05: decomposed, deterministic confidence — the LLM only supplies
    // `extractionConfidence`; everything else is derived from real signals.
    const personResolution = await resolvePersonIdForOwner(resolvedOwner);
    const newTaskConfidence = computeTaskConfidence({
      ownerName: resolvedOwner,
      extractionConfidence: primary.confidence,
      title: primary.title,
      reason,
      nextAction: primary.nextAction,
      evidenceQuotes: ownershipProof.verifiedQuotes,
      currentUserName,
      primarySource: sourceItem,
      hasProject: sourceItem.projectId != null,
      evidenceSources: [sourceItem],
      resolvedPersonId: personResolution.personId,
      resolvedPersonVerified: personResolution.verified,
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
        owner: resolvedOwner,
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
    const criterionLinks = buildCriterionEvidenceLinks(
      task.doneCriteria,
      primary.doneCriteriaEvidence ?? [],
      created.evidence,
      new Map([[sourceItem.id, sourceItem.body]])
    );
    if (criterionLinks.length > 0) {
      await replaceCriterionEvidenceLinks(task.id, criterionLinks);
    }

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
