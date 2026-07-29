import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceItems as sourceItemsTable } from "@/db/tables";
import { fetchAll, fetchOne, execute, fetchReturning } from "@/db/query";
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
    contentHash: row.contentHash ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
  };
}

/** True for a Postgres unique-violation error (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && typeof err === "object" && (err as { code?: string }).code === "23505";
}

/**
 * Creates a source item. If a concurrent sync already inserted a row for
 * the same (sourceType, sourceExternalId) — enforced DB-side by the
 * `source_items_type_external_id_unique` partial index (WL-04) — this falls
 * back to updating that winning row instead of throwing or duplicating.
 * Application code should still look up existing rows first (see
 * `sourceImportPipeline.ts`); this is the race-safety backstop.
 */
export async function createSourceItem(input: NewSourceItem): Promise<SourceItem> {
  try {
    const [row] = await fetchReturning(
      db
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
          contentHash: input.contentHash ?? null,
          updatedAt: new Date().toISOString(),
        })
        .returning()
    );
    return toSourceItem(row);
  } catch (err) {
    if (isUniqueViolation(err) && input.sourceExternalId) {
      const winner = await getSourceItemByExternalId({
        sourceType: input.sourceType,
        sourceExternalId: input.sourceExternalId,
      });
      if (winner) {
        const updated = await updateSourceItem(winner.id, {
          title: input.title,
          body: input.body,
          author: input.author ?? null,
          sourceDate: input.sourceDate,
          url: input.url ?? null,
          metadata: input.metadata ?? null,
          contentHash: input.contentHash ?? null,
        });
        if (updated) return updated;
      }
    }
    throw err;
  }
}

export async function getSourceItems(): Promise<SourceItem[]> {
  const rows = await fetchAll(
    db.select().from(sourceItemsTable).orderBy(desc(sourceItemsTable.sourceDate))
  );
  return rows.map(toSourceItem);
}

export async function getSourceItemById(id: number): Promise<SourceItem | null> {
  const row = await fetchOne(db.select().from(sourceItemsTable).where(eq(sourceItemsTable.id, id)));
  return row ? toSourceItem(row) : null;
}

export async function getSourceItemsByIds(ids: number[]): Promise<SourceItem[]> {
  if (ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  const rows = await fetchAll(
    db.select().from(sourceItemsTable).where(inArray(sourceItemsTable.id, uniqueIds))
  );
  return rows.map(toSourceItem);
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
    );
  const found = await fetchOne(row);
  return found ? toSourceItem(found) : null;
}

export async function getSourceItemsForProject(projectId: number): Promise<SourceItem[]> {
  const rows = await fetchAll(
    db
      .select()
      .from(sourceItemsTable)
      .where(eq(sourceItemsTable.projectId, projectId))
      .orderBy(desc(sourceItemsTable.sourceDate))
  );
  return rows.map(toSourceItem);
}

export async function getSourceItemsForProjectIds(projectIds: number[]): Promise<SourceItem[]> {
  if (projectIds.length === 0) return [];
  const unique = Array.from(new Set(projectIds));
  const rows = await fetchAll(
    db
      .select()
      .from(sourceItemsTable)
      .where(inArray(sourceItemsTable.projectId, unique))
      .orderBy(desc(sourceItemsTable.sourceDate))
  );
  return rows.map(toSourceItem);
}

/**
 * Every imported Figma comment for one file. Comment rows are keyed
 * `<fileKey>:comment:<commentId>`, so one prefix match returns the whole
 * file's threads without loading unrelated sources.
 */
export async function getFigmaCommentSourceItems(fileKey: string): Promise<SourceItem[]> {
  const trimmed = fileKey.trim();
  if (!trimmed) return [];
  const rows = await fetchAll(
    db
      .select()
      .from(sourceItemsTable)
      .where(
        and(
          eq(sourceItemsTable.sourceType, "figma"),
          like(sourceItemsTable.sourceExternalId, `${trimmed}:comment:%`)
        )
      )
      .orderBy(desc(sourceItemsTable.sourceDate))
  );
  return rows.map(toSourceItem);
}

/** Simple substring search over title and body. Good enough until FTS5 lands. */
export async function searchSourceItems(query: string): Promise<SourceItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return getSourceItems();

  const pattern = `%${trimmed}%`;
  const rows = await fetchAll(
    db
      .select()
      .from(sourceItemsTable)
      .where(or(like(sourceItemsTable.title, pattern), like(sourceItemsTable.body, pattern)))
      .orderBy(desc(sourceItemsTable.sourceDate))
  );

  return rows.map(toSourceItem);
}

export async function updateSourceItem(
  id: number,
  patch: Partial<NewSourceItem>
): Promise<SourceItem | null> {
  const [row] = await fetchReturning(
    db
      .update(sourceItemsTable)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(sourceItemsTable.id, id))
      .returning()
  );
  return row ? toSourceItem(row) : null;
}

export async function deleteSourceItem(id: number): Promise<void> {
  await execute(db.delete(sourceItemsTable).where(eq(sourceItemsTable.id, id)));
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
    .where(eq(sourceItemsTable.sourceType, "manual_transcript"));
  const all = await fetchAll(existing);
  const found = all.find((row) => (row.metadata as { contentHash?: string } | null)?.contentHash === contentHash);

  if (found) {
    return { sourceItem: toSourceItem(found), deduped: true };
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
