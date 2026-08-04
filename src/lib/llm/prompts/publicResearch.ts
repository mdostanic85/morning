import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "public_research";

/**
 * The one job that runs on the public/cheap provider (Gemini). Its input is
 * public reference material the user pasted on purpose — a changelog, a public
 * doc page, a vendor API description — never ingested source content, which
 * carries mailbox, transcript, and ticket data and stays on the other
 * providers.
 */
const ROLE = `You are a careful reader summarising a piece of public reference material (documentation, a changelog, a public product or API description) for a product designer who has to decide whether it affects their work. You report only what the text says.`;

const JOB_INSTRUCTIONS = `
- Write one short "summary" of what this material actually covers. No opinions about quality or relevance.
- List the "keyPoints" that a reader would need to know, each with a verbatim "quote" from the material that supports it. A point without a supporting quote does not belong in the list.
- If the user supplied a question, answer it through the key points and say plainly in "unclear" when the material does not answer it.
- Put anything the material leaves genuinely ambiguous or unanswered into "unclear" as a short phrase. Never resolve it with outside knowledge — you have none about this user, their company, or their tools.
- Never turn a key point into an instruction or a task. This job reports what a document says; deciding what to do about it is not your job.
- Return an empty "keyPoints" list rather than padding it when the material is too thin to support anything.
`.trim();

const OUTPUT_SHAPE = `{
  "summary": string,
  "keyPoints": [
    { "point": string, "quote": string, "confidence": number }
  ],
  "unclear": [string]
}`;

export const PUBLIC_RESEARCH_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: ROLE,
  jobInstructions: JOB_INSTRUCTIONS,
  outputShape: OUTPUT_SHAPE,
});

export function buildPublicResearchUserPrompt(input: {
  text: string;
  question?: string;
}): string {
  return [
    input.question
      ? `Question to answer from the material below: ${input.question}`
      : "No specific question — report what the material below covers.",
    "",
    "Public reference material:",
    wrapUntrustedContent("public material", input.text),
  ].join("\n");
}

export const publicResearchOutputSchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(
    z.object({
      point: z.string().min(1),
      quote: z.string().min(1),
      confidence: confidenceSchema,
    })
  ),
  unclear: z.array(z.string()),
});
export type PublicResearchOutput = z.infer<typeof publicResearchOutputSchema>;
