import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeEmbeddings as embeddingsTable } from "@/db/tables";
import { EMBEDDING_MODEL_CONFIG, runEmbeddingJob } from "@/lib/llm/router";
import { chunkTextSafely, type TextChunk } from "./chunker";
import type { KnowledgeItem } from "@/domain/knowledgeItem";
import type { SourceItem } from "@/domain/sourceItem";
import { execute } from "@/db/query";

type EmbeddingItemType = "source_item" | "knowledge_item";

export interface StoredEmbeddingInput {
  itemType: EmbeddingItemType;
  sourceItemId?: number | null;
  knowledgeItemId?: number | null;
  projectId?: number | null;
  sourceDate: string;
  chunks: TextChunk[];
}

export async function ensureKnowledgeEmbeddingsTable(): Promise<void> {
  // PostgreSQL migrations own table creation; nothing to bootstrap at runtime.
}

/** All embedding calls go through the central LLM router — never a provider API directly. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const result = await runEmbeddingJob(texts);
  if (!result.ok) {
    throw new Error(`${result.kind}: ${result.error}`);
  }
  return result.vectors;
}

export async function storeEmbeddings(input: StoredEmbeddingInput): Promise<void> {
  await ensureKnowledgeEmbeddingsTable();
  if (input.chunks.length === 0) return;

  const vectors = await embedTexts(input.chunks.map((chunk) => chunk.text));

  if (input.itemType === "source_item" && input.sourceItemId != null) {
    await execute(
      db.delete(embeddingsTable).where(and(eq(embeddingsTable.itemType, "source_item"), eq(embeddingsTable.sourceItemId, input.sourceItemId)))
    );
  }

  if (input.itemType === "knowledge_item" && input.knowledgeItemId != null) {
    await execute(
      db.delete(embeddingsTable).where(and(eq(embeddingsTable.itemType, "knowledge_item"), eq(embeddingsTable.knowledgeItemId, input.knowledgeItemId)))
    );
  }
  for (let index = 0; index < input.chunks.length; index++) {
    const chunk = input.chunks[index];
    await execute(
      db.insert(embeddingsTable).values({
        itemType: input.itemType,
        sourceItemId: input.sourceItemId ?? null,
        knowledgeItemId: input.knowledgeItemId ?? null,
        projectId: input.projectId ?? null,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding: vectors[index],
        model: EMBEDDING_MODEL_CONFIG.model,
        sourceDate: input.sourceDate,
      })
    );
  }
}

export async function indexSourceItem(sourceItem: SourceItem): Promise<void> {
  await storeEmbeddings({
    itemType: "source_item",
    sourceItemId: sourceItem.id,
    projectId: sourceItem.projectId,
    sourceDate: sourceItem.sourceDate,
    chunks: chunkTextSafely(`${sourceItem.title}\n\n${sourceItem.body}`),
  });
}

export async function deleteKnowledgeItemEmbeddings(knowledgeItemId: number): Promise<void> {
  await ensureKnowledgeEmbeddingsTable();
  await execute(
    db.delete(embeddingsTable).where(
      and(
        eq(embeddingsTable.itemType, "knowledge_item"),
        eq(embeddingsTable.knowledgeItemId, knowledgeItemId)
      )
    )
  );
}

export async function indexKnowledgeItem(
  item: KnowledgeItem,
  sourceItem?: SourceItem | null
): Promise<void> {
  await storeEmbeddings({
    itemType: "knowledge_item",
    sourceItemId: item.sourceItemId,
    knowledgeItemId: item.id,
    projectId: item.projectId,
    sourceDate: sourceItem?.sourceDate ?? item.createdAt,
    chunks: chunkTextSafely(`${item.title}\n\n${item.content}`),
  });
}
