import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildTaskReflectUserPrompt,
  taskReflectOutputSchema,
  TASK_REFLECT_SYSTEM_PROMPT,
  type ReflectCandidateInput,
} from "@/lib/llm/prompts/factReflect";
import { candidateEvidenceVerified } from "@/lib/tasks/evidenceVerification";
import {
  applyReflectDecisions,
  keepAllReflectResult,
  type ReflectFilterResult,
} from "@/lib/tasks/reflectDecisions";

export interface ReflectableCandidate {
  title: string;
  reason: string;
  nextAction: string;
  evidence: { quote: string }[];
}

export type { ReflectFilterResult };

/**
 * WL-07 stage 2: a cheap, narrow noise-filter over candidates the (separate)
 * extraction stage already produced. Fails open by design — any error here
 * keeps every candidate, so a reflect-stage failure can only ever make
 * extraction behave exactly as it did before this stage existed, never
 * worse. Deterministic evidence verification (stage-boundary fact) is
 * always computed, even when the LLM call itself is skipped/fails.
 */
export async function reflectOnExtractedTasks(input: {
  sourceBody: string;
  candidates: ReflectableCandidate[];
  existingOpenTaskTitles: string[];
}): Promise<ReflectFilterResult> {
  if (input.candidates.length === 0) return keepAllReflectResult(0);

  const reflectInputs: ReflectCandidateInput[] = input.candidates.map((candidate, index) => {
    const evidenceQuotes = candidate.evidence.map((item) => item.quote);
    return {
      index,
      title: candidate.title,
      reason: candidate.reason,
      nextAction: candidate.nextAction,
      evidenceQuotes,
      evidenceVerified: candidateEvidenceVerified(evidenceQuotes, input.sourceBody),
    };
  });

  const result = await runLlmJob({
    jobType: "task_reflect",
    systemPrompt: TASK_REFLECT_SYSTEM_PROMPT,
    userPrompt: buildTaskReflectUserPrompt({
      sourceBody: input.sourceBody,
      candidates: reflectInputs,
      existingOpenTaskTitles: input.existingOpenTaskTitles,
    }),
    schema: taskReflectOutputSchema,
  });

  if (!result.ok) return keepAllReflectResult(input.candidates.length);

  return applyReflectDecisions(input.candidates.length, result.data.decisions);
}
