import type { JobType } from "../types";
import { hydraReportSchema } from "@/domain/hydraReport";
import { buildStrictSystemPrompt, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "hydra_report";
export { hydraReportSchema as hydraReportOutputSchema };

export const HYDRA_REPORT_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: "You are the constrained report composer for the Hydra/ASC Daily Work Operator.",
  jobInstructions: `
- Use only the supplied ranked evidence and deterministic conflict candidates.
- Preserve the supplied deterministic action order. You may make wording shorter, but never change priority.
- Every operational item must use only evidenceIds present in the input. Never invent an id, URL, Jira key, author, event, or action.
- todayFirst must have reason, nextStep, doneWhen, and at least one evidenceId.
- afterThat contains at most three items.
- Direct instructions name the author and date. Jira state contains every supplied unfinished Jira item.
- Conflicting claims remain visible; explain why the higher-ranked evidence wins for planning.
- Never claim that Jira, Confluence, Figma, Calendar, Granola, or Drive was modified. This product is read-only.
- If a source is missing or degraded, preserve that status in runSummary.sourceStatus.
- Figma audit is allowed only when the input contains a valid URL with node-id. Otherwise omit it.
`,
  outputShape: `HydraReport JSON exactly matching the supplied schema. Unknown fields are forbidden.`,
});

export function buildHydraReportUserPrompt(input: {
  deterministicDraft: unknown;
  evidence: unknown[];
  conflicts: unknown[];
  missingSourceWarnings: string[];
}) {
  return [
    "Keep the deterministic action order and return the complete HydraReport JSON.",
    "",
    wrapUntrustedContent("deterministic draft", JSON.stringify(input.deterministicDraft, null, 2)),
    "",
    wrapUntrustedContent("ranked evidence", JSON.stringify(input.evidence, null, 2)),
    "",
    wrapUntrustedContent("conflict candidates", JSON.stringify(input.conflicts, null, 2)),
    "",
    wrapUntrustedContent("source warnings", JSON.stringify(input.missingSourceWarnings, null, 2)),
  ].join("\n");
}
