import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeItems as knowledgeItemsTable } from "@/db/schema";
import type { KnowledgeItem, NewKnowledgeItem } from "@/domain/knowledgeItem";

function toKnowledgeItem(row: typeof knowledgeItemsTable.$inferSelect): KnowledgeItem {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    content: row.content,
    sourceItemId: row.sourceItemId,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export async function createKnowledgeItem(input: NewKnowledgeItem): Promise<KnowledgeItem> {
  const [row] = db
    .insert(knowledgeItemsTable)
    .values({
      projectId: input.projectId ?? null,
      type: input.type,
      title: input.title,
      content: input.content,
      sourceItemId: input.sourceItemId ?? null,
      confidence: input.confidence ?? null,
    })
    .returning()
    .all();
  return toKnowledgeItem(row);
}

export async function getKnowledgeItems(): Promise<KnowledgeItem[]> {
  const rows = db
    .select()
    .from(knowledgeItemsTable)
    .orderBy(desc(knowledgeItemsTable.createdAt))
    .all();
  return rows.map(toKnowledgeItem);
}

export async function getKnowledgeItemById(id: number): Promise<KnowledgeItem | null> {
  const row = db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, id)).get();
  return row ? toKnowledgeItem(row) : null;
}

export async function getKnowledgeItemsForProject(projectId: number): Promise<KnowledgeItem[]> {
  const rows = db
    .select()
    .from(knowledgeItemsTable)
    .where(eq(knowledgeItemsTable.projectId, projectId))
    .orderBy(desc(knowledgeItemsTable.createdAt))
    .all();
  return rows.map(toKnowledgeItem);
}

export async function deleteKnowledgeItem(id: number): Promise<void> {
  db.delete(knowledgeItemsTable).where(eq(knowledgeItemsTable.id, id)).run();
}
