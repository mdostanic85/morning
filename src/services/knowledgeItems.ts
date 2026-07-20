import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  knowledgeEmbeddings as knowledgeEmbeddingsTable,
  knowledgeItems as knowledgeItemsTable,
} from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning, execute, withTransaction, syncRun } from "@/db/query";
import { isPostgresDatabase } from "@/db/dialect";
import type { KnowledgeItem, NewKnowledgeItem } from "@/domain/knowledgeItem";
import type { SourceItem, SourceType } from "@/domain/sourceItem";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";

export interface KnowledgeItemView extends KnowledgeItem {
  sourceTitle: string | null;
  sourceType: SourceType | null;
  sourceUrl: string | null;
  sourceDate: string | null;
  sourceAuthor: string | null;
  projectName: string | null;
}

function itemSortTime(item: { sourceDate: string | null; createdAt: string }): number {
  const value = item.sourceDate ?? item.createdAt;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function enrichKnowledgeItems(
  items: KnowledgeItem[],
  sources: SourceItem[],
  projectNameById: Map<number, string>
): KnowledgeItemView[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return items
    .map((item) => {
      const source = item.sourceItemId ? sourceById.get(item.sourceItemId) ?? null : null;
      return {
        ...item,
        sourceTitle: source?.title ?? null,
        sourceType: source?.sourceType ?? null,
        sourceUrl: source?.url ?? null,
        sourceDate: source?.sourceDate ?? null,
        sourceAuthor: source?.author ?? null,
        projectName: item.projectId ? projectNameById.get(item.projectId) ?? null : null,
      };
    })
    .sort((a, b) => itemSortTime(b) - itemSortTime(a));
}

export async function getKnowledgeItemsWithContext(): Promise<KnowledgeItemView[]> {
  const [items, sources, projects] = await Promise.all([
    getKnowledgeItems(),
    getSourceItems(),
    getProjects(),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  return enrichKnowledgeItems(items, sources, projectNameById);
}

export async function getKnowledgeItemsForProjectWithContext(
  projectId: number
): Promise<KnowledgeItemView[]> {
  const [items, sources, projects] = await Promise.all([
    getKnowledgeItemsForProject(projectId),
    getSourceItems(),
    getProjects(),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  return enrichKnowledgeItems(items, sources, projectNameById);
}

function toKnowledgeItem(row: typeof knowledgeItemsTable.$inferSelect): KnowledgeItem {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    content: row.content,
    sourceItemId: row.sourceItemId,
    confidence: row.confidence,
    reviewStatus: row.reviewStatus,
    evidenceQuotes: row.evidenceQuotes ?? [],
    createdAt: row.createdAt,
  };
}

export async function createKnowledgeItem(input: NewKnowledgeItem): Promise<KnowledgeItem> {
  const [row] = await fetchReturning(
    db
      .insert(knowledgeItemsTable)
      .values({
        projectId: input.projectId ?? null,
        type: input.type,
        title: input.title,
        content: input.content,
        sourceItemId: input.sourceItemId ?? null,
        confidence: input.confidence ?? null,
        reviewStatus: input.reviewStatus ?? "approved",
        evidenceQuotes: input.evidenceQuotes ?? [],
      })
      .returning()
  );
  return toKnowledgeItem(row);
}

export async function approveKnowledgeItem(id: number): Promise<KnowledgeItem | null> {
  const [row] = await fetchReturning(
    db.update(knowledgeItemsTable).set({ reviewStatus: "approved" }).where(eq(knowledgeItemsTable.id, id)).returning()
  );
  return row ? toKnowledgeItem(row) : null;
}

/** Accepted knowledge only — pending items live in the Inbox review list. */
export async function getKnowledgeItems(): Promise<KnowledgeItem[]> {
  const rows = await fetchAll(
    db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.reviewStatus, "approved")).orderBy(desc(knowledgeItemsTable.createdAt))
  );
  return rows.map(toKnowledgeItem);
}

export async function getPendingKnowledgeItems(): Promise<KnowledgeItem[]> {
  const rows = await fetchAll(
    db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.reviewStatus, "pending")).orderBy(desc(knowledgeItemsTable.createdAt))
  );
  return rows.map(toKnowledgeItem);
}

export async function getKnowledgeItemById(id: number): Promise<KnowledgeItem | null> {
  const row = await fetchOne(db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, id)));
  return row ? toKnowledgeItem(row) : null;
}

export async function getKnowledgeItemsForProject(projectId: number): Promise<KnowledgeItem[]> {
  const [items, sources] = await Promise.all([getKnowledgeItems(), getSourceItems()]);
  const sourceProjectById = new Map(
    sources.map((source) => [source.id, source.projectId] as const)
  );

  return items.filter((item) => {
    if (item.projectId === projectId) return true;
    if (item.sourceItemId == null) return false;
    return sourceProjectById.get(item.sourceItemId) === projectId;
  });
}

export async function deleteKnowledgeItem(id: number): Promise<void> {
  await execute(db.delete(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, id)));
}

export async function deleteKnowledgeItemsForSource(sourceItemId: number): Promise<void> {
  const rows = await fetchAll(
    db.select({ id: knowledgeItemsTable.id }).from(knowledgeItemsTable).where(eq(knowledgeItemsTable.sourceItemId, sourceItemId))
  );
  const ids = rows.map((row) => row.id);

  if (isPostgresDatabase()) {
    await db.transaction(async (tx) => {
      if (ids.length > 0) {
        await tx
          .delete(knowledgeEmbeddingsTable)
          .where(
            and(
              eq(knowledgeEmbeddingsTable.itemType, "knowledge_item"),
              inArray(knowledgeEmbeddingsTable.knowledgeItemId, ids)
            )
          );
      }
      await tx.delete(knowledgeItemsTable).where(eq(knowledgeItemsTable.sourceItemId, sourceItemId));
    });
    return;
  }

  await withTransaction((tx) => {
    if (ids.length > 0) {
      syncRun(
        tx.delete(knowledgeEmbeddingsTable)
        .where(and(eq(knowledgeEmbeddingsTable.itemType, "knowledge_item"), inArray(knowledgeEmbeddingsTable.knowledgeItemId, ids)))
      );
    }
    syncRun(tx.delete(knowledgeItemsTable).where(eq(knowledgeItemsTable.sourceItemId, sourceItemId)));
  });
}
