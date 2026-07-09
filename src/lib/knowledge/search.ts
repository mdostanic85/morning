import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { knowledgeEmbeddings as embeddingsTable } from "@/db/schema";
import { getActiveProviders } from "@/services/settings";
import { getKnowledgeItems } from "@/services/knowledgeItems";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { chunkTextSafely } from "./chunker";
import { embedTexts, ensureKnowledgeEmbeddingsTable } from "./embeddings";
import type { SourceItem } from "@/domain/sourceItem";

export type KnowledgeSearchMode = "embedding" | "keyword";

export interface KnowledgeSearchResult {
  sourceItem: SourceItem | null;
  chunkText: string;
  similarityScore: number;
  project: {
    id: number;
    name: string;
  } | null;
  sourceDate: string;
  itemType: "source_item" | "knowledge_item";
  knowledgeItemId: number | null;
  knowledgeItemTitle: string | null;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[];
  mode: KnowledgeSearchMode;
}

interface SearchCandidate {
  sourceItem: SourceItem | null;
  chunkText: string;
  project: KnowledgeSearchResult["project"];
  sourceDate: string;
  itemType: "source_item" | "knowledge_item";
  knowledgeItemId: number | null;
  knowledgeItemTitle: string | null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    aMagnitude += a[i] * a[i];
    bMagnitude += b[i] * b[i];
  }

  if (aMagnitude === 0 || bMagnitude === 0) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((term) => term.length >= 2)
    )
  );
}

function keywordScore(text: string, terms: string[], phrase: string): number {
  if (terms.length === 0) return 0;
  const lowered = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lowered.includes(term)) score += 1;
  }
  if (phrase.length >= 4 && lowered.includes(phrase)) {
    score += terms.length;
  }
  return score;
}

function candidateKey(candidate: SearchCandidate): string {
  return [
    candidate.itemType,
    candidate.sourceItem?.id ?? "none",
    candidate.chunkText.slice(0, 120),
  ].join("::");
}

async function embeddingSearch(
  query: string,
  limit: number
): Promise<KnowledgeSearchResult[]> {
  const [queryEmbedding] = await embedTexts([query]);
  const [embeddingRows, sourceItems, projects, knowledgeItems] = await Promise.all([
    db.select().from(embeddingsTable).orderBy(desc(embeddingsTable.createdAt)).all(),
    getSourceItems(),
    getProjects(),
    getKnowledgeItems(),
  ]);

  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const knowledgeById = new Map(knowledgeItems.map((item) => [item.id, item]));

  return embeddingRows
    .map((row) => {
      const sourceItem = row.sourceItemId ? sourceById.get(row.sourceItemId) ?? null : null;
      const project = row.projectId ? projectById.get(row.projectId) ?? null : null;
      const knowledgeItem = row.knowledgeItemId
        ? knowledgeById.get(row.knowledgeItemId) ?? null
        : null;
      return {
        sourceItem,
        chunkText: row.chunkText,
        similarityScore: cosineSimilarity(queryEmbedding, row.embedding),
        project: project ? { id: project.id, name: project.name } : null,
        sourceDate: row.sourceDate,
        itemType: row.itemType,
        knowledgeItemId: row.knowledgeItemId ?? null,
        knowledgeItemTitle: knowledgeItem?.title ?? null,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

async function keywordSearch(query: string, limit: number): Promise<KnowledgeSearchResult[]> {
  const terms = queryTerms(query);
  const phrase = query.toLowerCase();
  const [embeddingRows, sourceItems, projects, knowledgeItems] = await Promise.all([
    db.select().from(embeddingsTable).orderBy(desc(embeddingsTable.createdAt)).all(),
    getSourceItems(),
    getProjects(),
    getKnowledgeItems(),
  ]);

  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];

  function addCandidate(candidate: SearchCandidate) {
    const key = candidateKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  for (const row of embeddingRows) {
    const knowledgeItem = row.knowledgeItemId
      ? knowledgeItems.find((item) => item.id === row.knowledgeItemId) ?? null
      : null;
    addCandidate({
      sourceItem: row.sourceItemId ? sourceById.get(row.sourceItemId) ?? null : null,
      chunkText: row.chunkText,
      project: row.projectId ? projectById.get(row.projectId) ?? null : null,
      sourceDate: row.sourceDate,
      itemType: row.itemType,
      knowledgeItemId: row.knowledgeItemId ?? null,
      knowledgeItemTitle: knowledgeItem?.title ?? null,
    });
  }

  for (const sourceItem of sourceItems) {
    const project = sourceItem.projectId ? projectById.get(sourceItem.projectId) ?? null : null;
    const chunks = chunkTextSafely(`${sourceItem.title}\n\n${sourceItem.body}`);
    for (const chunk of chunks) {
      addCandidate({
        sourceItem,
        chunkText: chunk.text,
        project: project ? { id: project.id, name: project.name } : null,
        sourceDate: sourceItem.sourceDate,
        itemType: "source_item",
        knowledgeItemId: null,
        knowledgeItemTitle: null,
      });
    }
  }

  for (const item of knowledgeItems) {
    const sourceItem = item.sourceItemId ? sourceById.get(item.sourceItemId) ?? null : null;
    const project = item.projectId ? projectById.get(item.projectId) ?? null : null;
    const chunks = chunkTextSafely(`${item.title}\n\n${item.content}`);
    for (const chunk of chunks) {
      addCandidate({
        sourceItem,
        chunkText: chunk.text,
        project: project ? { id: project.id, name: project.name } : null,
        sourceDate: sourceItem?.sourceDate ?? item.createdAt,
        itemType: "knowledge_item",
        knowledgeItemId: item.id,
        knowledgeItemTitle: item.title,
      });
    }
  }

  const scored = candidates
    .map((candidate) => ({
      sourceItem: candidate.sourceItem,
      chunkText: candidate.chunkText,
      project: candidate.project,
      sourceDate: candidate.sourceDate,
      itemType: candidate.itemType,
      knowledgeItemId: candidate.knowledgeItemId,
      knowledgeItemTitle: candidate.knowledgeItemTitle,
      similarityScore: keywordScore(candidate.chunkText, terms, phrase),
    }))
    .filter((candidate) => candidate.similarityScore > 0);

  const maxScore = scored.reduce((max, item) => Math.max(max, item.similarityScore), 0);

  return scored
    .map((candidate) => ({
      sourceItem: candidate.sourceItem,
      chunkText: candidate.chunkText,
      similarityScore: maxScore > 0 ? candidate.similarityScore / maxScore : 0,
      project: candidate.project,
      sourceDate: candidate.sourceDate,
      itemType: candidate.itemType,
      knowledgeItemId: candidate.knowledgeItemId,
      knowledgeItemTitle: candidate.knowledgeItemTitle,
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

export async function searchKnowledgeBase(
  query: string,
  options: { limit?: number } = {}
): Promise<KnowledgeSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], mode: "keyword" };

  await ensureKnowledgeEmbeddingsTable();
  const limit = options.limit ?? 12;
  const active = await getActiveProviders();

  if (active.includes("openai")) {
    try {
      const results = await embeddingSearch(trimmed, limit);
      return { results, mode: "embedding" };
    } catch {
      // OpenAI unavailable at runtime — fall back to local keyword search.
    }
  }

  return { results: await keywordSearch(trimmed, limit), mode: "keyword" };
}
