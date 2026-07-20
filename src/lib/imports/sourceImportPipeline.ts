import "server-only";
import {
  createSourceItem,
  getSourceItemByExternalId,
  updateSourceItem,
} from "@/services/sourceItems";
import { getActiveProjects } from "@/services/projects";
import { extractTasksFromSourceItem } from "@/lib/tasks/extractor";
import { shouldExtractTasksFromSourceItem } from "@/lib/tasks/dailyFocus";
import { matchAndAssignSourceItemToProject } from "@/lib/tasks/projectMatcher";
import { extractKnowledgeFromSourceItem } from "@/lib/knowledge/extractor";
import { indexSourceItem } from "@/lib/knowledge/embeddings";
import { loadGranolaExtractionContext } from "@/lib/granola/extractionContext";
import { granolaSourceBodyMatchesMe } from "@/lib/granola/personalKnowledge";
import { getUserProfile } from "@/services/userProfile";
import { deleteKnowledgeItemsForSource } from "@/services/knowledgeItems";
import type { ConnectorSourceCandidate, ConnectorSyncResult } from "@/lib/connectors/types";
import {
  markSourceProcessed,
  type ProcessingStatus,
} from "@/lib/imports/sourceProcessing";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

const VOLATILE_CONNECTOR_METADATA_KEYS = new Set(["query"]);

function connectorMetadataMatches(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | undefined
): boolean {
  return Object.entries(incoming ?? {})
    .filter(([key]) => !VOLATILE_CONNECTOR_METADATA_KEYS.has(key))
    .every(
      ([key, value]) => JSON.stringify(existing?.[key]) === JSON.stringify(value)
    );
}

export async function importConnectorSources(
  candidates: ConnectorSourceCandidate[],
  options: { shouldCancel?: ShouldCancelSync } = {}
): Promise<ConnectorSyncResult> {
  const result: ConnectorSyncResult = {
    ok: true,
    imported: 0,
    skipped: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsFailed: 0,
    tasksExtracted: 0,
    errors: [],
    importedItems: [],
    extractedTasks: [],
    knowledgeExtracted: [],
  };

  const projects = await getActiveProjects();
  const [granolaWorkContext, profile] = await Promise.all([
    loadGranolaExtractionContext(),
    getUserProfile(),
  ]);

  for (const candidate of candidates) {
    try {
      if (options.shouldCancel && (await options.shouldCancel())) {
        break;
      }

      const existing = await getSourceItemByExternalId({
        sourceType: candidate.sourceType,
        sourceExternalId: candidate.sourceExternalId,
      });
      const unchanged =
        existing &&
        existing.title === candidate.title &&
        existing.body === candidate.body &&
        existing.author === (candidate.author ?? null) &&
        existing.sourceDate === candidate.sourceDate &&
        existing.url === (candidate.url ?? null) &&
        connectorMetadataMatches(existing.metadata, candidate.metadata);
      if (unchanged) {
        result.skipped += 1;
        result.itemsUnchanged += 1;
        continue;
      }

      const created = existing
        ? await updateSourceItem(existing.id, {
            projectId: candidate.projectId ?? existing.projectId,
            title: candidate.title,
            body: candidate.body,
            author: candidate.author ?? null,
            sourceDate: candidate.sourceDate,
            url: candidate.url ?? null,
            metadata: {
              ...(existing.metadata ?? {}),
              ...(candidate.metadata ?? {}),
            },
          })
        : await createSourceItem({
            projectId: candidate.projectId ?? null,
            sourceType: candidate.sourceType,
            sourceExternalId: candidate.sourceExternalId,
            title: candidate.title,
            body: candidate.body,
            author: candidate.author ?? null,
            sourceDate: candidate.sourceDate,
            url: candidate.url ?? null,
            metadata: candidate.metadata ?? null,
          });
      if (!created) throw new Error(`Could not persist source ${candidate.title}.`);

      const projectMatch = created.projectId
        ? { sourceItem: created, match: null }
        : await matchAndAssignSourceItemToProject({ sourceItem: created, projects });
      const sourceItem = projectMatch.sourceItem;
      const project = sourceItem.projectId
        ? projects.find((candidateProject) => candidateProject.id === sourceItem.projectId)
        : null;

      result.importedItems.push({
        sourceItemId: sourceItem.id,
        title: candidate.title,
        url: candidate.url ?? null,
        sourceType: candidate.sourceType,
        metadata: candidate.metadata ?? {},
        projectId: sourceItem.projectId,
        projectName: project?.name ?? null,
      });

      try {
        await indexSourceItem(sourceItem);
      } catch (err) {
        result.errors.push(
          `Source ${sourceItem.id} indexed without embeddings: ${
            err instanceof Error ? err.message : "embedding failed"
          }`
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

      const sourceIsPersonalGranolaSignal =
        sourceItem.sourceType !== "granola" ||
        (granolaWorkContext != null &&
          granolaSourceBodyMatchesMe(sourceItem.body, granolaWorkContext));
      let taskStatus: ProcessingStatus = "skipped";
      if (
        shouldExtractTasksFromSourceItem({
          sourceType: sourceItem.sourceType,
          metadata: sourceItem.metadata,
        }) &&
        sourceIsPersonalGranolaSignal
      ) {
        if (options.shouldCancel && (await options.shouldCancel())) {
          break;
        }
        const extraction = await extractTasksFromSourceItem({
          sourceItem,
          project: projectContext,
          currentUserName: profile?.name?.trim() ?? null,
        });
        if (extraction.ok) {
          taskStatus = "completed";
          result.tasksExtracted += extraction.tasks.length;
          for (const task of extraction.tasks) {
            const taskProject = task.projectId
              ? projects.find((entry) => entry.id === task.projectId)
              : project;
            result.extractedTasks.push({
              id: task.id,
              title: task.title,
              nextAction: task.nextAction,
              projectId: task.projectId,
              projectName: taskProject?.name ?? project?.name ?? null,
              sourceItemId: sourceItem.id,
              status: task.status,
            });
          }
        } else {
          taskStatus = "failed";
          result.errors.push(`Task extraction failed for ${sourceItem.title}: ${extraction.error}`);
        }
      }

      if (existing) {
        await deleteKnowledgeItemsForSource(sourceItem.id);
      }
      const shouldExtractKnowledge =
        sourceItem.sourceType !== "calendar" && sourceIsPersonalGranolaSignal;
      const knowledgeExtraction = !shouldExtractKnowledge
        ? { ok: true as const, items: [] }
        : await (async () => {
            if (options.shouldCancel && (await options.shouldCancel())) {
              return { ok: true as const, items: [] };
            }
            return extractKnowledgeFromSourceItem({
        sourceItem,
        project: projectContext,
        granolaWorkContext:
          sourceItem.sourceType === "granola" ? granolaWorkContext : null,
      });
          })();
      let knowledgeStatus: ProcessingStatus = !shouldExtractKnowledge
        ? "skipped"
        : "failed";
      if (knowledgeExtraction.ok) {
        if (shouldExtractKnowledge) knowledgeStatus = "completed";
      } else if (shouldExtractKnowledge) {
        result.errors.push(
          `Knowledge extraction failed for ${sourceItem.title}: ${knowledgeExtraction.error}`
        );
      }
      if (options.shouldCancel && (await options.shouldCancel())) {
        await markSourceProcessed(sourceItem, { taskStatus, knowledgeStatus });
        result.imported += 1;
        if (existing) {
          result.itemsUpdated += 1;
        } else {
          result.itemsCreated += 1;
        }
        break;
      }
      if (knowledgeExtraction.ok) {
        result.knowledgeExtracted.push(
          ...knowledgeExtraction.items.map((entry) => ({
            id: entry.item.id,
            type: entry.item.type,
            title: entry.item.title,
            content: entry.item.content,
            confidence: entry.item.confidence,
            evidenceQuotes: entry.evidenceQuotes,
            isUnclear: entry.isUnclear,
            sourceItemId: sourceItem.id,
            projectId: sourceItem.projectId,
            projectName: project?.name ?? null,
          }))
        );
      }

      await markSourceProcessed(sourceItem, { taskStatus, knowledgeStatus });
      result.imported += 1;
      if (existing) {
        result.itemsUpdated += 1;
      } else {
        result.itemsCreated += 1;
      }
    } catch (err) {
      result.ok = false;
      result.itemsFailed += 1;
      result.errors.push(
        `${candidate.title}: ${err instanceof Error ? err.message : "unknown import error"}`
      );
    }
  }

  return result;
}
