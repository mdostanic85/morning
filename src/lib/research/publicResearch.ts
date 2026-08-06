import "server-only";
import {
  buildPublicResearchUserPrompt,
  publicResearchOutputSchema,
  type PublicResearchOutput,
} from "@/lib/llm/prompts/publicResearch";
import { runLlmJob } from "@/lib/llm/router";

/**
 * Reads a piece of public reference material — a changelog, a public doc page,
 * a vendor API description the user pasted in — and reports what it says, with
 * a verbatim quote behind every point.
 *
 * This is the public/cheap path (Gemini). Callers must only pass material the
 * user deliberately supplied. Ingested source content (email, transcripts,
 * tickets, Figma comments, knowledge items) belongs to the jobs on the other
 * providers and must never be routed here.
 */
export const MAX_PUBLIC_RESEARCH_CHARS = 20_000;

export type PublicResearchResult =
  | { ok: true; model: string; research: PublicResearchOutput }
  | { ok: false; error: string };

export async function researchPublicText(input: {
  text: string;
  question?: string;
}): Promise<PublicResearchResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "There is no material to read." };
  if (text.length > MAX_PUBLIC_RESEARCH_CHARS) {
    return {
      ok: false,
      error: `Material is ${text.length} characters. Split it into chunks of ${MAX_PUBLIC_RESEARCH_CHARS} or fewer.`,
    };
  }

  const result = await runLlmJob({
    jobType: "public_research",
    userPrompt: buildPublicResearchUserPrompt({ text, question: input.question?.trim() || undefined }),
    schema: publicResearchOutputSchema,
    temperature: 0.2,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, model: result.model, research: result.data };
}
