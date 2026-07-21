import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "task_reflect";

/**
 * WL-07 stage 2 of extraction: a deliberately narrow, cheap noise-filter
 * over candidates the (separate) task_extraction stage already produced.
 * It does not re-derive ownership, status, or facts — those stay owned by
 * the extraction stage and the deterministic merge logic downstream. Its
 * only decision is keep-vs-discard, informed by deterministic facts
 * (`evidenceVerified`) computed in code rather than re-asked of the model.
 */
const ROLE = `You are a cheap, narrow noise-filter for already-extracted candidate tasks from a local-first daily work operator app. You do not extract new tasks, change ownership, or change status — your only job is to decide, per candidate, whether it should survive as a real task or be discarded as noise.`;

const JOB_INSTRUCTIONS = `
- You are given a list of candidate tasks, each with an index, its own reason/nextAction, its evidence quotes, and a deterministic fact "evidenceVerified": whether at least one of its quotes was already confirmed (in code) to literally appear in the source text.
- Discard (keep: false) a candidate when:
  - "evidenceVerified" is false AND you cannot find at least a close paraphrase-level match for its evidence quotes in the source content below. A quote that failed the deterministic check purely due to minor formatting differences (whitespace, punctuation, capitalization) should still be kept.
  - The candidate is purely informational or already fully resolved and does not describe outstanding work.
  - The candidate is a near-exact duplicate of another candidate in this same batch describing the same underlying action — keep only the more specific/complete one, discard the rest.
  - The candidate restates something an existing open task (listed below) already fully captures, with no new fact, decision, or requirement.
- Otherwise, keep it (keep: true).
- When in doubt, keep it — this stage exists to catch clear noise, not to second-guess borderline judgment calls the extraction stage already made.
- Every decision must include a short "reason", grounded in the facts above — never a generic placeholder.
`.trim();

const OUTPUT_SHAPE = `{
  "decisions": [
    { "index": number, "keep": boolean, "reason": string }
  ]
}`;

export const TASK_REFLECT_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: ROLE,
  jobInstructions: JOB_INSTRUCTIONS,
  outputShape: OUTPUT_SHAPE,
});

export interface ReflectCandidateInput {
  index: number;
  title: string;
  reason: string;
  nextAction: string;
  evidenceQuotes: string[];
  /** Deterministic fact computed in code — see `evidenceVerification.ts`. */
  evidenceVerified: boolean;
}

export function buildTaskReflectUserPrompt(input: {
  sourceBody: string;
  candidates: ReflectCandidateInput[];
  existingOpenTaskTitles: string[];
}): string {
  return [
    "Candidates to review (evidenceVerified is a deterministic fact already computed for you — do not re-derive it):",
    wrapUntrustedContent("candidates", JSON.stringify(input.candidates, null, 2)),
    "",
    input.existingOpenTaskTitles.length > 0
      ? [
          "Existing open tasks already on the queue (for duplicate detection only — not a source of new facts):",
          wrapUntrustedContent(
            "existing open tasks",
            JSON.stringify(input.existingOpenTaskTitles, null, 2)
          ),
          "",
        ].join("\n")
      : null,
    "Original source content, only needed to verify quotes that failed the deterministic check:",
    wrapUntrustedContent("source content", input.sourceBody),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const taskReflectOutputSchema = z.object({
  decisions: z.array(
    z.object({
      index: z.number().int().min(0),
      keep: z.boolean(),
      reason: z.string().min(1),
    })
  ),
});
export type TaskReflectOutput = z.infer<typeof taskReflectOutputSchema>;
