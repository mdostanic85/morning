import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildKnowledgeQaUserPrompt,
  knowledgeQaOutputSchema,
  type KnowledgeQaChunk,
} from "@/lib/llm/prompts/knowledgeQa";
import {
  searchKnowledgeBase,
  type KnowledgeSearchResult,
  type KnowledgeSearchMode,
} from "./search";

export interface KnowledgeAnswerLink {
  label: string;
  href: string;
  external: boolean;
}

export interface KnowledgeAnswerSource {
  sourceType: string | null;
  title: string;
  sourceDate: string;
  excerpt: string;
  href: string | null;
  external: boolean;
}

export interface KnowledgeAnswer {
  ok: boolean;
  canAnswer: boolean;
  answer: string;
  links: KnowledgeAnswerLink[];
  sources: KnowledgeAnswerSource[];
  searchMode?: KnowledgeSearchMode;
  error?: string;
}

const QA_CHUNK_LIMIT = 8;
const SOURCE_EXCERPT_LENGTH = 160;

function excerptChunk(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > SOURCE_EXCERPT_LENGTH
    ? `${trimmed.slice(0, SOURCE_EXCERPT_LENGTH)}…`
    : trimmed;
}

function buildLinkLabel(result: KnowledgeSearchResult): string {
  if (result.knowledgeItemTitle) return result.knowledgeItemTitle;
  if (result.sourceItem?.title) return result.sourceItem.title;
  if (result.project?.name) return result.project.name;
  return "Source";
}

function buildLinksFromResults(results: KnowledgeSearchResult[]): KnowledgeAnswerLink[] {
  const seen = new Set<string>();
  const links: KnowledgeAnswerLink[] = [];

  for (const result of results) {
    const candidates: KnowledgeAnswerLink[] = [];

    if (result.sourceItem?.url) {
      candidates.push({
        label: buildLinkLabel(result),
        href: result.sourceItem.url,
        external: true,
      });
    }

    if (result.knowledgeItemId != null) {
      candidates.push({
        label: result.knowledgeItemTitle ?? buildLinkLabel(result),
        href: `/knowledge#knowledge-${result.knowledgeItemId}`,
        external: false,
      });
    }

    if (result.project) {
      candidates.push({
        label: result.project.name,
        href: `/projects/${result.project.id}`,
        external: false,
      });
    }

    for (const candidate of candidates) {
      const key = candidate.href;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(candidate);
    }
  }

  return links;
}

function buildSourcesFromResults(results: KnowledgeSearchResult[]): KnowledgeAnswerSource[] {
  const seen = new Set<string>();
  const sources: KnowledgeAnswerSource[] = [];

  for (const result of results) {
    const key =
      result.sourceItem?.id != null
        ? `source-${result.sourceItem.id}`
        : result.knowledgeItemId != null
          ? `knowledge-${result.knowledgeItemId}`
          : `chunk-${result.chunkText.slice(0, 40)}`;

    if (seen.has(key)) continue;
    seen.add(key);

    let href: string | null = null;
    let external = false;

    if (result.sourceItem?.url) {
      href = result.sourceItem.url;
      external = true;
    } else if (result.knowledgeItemId != null) {
      href = `/knowledge#knowledge-${result.knowledgeItemId}`;
      external = false;
    } else if (result.project) {
      href = `/projects/${result.project.id}`;
      external = false;
    }

    sources.push({
      sourceType: result.sourceItem?.sourceType ?? null,
      title: buildLinkLabel(result),
      sourceDate: result.sourceDate,
      excerpt: excerptChunk(result.chunkText),
      href,
      external,
    });
  }

  return sources;
}

/**
 * Grounded Q&A over the local knowledge base: retrieve the closest chunks by
 * embedding similarity, then ask the router to answer strictly from them.
 * Answers with no cited evidence are downgraded to "can't answer" — the app
 * never presents an uncited claim as fact (see ai-safety.mdc).
 */
export async function answerKnowledgeQuestion(question: string): Promise<KnowledgeAnswer> {
  const { results, mode: searchMode } = await searchKnowledgeBase(question, { limit: QA_CHUNK_LIMIT });

  if (results.length === 0) {
    return {
      ok: true,
      canAnswer: false,
      answer: "Nothing in your knowledge base matches this yet.",
      links: [],
      sources: [],
      searchMode,
    };
  }

  const chunks: KnowledgeQaChunk[] = results.map((result, index) => ({
    index,
    text: result.chunkText,
    sourceTitle: result.sourceItem?.title ?? null,
    sourceType: result.sourceItem?.sourceType ?? null,
    sourceDate: result.sourceDate,
    projectName: result.project?.name ?? null,
  }));

  const llmResult = await runLlmJob({
    jobType: "knowledge_qa",
    userPrompt: buildKnowledgeQaUserPrompt({ question, chunks }),
    schema: knowledgeQaOutputSchema,
  });

  if (!llmResult.ok) {
    return {
      ok: false,
      canAnswer: false,
      answer: "",
      links: [],
      sources: [],
      error: `${llmResult.kind}: ${llmResult.error}`,
      searchMode,
    };
  }

  const citedResults = llmResult.data.citedChunkIndexes
    .filter((index) => index >= 0 && index < results.length)
    .map((index) => results[index]);

  const canAnswer = llmResult.data.canAnswer && citedResults.length > 0;

  return {
    ok: true,
    canAnswer,
    answer: llmResult.data.answer,
    links: canAnswer ? buildLinksFromResults(citedResults) : [],
    sources: canAnswer ? buildSourcesFromResults(citedResults) : [],
    searchMode,
  };
}
