import "server-only";
import { db } from "@/db/client";
import { evidence as evidenceTable, knowledgeItems as knowledgeItemsTable } from "@/db/tables";
import { fetchAll } from "@/db/query";
import { extractTasksFromSourceItem } from "@/lib/tasks/extractor";
import { shouldAutoExtractTasksFromSource } from "@/lib/tasks/dailyFocus";
import { extractKnowledgeFromSourceItem } from "@/lib/knowledge/extractor";
import { matchAndAssignSourceItemToProject } from "@/lib/tasks/projectMatcher";
import { indexSourceItem } from "@/lib/knowledge/embeddings";
import { loadGranolaExtractionContext } from "@/lib/granola/extractionContext";
import { granolaSourceBodyMatchesMe } from "@/lib/granola/personalKnowledge";
import { filterActiveProjects, getProjects, isSourceFromInactiveProject } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import type { SourceItem } from "@/domain/sourceItem";
import {
  getSourceProcessingMetadata,
  markSourceProcessed,
  sourceProcessingFingerprint,
  sourceProcessingIsCurrent,
  type ProcessingStatus,
} from "@/lib/imports/sourceProcessing";
import {
  assertSyncRunNotCancelled,
  isSyncRunCancellationRequested,
  SyncCancelledError,
} from "@/lib/imports/syncCancellation";

export interface BackfillExtractionsResult {
  sourcesProcessed: number;
  sourcesRemaining: number;
  tasksExtracted: number;
  knowledgeExtracted: number;
  errors: string[];
}

const BACKFILL_BATCH_SIZE = 8;

async function sourceIdsWithTaskEvidence(): Promise<Set<number>> {
  const rows = await fetchAll<{ sourceItemId: number }>(
    db.selectDistinct({ sourceItemId: evidenceTable.sourceItemId }).from(evidenceTable)
  );
  return new Set(rows.map((row) => row.sourceItemId));
}

async function sourceIdsWithKnowledge(): Promise<Set<number>> {
  const rows = await fetchAll<{ sourceItemId: number | null }>(
    db.selectDistinct({ sourceItemId: knowledgeItemsTable.sourceItemId }).from(knowledgeItemsTable)
  );
  return new Set(rows.map((row) => row.sourceItemId).filter((sourceItemId): sourceItemId is number => sourceItemId != null));
}

/**
 * Re-run extraction for imported sources that never produced tasks.
 * Happens when items were saved before API keys were configured, or when
 * a prior extraction failed — duplicate-import skips them on later syncs.
 */
export async function backfillUnextractedSources(input?: {
  syncRunId?: number;
}): Promise<BackfillExtractionsResult | { cancelled: true }> {
  const result: BackfillExtractionsResult = {
    sourcesProcessed: 0,
    sourcesRemaining: 0,
    tasksExtracted: 0,
    knowledgeExtracted: 0,
    errors: [],
  };

  const [sources, projects, extractedSourceIds, knowledgeSourceIds, granolaWorkContext] = await Promise.all([
    getSourceItems(),
    getProjects(),
    sourceIdsWithTaskEvidence(),
    sourceIdsWithKnowledge(),
    loadGranolaExtractionContext(),
  ]);

  const pending = sources.filter(
    (source) => {
      if (isSourceFromInactiveProject(source, projects)) return false;
      if (sourceProcessingIsCurrent(source)) return false;

      // Existing installations did not record zero-result extraction runs.
      // Any durable task/knowledge output proves that the source was processed;
      // new and failed runs use the explicit processing marker above.
      const hasProcessingMarker = getSourceProcessingMetadata(source) != null;
      const hasLegacyOutput =
        extractedSourceIds.has(source.id) || knowledgeSourceIds.has(source.id);
      return hasProcessingMarker || !hasLegacyOutput;
    }
  );
  if (pending.length === 0) return result;

  const batch = pending.slice(0, BACKFILL_BATCH_SIZE);
  result.sourcesRemaining = Math.max(0, pending.length - batch.length);

  for (const source of batch) {
    try {
      if (input?.syncRunId && (await isSyncRunCancellationRequested(input.syncRunId))) {
        return { cancelled: true };
      }
      const processed = await extractFromSource(source, projects, granolaWorkContext, input?.syncRunId);
      result.sourcesProcessed += 1;
      result.tasksExtracted += processed.tasksExtracted;
      result.knowledgeExtracted += processed.knowledgeExtracted;
      result.errors.push(...processed.errors);
    } catch (err) {
      if (err instanceof SyncCancelledError) return { cancelled: true };
      result.errors.push(
        `${source.title}: ${err instanceof Error ? err.message : "backfill failed"}`
      );
    }
  }

  return result;
}

async function extractFromSource(
  sourceItem: SourceItem,
  projects: Awaited<ReturnType<typeof getProjects>>,
  granolaWorkContext: Awaited<ReturnType<typeof loadGranolaExtractionContext>>,
  syncRunId?: number
): Promise<{
  tasksExtracted: number;
  knowledgeExtracted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let tasksExtracted = 0;
  let knowledgeExtracted = 0;
  const activeProjects = filterActiveProjects(projects);

  const projectMatch = sourceItem.projectId
    ? { sourceItem, match: null }
    : await matchAndAssignSourceItemToProject({ sourceItem, projects: activeProjects });
  const item = projectMatch.sourceItem;
  const project = item.projectId
    ? projects.find((entry) => entry.id === item.projectId) ?? null
    : null;

  try {
    await indexSourceItem(item);
  } catch (err) {
    errors.push(
      `Embeddings skipped for ${item.title}: ${err instanceof Error ? err.message : "failed"}`
    );
  }

  const projectContext = project
    ? {
        name: project.name,
        description: project.description,
        keywords: project.keywords,
        people: project.people,
      }
    : null;

  const previousProcessing = getSourceProcessingMetadata(item);
  const processingMatchesCurrentContent =
    previousProcessing?.fingerprint === sourceProcessingFingerprint(item);
  const sourceIsPersonalGranolaSignal =
    item.sourceType !== "granola" ||
    (granolaWorkContext != null &&
      granolaSourceBodyMatchesMe(item.body, granolaWorkContext));
  const taskExtractionEligible =
    shouldAutoExtractTasksFromSource(item.sourceType) && sourceIsPersonalGranolaSignal;
  const shouldRunTaskExtraction =
    taskExtractionEligible &&
    (!processingMatchesCurrentContent || previousProcessing?.taskStatus === "failed");
  const extraction = shouldRunTaskExtraction
    ? await (async () => {
        if (syncRunId) await assertSyncRunNotCancelled(syncRunId);
        return extractTasksFromSourceItem({
        sourceItem: item,
        project: projectContext,
        currentUserName: null,
      });
      })()
    : null;
  let taskStatus: ProcessingStatus =
    processingMatchesCurrentContent && previousProcessing
      ? previousProcessing.taskStatus
      : taskExtractionEligible
        ? "failed"
        : "skipped";
  if (extraction?.ok) {
    taskStatus = "completed";
    tasksExtracted += extraction.tasks.length;
  } else if (extraction && !extraction.ok) {
    errors.push(`Task extraction failed for ${item.title}: ${extraction.error}`);
  }

  const knowledgeExtractionEligible =
    item.sourceType !== "calendar" && sourceIsPersonalGranolaSignal;
  const shouldRunKnowledgeExtraction =
    knowledgeExtractionEligible &&
    (!processingMatchesCurrentContent || previousProcessing?.knowledgeStatus === "failed");
  const knowledgeExtraction = !shouldRunKnowledgeExtraction
    ? { ok: true as const, items: [] }
    : await (async () => {
        if (syncRunId) await assertSyncRunNotCancelled(syncRunId);
        return extractKnowledgeFromSourceItem({
        sourceItem: item,
        project: projectContext,
        granolaWorkContext: item.sourceType === "granola" ? granolaWorkContext : null,
      });
      })();
  let knowledgeStatus: ProcessingStatus =
    processingMatchesCurrentContent && previousProcessing
      ? previousProcessing.knowledgeStatus
      : knowledgeExtractionEligible
        ? "failed"
        : "skipped";
  if (knowledgeExtraction.ok) {
    if (shouldRunKnowledgeExtraction) knowledgeStatus = "completed";
    knowledgeExtracted += knowledgeExtraction.items.length;
  } else {
    errors.push(`Knowledge extraction failed for ${item.title}: ${knowledgeExtraction.error}`);
  }

  await markSourceProcessed(item, { taskStatus, knowledgeStatus });
  return { tasksExtracted, knowledgeExtracted, errors };
}

/** Count sources that still need a first or retry extraction pass. */
export async function countUnextractedSources(): Promise<number> {
  const [sources, taskSourceIds, knowledgeSourceIds] = await Promise.all([
    getSourceItems(),
    sourceIdsWithTaskEvidence(),
    sourceIdsWithKnowledge(),
  ]);
  return sources.filter((source) => {
    if (sourceProcessingIsCurrent(source)) return false;
    if (getSourceProcessingMetadata(source)) return true;
    return !taskSourceIds.has(source.id) && !knowledgeSourceIds.has(source.id);
  }).length;
}
