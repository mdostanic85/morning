import { z } from "zod";
import { KNOWLEDGE_ITEM_TYPES } from "@/domain/knowledgeItem";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, evidenceQuoteSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "knowledge_extraction";

export interface KnowledgeExtractorInput {
  sourceTitle: string;
  sourceType: string;
  sourceDate: string;
  sourceBody: string;
  project?: {
    name: string;
    description: string | null;
    keywords: string[];
    people: string[];
  } | null;
}

export const KNOWLEDGE_EXTRACTOR_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the knowledge extraction engine for a local-first daily work operator app. Your job is to capture the newest, most relevant things the user learned from one raw source item — each item is a remembered fact with its source, not a to-do.`,
  jobInstructions: `
- Extract knowledge items of these types only: "requirement", "decision", "open_question", "risk", "deadline", "stakeholder_preference", "acceptance_criteria".
- Prioritize information that is new, recently stated, or newly clarified in this source. Skip things that are only stale background the user already knows unless the source adds a fresh detail.
- Do not extract a knowledge item for something that is purely an action item / to-do — that belongs to a separate task extraction step, not here.
- Do not extract temporary chatter, status banter, scheduling noise, greetings, or passing comments with nothing worth remembering later.
- Do not invent facts or preferences. Every item must be grounded in what the source explicitly says.
- "content" must closely reflect what the source actually says. Do not add interpretation, implications, or conclusions beyond what is stated.
- Knowledge does not need to belong to a project. Never infer project ownership; only extract what the source states.
- If you are not sure an item is settled (e.g. still being debated, or phrased as a maybe), set "isUnclear" to true and lower "confidence" accordingly — but still extract it. Do not silently drop ambiguous information; flag it instead of discarding it.
- Every item must include at least one verbatim quote from the source as evidence. If you cannot find a supporting quote, do not emit the item.
- If project context is provided, use it only to understand terminology in the source. Do not extract knowledge from project context itself and do not use it to assign ownership.
- If the source contains nothing worth remembering, return an empty "items" array.
`,
  outputShape: `{
  "items": [
    {
      "type": "requirement" | "decision" | "open_question" | "risk" | "deadline" | "stakeholder_preference" | "acceptance_criteria",
      "title": string,
      "content": string,
      "isUnclear": boolean,
      "confidence": number,   // 0..1
      "evidence": [ { "quote": string } ]  // at least one verbatim quote
    }
  ]
}`,
});

export function buildKnowledgeExtractorUserPrompt(input: KnowledgeExtractorInput): string {
  return [
    input.project
      ? [
          "Project context (terminology only — not a source of knowledge, not for ownership):",
          wrapUntrustedContent("project context", JSON.stringify(input.project, null, 2)),
          "",
        ].join("\n")
      : null,
    wrapUntrustedContent(
      "source metadata",
      [
        `Source type: ${input.sourceType}`,
        `Source title: ${input.sourceTitle}`,
        `Source date: ${input.sourceDate}`,
      ].join("\n")
    ),
    "",
    "Extract the newest relevant learnings from the source content below.",
    "",
    wrapUntrustedContent("source content", input.sourceBody),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const knowledgeItemCandidateSchema = z.object({
  type: z.enum(KNOWLEDGE_ITEM_TYPES),
  title: z.string().min(1),
  content: z.string().min(1),
  isUnclear: z.boolean(),
  confidence: confidenceSchema,
  evidence: z.array(evidenceQuoteSchema).min(1),
});

export const knowledgeExtractionOutputSchema = z.object({
  items: z.array(knowledgeItemCandidateSchema),
});

export type KnowledgeItemCandidate = z.infer<typeof knowledgeItemCandidateSchema>;
export type KnowledgeExtractionOutput = z.infer<typeof knowledgeExtractionOutputSchema>;
