import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceItems as sourceItemsTable } from "@/db/schema";
import type { NewSourceItem, SourceItem } from "@/domain/sourceItem";

function toSourceItem(row: typeof sourceItemsTable.$inferSelect): SourceItem {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceType: row.sourceType,
    sourceExternalId: row.sourceExternalId,
    title: row.title,
    body: row.body,
    author: row.author,
    sourceDate: row.sourceDate,
    url: row.url,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

export async function createSourceItem(input: NewSourceItem): Promise<SourceItem> {
  const [row] = db
    .insert(sourceItemsTable)
    .values({
      projectId: input.projectId ?? null,
      sourceType: input.sourceType,
      sourceExternalId: input.sourceExternalId ?? null,
      title: input.title,
      body: input.body,
      author: input.author ?? null,
      sourceDate: input.sourceDate,
      url: input.url ?? null,
      metadata: input.metadata ?? null,
    })
    .returning()
    .all();
  return toSourceItem(row);
}

export async function getSourceItems(): Promise<SourceItem[]> {
  const rows = db
    .select()
    .from(sourceItemsTable)
    .orderBy(desc(sourceItemsTable.sourceDate))
    .all();
  return rows.map(toSourceItem);
}

export async function getSourceItemById(id: number): Promise<SourceItem | null> {
  const row = db.select().from(sourceItemsTable).where(eq(sourceItemsTable.id, id)).get();
  return row ? toSourceItem(row) : null;
}

export async function getSourceItemByExternalId(input: {
  sourceType: SourceItem["sourceType"];
  sourceExternalId: string;
}): Promise<SourceItem | null> {
  const row = db
    .select()
    .from(sourceItemsTable)
    .where(
      and(
        eq(sourceItemsTable.sourceType, input.sourceType),
        eq(sourceItemsTable.sourceExternalId, input.sourceExternalId)
      )
    )
    .get();
  return row ? toSourceItem(row) : null;
}

export async function getSourceItemsForProject(projectId: number): Promise<SourceItem[]> {
  const rows = db
    .select()
    .from(sourceItemsTable)
    .where(eq(sourceItemsTable.projectId, projectId))
    .orderBy(desc(sourceItemsTable.sourceDate))
    .all();
  return rows.map(toSourceItem);
}

/** Simple substring search over title and body. Good enough until FTS5 lands. */
export async function searchSourceItems(query: string): Promise<SourceItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return getSourceItems();

  const pattern = `%${trimmed}%`;
  const rows = db
    .select()
    .from(sourceItemsTable)
    .where(or(like(sourceItemsTable.title, pattern), like(sourceItemsTable.body, pattern)))
    .orderBy(desc(sourceItemsTable.sourceDate))
    .all();

  return rows.map(toSourceItem);
}

export async function updateSourceItem(
  id: number,
  patch: Partial<NewSourceItem>
): Promise<SourceItem | null> {
  const [row] = db
    .update(sourceItemsTable)
    .set(patch)
    .where(eq(sourceItemsTable.id, id))
    .returning()
    .all();
  return row ? toSourceItem(row) : null;
}

export async function deleteSourceItem(id: number): Promise<void> {
  db.delete(sourceItemsTable).where(eq(sourceItemsTable.id, id)).run();
}

/**
 * Stores a pasted transcript as a source item, deduping on a content hash
 * stashed in metadata. This is the manual-transcript connector's only job —
 * it never touches the LLM router or creates tasks.
 */
export async function ingestManualTranscript(input: {
  title: string;
  body: string;
  projectId?: number | null;
}): Promise<{ sourceItem: SourceItem; deduped: boolean }> {
  const contentHash = createHash("sha256").update(input.body.trim()).digest("hex");

  const existing = db
    .select()
    .from(sourceItemsTable)
    .where(eq(sourceItemsTable.sourceType, "manual_transcript"))
    .all()
    .find((row) => (row.metadata as { contentHash?: string } | null)?.contentHash === contentHash);

  if (existing) {
    return { sourceItem: toSourceItem(existing), deduped: true };
  }

  const sourceItem = await createSourceItem({
    projectId: input.projectId ?? null,
    sourceType: "manual_transcript",
    title: input.title.trim() || "Untitled transcript",
    body: input.body,
    sourceDate: new Date().toISOString(),
    metadata: { contentHash },
  });

  return { sourceItem, deduped: false };
}
