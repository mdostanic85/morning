import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidence as evidenceTable, sourceItems as sourceItemsTable } from "@/db/schema";
import { extractTasksFromSourceItem } from "@/lib/tasks/extractor";
import { shouldAutoExtractTasksFromSource } from "@/lib/tasks/dailyFocus";
import { extractKnowledgeFromSourceItem } from "@/lib/knowledge/extractor";
import { matchAndAssignSourceItemToProject } from "@/lib/tasks/projectMatcher";
import { indexSourceItem } from "@/lib/knowledge/embeddings";
import { filterActiveProjects, getProjects, isSourceFromInactiveProject } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import type { SourceItem } from "@/domain/sourceItem";

export interface BackfillExtractionsResult {
  sourcesProcessed: number;
  sourcesRemaining: number;
  tasksExtracted: number;
  knowledgeExtracted: number;
  errors: string[];
}

const BACKFILL_BATCH_SIZE = 8;
const BACKFILL_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sourceIdsWithTaskEvidence(): Promise<Set<number>> {
  const rows = db
    .selectDistinct({ sourceItemId: evidenceTable.sourceItemId })
    .from(evidenceTable)
    .all();
  return new Set(rows.map((row) => row.sourceItemId));
}

/**
 * Re-run extraction for imported sources that never produced tasks.
 * Happens when items were saved before API keys were configured, or when
 * a prior extraction failed — duplicate-import skips them on later syncs.
 */
export async function backfillUnextractedSources(): Promise<BackfillExtractionsResult> {
  const result: BackfillExtractionsResult = {
    sourcesProcessed: 0,
    sourcesRemaining: 0,
    tasksExtracted: 0,
    knowledgeExtracted: 0,
    errors: [],
  };

  const [sources, projects, extractedSourceIds] = await Promise.all([
    getSourceItems(),
    getProjects(),
    sourceIdsWithTaskEvidence(),
  ]);

  const pending = sources.filter(
    (source) =>
      !extractedSourceIds.has(source.id) && !isSourceFromInactiveProject(source, projects)
  );
  if (pending.length === 0) return result;

  const batch = pending.slice(0, BACKFILL_BATCH_SIZE);
  result.sourcesRemaining = Math.max(0, pending.length - batch.length);

  for (const source of batch) {
    try {
      const processed = await extractFromSource(source, projects);
      result.sourcesProcessed += 1;
      result.tasksExtracted += processed.tasksExtracted;
      result.knowledgeExtracted += processed.knowledgeExtracted;
      result.errors.push(...processed.errors);
    } catch (err) {
      result.errors.push(
        `${source.title}: ${err instanceof Error ? err.message : "backfill failed"}`
      );
    }
    await sleep(BACKFILL_DELAY_MS);
  }

  return result;
}

async function extractFromSource(
  sourceItem: SourceItem,
  projects: Awaited<ReturnType<typeof getProjects>>
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

  const extraction = shouldAutoExtractTasksFromSource(item.sourceType)
    ? await extractTasksFromSourceItem({
        sourceItem: item,
        project: projectContext,
        currentUserName: null,
      })
    : null;
  if (extraction?.ok) {
    tasksExtracted += extraction.tasks.length;
  } else if (extraction && !extraction.ok) {
    errors.push(`Task extraction failed for ${item.title}: ${extraction.error}`);
  }

  const knowledgeExtraction = await extractKnowledgeFromSourceItem({
    sourceItem: item,
    project: projectContext,
  });
  if (knowledgeExtraction.ok) {
    knowledgeExtracted += knowledgeExtraction.items.length;
  } else {
    errors.push(`Knowledge extraction failed for ${item.title}: ${knowledgeExtraction.error}`);
  }

  return { tasksExtracted, knowledgeExtracted, errors };
}

/** Count source items with no linked task evidence. */
export async function countUnextractedSources(): Promise<number> {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(sourceItemsTable)
    .where(
      sql`${sourceItemsTable.id} NOT IN (SELECT DISTINCT ${evidenceTable.sourceItemId} FROM ${evidenceTable})`
    )
    .get();
  return row?.count ?? 0;
}
