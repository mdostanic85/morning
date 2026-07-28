import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "delivery_sync_review";

export interface DeliverySyncReviewInput {
  taskTitle: string;
  taskReason: string;
  nextAction: string;
  doneCriteria: string[];
  taskEvidence: {
    quote: string | null;
    summary: string;
    sourceTitle: string | null;
    sourceDate: string;
  }[];
  linkedKnowledge: {
    type: string;
    title: string;
    content: string;
    confidence: number | null;
  }[];
  githubRepo: string | null;
  githubBranch: string | null;
  githubRepoActivity: {
    repository: string;
    defaultBranch: string | null;
    openPullRequests: {
      number: number;
      title: string;
      url: string;
      headRef: string;
      baseRef: string;
    }[];
    recentCommits: { sha: string; message: string; date: string | null }[];
    fetchError?: string;
  } | null;
  gitBranchEvidence: {
    repoPath: string;
    targetBranch: string;
    baseBranch: string | null;
    branchExists: boolean;
    latestCommits: { hash: string; date: string; subject: string }[];
    diffSummary: string;
    uiChangedFiles: string[];
    uiDiffExcerpt: string;
    visualNote: string;
    error?: string;
  }[];
  localGitEvidence: {
    repoPath: string;
    currentBranch: string | null;
    status: string;
    changedFiles: { path: string; status: string; staged: boolean }[];
    diffSummary: string;
    latestCommits: { hash: string; date: string; subject: string }[];
    error?: string;
  } | null;
  figmaEvidence: {
    frameUrl: string;
    fileKey: string;
    nodeId: string;
    metadata: string;
    designContext: string;
    screenshotNote: string | null;
    fetchError?: string;
  } | null;
}

export const DELIVERY_SYNC_REVIEW_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the UX delivery sync reviewer for a local-first daily work operator. You compare what should be delivered (requirements + done criteria) against GitHub branch implementation evidence and Figma canvas evidence. You judge UX completeness only — not backend plumbing unless it visibly affects the user experience.`,
  jobInstructions: `
- Read the task's done criteria and evidence as the requirement baseline. Resolve conflicts using: Confluence/PRD baseline → Jira operational state → meeting transcript action instructions. The newest explicit instruction wins; a direct Matt Pettit (Product Manager) or Lucas Saeed (Design Team Lead) instruction outranks conflicting non-stakeholder wording. Ignore requirement evidence more than 5 days older than the newest task evidence.
- GitHub branch evidence shows which UX files changed and a diff excerpt — treat this as the implemented UI snapshot (no literal screenshot). Judge whether the branch plausibly delivers the required screens, states, flows, and copy from a UX perspective.
- Figma frame evidence (layer tree, design context, screenshot notes, and an attached screenshot when available) shows what was transferred to the design canvas. Inspect the visual image as well as the structure. Judge whether each required screen, state, component, interaction cue, and piece of copy is visibly present and matches the latest requirements.
- Cross-compare GitHub vs Figma:
  - When both exist, note alignment (ok), gaps (notOk), and places they disagree (conflicts).
  - When they conflict, pick the source that better matches the latest requirements and say so in conflicts — do not blindly prefer code or design.
  - Valid outcome = whichever matches the most recent explicit requirements; call out when one artifact is stale.
- Walk every numbered done criterion (Outcome 1, Outcome 2, …). For each one, decide whether evidence shows it is done.
- "ok": one line per satisfied outcome. Start with "Outcome N:" then name what is done and where it was found (Figma frame/layer, branch file path, PR, or commit). Example: "Outcome 2: empty state illustration present on Figma frame Home / Empty".
- "notOk": one line per unsatisfied or unchecked outcome. Start with "Outcome N:" then name the exact gap.
- "conflicts": explicit disagreements between GitHub implementation and Figma canvas, or between artifacts and requirements. State which side seems current and why.
- "summary": 1–2 sentences describing overall sync health in plain language.
- "recommendedNextAction": one concrete next step to resolve the biggest gap or conflict.
- If Figma evidence failed to load, still review GitHub if present; put Figma-dependent gaps in notOk.
- If no branch exists or no Figma link, say what could not be checked in notOk — do not invent visual details.
- Be strict. Do not mark something ok without pointing to specific evidence from git, the Figma structure, or the attached screenshot. Never infer hidden interactions from a static image.
`,
  outputShape: `{
  "summary": string,
  "ok": string[],
  "notOk": string[],
  "conflicts": string[],
  "recommendedNextAction": string,
  "confidence": number
}`,
});

export function buildDeliverySyncReviewUserPrompt(input: DeliverySyncReviewInput): string {
  return [
    "Task to sync-review:",
    wrapUntrustedContent(
      "task record",
      [
        `Task: ${input.taskTitle}`,
        `Why it matters: ${input.taskReason}`,
        `Next action on record: ${input.nextAction}`,
        `Expected git branch: ${input.githubBranch ?? "(not specified)"}`,
        `GitHub repo: ${input.githubRepo ?? "(not specified)"}`,
        "Done criteria (check each Outcome N against delivery evidence):",
        ...input.doneCriteria.map((c, i) => `Outcome ${i + 1}: ${c}`),
      ].join("\n")
    ),
    "",
    "Task evidence on record:",
    wrapUntrustedContent("task evidence", JSON.stringify(input.taskEvidence, null, 2)),
    "",
    "Linked project knowledge:",
    wrapUntrustedContent("linked knowledge", JSON.stringify(input.linkedKnowledge, null, 2)),
    "",
    "GitHub repository activity (read-only):",
    wrapUntrustedContent("github repo activity", JSON.stringify(input.githubRepoActivity, null, 2)),
    "",
    "GitHub branch evidence (UX-focused, read-only):",
    wrapUntrustedContent("github branch evidence", JSON.stringify(input.gitBranchEvidence, null, 2)),
    "",
    "Local git snapshot (read-only):",
    wrapUntrustedContent("local git evidence", JSON.stringify(input.localGitEvidence, null, 2)),
    "",
    input.figmaEvidence
      ? [
          "Figma canvas evidence (read-only):",
          wrapUntrustedContent("figma frame evidence", JSON.stringify(input.figmaEvidence, null, 2)),
          "",
        ].join("\n")
      : "Figma canvas evidence: (no frame URL found or fetch skipped)\n",
  ].join("\n");
}

export const deliverySyncReviewOutputSchema = z.object({
  summary: z.string().min(1),
  ok: z.array(z.string().min(1)),
  notOk: z.array(z.string().min(1)),
  conflicts: z.array(z.string().min(1)),
  recommendedNextAction: z.string().min(1),
  confidence: confidenceSchema,
});

export type DeliverySyncReviewOutput = z.infer<typeof deliverySyncReviewOutputSchema>;
