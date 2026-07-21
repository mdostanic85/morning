import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceDocuments as sourceDocumentsTable } from "@/db/tables";
import { fetchAll } from "@/db/query";
import { saveSourceDocument } from "@/services/hydra";
import type { SourceItem } from "@/domain/sourceItem";
import { computeSourceContentHash } from "./sourceContentHash";

/**
 * Appends a task-path revision by reusing the Hydra report path's
 * append-on-hash `source_documents` table (WL-03) instead of creating a
 * second revision store. Call this with the OLD row right before its
 * title/body is overwritten, so the prior content survives in `metadata`.
 * `saveSourceDocument` already dedupes on (sourceItemId, contentHash), so
 * calling this for content that was already recorded is a no-op.
 */
export async function recordSourceRevision(previous: SourceItem): Promise<void> {
  const contentHash = computeSourceContentHash(previous);
  const priorRevisionCount = (
    await fetchAll(
      db
        .select({ id: sourceDocumentsTable.id })
        .from(sourceDocumentsTable)
        .where(eq(sourceDocumentsTable.sourceItemId, previous.id))
    )
  ).length;

  await saveSourceDocument({
    sourceItemId: previous.id,
    provider: previous.sourceType,
    externalId: previous.sourceExternalId ?? String(previous.id),
    version: String(priorRevisionCount + 1),
    contentHash,
    sourceUpdatedAt: previous.updatedAt ?? previous.createdAt,
    fetchedAt: new Date().toISOString(),
    metadata: {
      title: previous.title,
      body: previous.body,
      author: previous.author,
      sourceDate: previous.sourceDate,
      url: previous.url,
    },
  });
}

export interface SourceRevisionSummary {
  version: string | null;
  contentHash: string;
  fetchedAt: string;
  title: string | null;
  body: string | null;
  author: string | null;
  sourceDate: string | null;
  url: string | null;
}

/** Prior revisions for a source item, oldest first — for a future "history" UI. */
export async function getSourceRevisions(sourceItemId: number): Promise<SourceRevisionSummary[]> {
  const rows = await fetchAll(
    db
      .select()
      .from(sourceDocumentsTable)
      .where(eq(sourceDocumentsTable.sourceItemId, sourceItemId))
      .orderBy(sourceDocumentsTable.id)
  );
  return rows.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      version: row.version,
      contentHash: row.contentHash,
      fetchedAt: row.fetchedAt,
      title: typeof metadata.title === "string" ? metadata.title : null,
      body: typeof metadata.body === "string" ? metadata.body : null,
      author: typeof metadata.author === "string" ? metadata.author : null,
      sourceDate: typeof metadata.sourceDate === "string" ? metadata.sourceDate : null,
      url: typeof metadata.url === "string" ? metadata.url : null,
    };
  });
}
