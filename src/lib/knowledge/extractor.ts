import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildKnowledgeExtractorUserPrompt,
  knowledgeExtractionOutputSchema,
  type KnowledgeItemCandidate,
} from "@/lib/llm/prompts/knowledgeExtractor";
import { createKnowledgeItem } from "@/services/knowledgeItems";
import { indexKnowledgeItem } from "@/lib/knowledge/embeddings";
import type { KnowledgeItem } from "@/domain/knowledgeItem";
import type { Project } from "@/domain/project";
import type { SourceItem } from "@/domain/sourceItem";

export interface ExtractKnowledgeOptions {
  sourceItem: SourceItem;
  project?: Pick<Project, "name" | "description" | "keywords" | "people"> | null;
}

export interface ExtractedKnowledgeItem {
  item: KnowledgeItem;
  evidenceQuotes: string[];
  isUnclear: boolean;
}

export interface KnowledgeExtractionRunResult {
  ok: boolean;
  sourceItemId: number;
  items: ExtractedKnowledgeItem[];
  error?: string;
}

function emptyResult(sourceItemId: number, error?: string): KnowledgeExtractionRunResult {
  return {
    ok: !error,
    sourceItemId,
    items: [],
    error,
  };
}

async function saveCandidate(
  candidate: KnowledgeItemCandidate,
  sourceItem: SourceItem
): Promise<ExtractedKnowledgeItem> {
  // Saved as approved and indexed immediately — no separate review step.
  const item = await createKnowledgeItem({
    projectId: null,
    sourceItemId: sourceItem.id,
    type: candidate.type,
    title: candidate.title,
    content: candidate.isUnclear
      ? `${candidate.content} (Unclear: needs user review.)`
      : candidate.content,
    confidence: candidate.confidence,
    reviewStatus: "approved",
    evidenceQuotes: candidate.evidence.map((evidence) => evidence.quote),
  });

  try {
    await indexKnowledgeItem(item, sourceItem);
  } catch {
    // Item is saved; search indexing can catch up on a later sync.
  }

  return {
    item,
    evidenceQuotes: item.evidenceQuotes,
    isUnclear: candidate.isUnclear,
  };
}

/**
 * Extracts learnings from any source item. Knowledge is stored globally with its
 * source — not auto-linked to a project. Connector-agnostic: manual transcripts
 * and future Confluence/Gmail/etc. imports call the same function after persisting
 * a SourceItem.
 */
export async function extractKnowledgeFromSourceItem(
  options: ExtractKnowledgeOptions
): Promise<KnowledgeExtractionRunResult> {
  const { sourceItem, project = null } = options;

  const result = await runLlmJob({
    jobType: "knowledge_extraction",
    userPrompt: buildKnowledgeExtractorUserPrompt({
      sourceTitle: sourceItem.title,
      sourceType: sourceItem.sourceType,
      sourceDate: sourceItem.sourceDate,
      sourceBody: sourceItem.body,
      project,
    }),
    schema: knowledgeExtractionOutputSchema,
  });

  if (!result.ok) {
    return emptyResult(sourceItem.id, `${result.kind}: ${result.error}`);
  }

  const items: ExtractedKnowledgeItem[] = [];
  for (const candidate of result.data.items) {
    items.push(await saveCandidate(candidate, sourceItem));
  }

  return {
    ok: true,
    sourceItemId: sourceItem.id,
    items,
  };
}
