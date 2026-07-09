import "server-only";
import { createSourceItem, getSourceItemByExternalId } from "@/services/sourceItems";
import { getActiveProjects } from "@/services/projects";
import { extractTasksFromSourceItem } from "@/lib/tasks/extractor";
import { shouldAutoExtractTasksFromSource } from "@/lib/tasks/dailyFocus";
import { matchAndAssignSourceItemToProject } from "@/lib/tasks/projectMatcher";
import { extractKnowledgeFromSourceItem } from "@/lib/knowledge/extractor";
import { indexSourceItem } from "@/lib/knowledge/embeddings";
import type { ConnectorSourceCandidate, ConnectorSyncResult } from "@/lib/connectors/types";

export async function importConnectorSources(
  candidates: ConnectorSourceCandidate[]
): Promise<ConnectorSyncResult> {
  const result: ConnectorSyncResult = {
    ok: true,
    imported: 0,
    skipped: 0,
    tasksExtracted: 0,
    errors: [],
    importedItems: [],
    knowledgeExtracted: [],
  };

  const projects = await getActiveProjects();

  for (const candidate of candidates) {
    try {
      const existing = await getSourceItemByExternalId({
        sourceType: candidate.sourceType,
        sourceExternalId: candidate.sourceExternalId,
      });
      if (existing) {
        result.skipped += 1;
        continue;
      }

      const created = await createSourceItem({
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

      result.importedItems.push({
        title: candidate.title,
        url: candidate.url ?? null,
        sourceType: candidate.sourceType,
        metadata: candidate.metadata ?? {},
      });

      const projectMatch = created.projectId
        ? { sourceItem: created, match: null }
        : await matchAndAssignSourceItemToProject({ sourceItem: created, projects });
      const sourceItem = projectMatch.sourceItem;
      const project = sourceItem.projectId
        ? projects.find((candidateProject) => candidateProject.id === sourceItem.projectId)
        : null;

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

      if (shouldAutoExtractTasksFromSource(sourceItem.sourceType)) {
        const extraction = await extractTasksFromSourceItem({
          sourceItem,
          project: projectContext,
          currentUserName: null,
        });
        if (extraction.ok) {
          result.tasksExtracted += extraction.tasks.length;
        } else {
          result.errors.push(`Task extraction failed for ${sourceItem.title}: ${extraction.error}`);
        }
      }

      const knowledgeExtraction = await extractKnowledgeFromSourceItem({
        sourceItem,
        project: projectContext,
      });
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
          }))
        );
      } else {
        result.errors.push(
          `Knowledge extraction failed for ${sourceItem.title}: ${knowledgeExtraction.error}`
        );
      }

      result.imported += 1;
    } catch (err) {
      result.ok = false;
      result.errors.push(
        `${candidate.title}: ${err instanceof Error ? err.message : "unknown import error"}`
      );
    }
  }

  return result;
}
