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
  /** Comments pinned to the reviewed frame, oldest first. */
  figmaCommentThread: {
    author: string | null;
    postedAt: string;
    isReply: boolean;
    message: string;
  }[];
}

export const DELIVERY_SYNC_REVIEW_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the UX delivery sync reviewer for a local-first daily work operator. You compare what should be delivered (requirements + done criteria) against GitHub branch implementation evidence and Figma canvas evidence. You judge UX completeness only — not backend plumbing unless it visibly affects the user experience.`,
  jobInstructions: `
- Read the task's done criteria and evidence as the requirement baseline. Resolve conflicts using: Confluence/PRD baseline → Jira operational state → meeting transcript action instructions. The newest explicit instruction wins; a direct Matt Pettit (Product Manager) or Lucas Saeed (Design Team Lead) instruction outranks conflicting non-stakeholder wording. Ignore requirement evidence more than 5 days older than the newest task evidence.
- GitHub branch evidence shows which UX files changed and a diff excerpt — treat this as the implemented UI snapshot (no literal screenshot). Judge whether the branch plausibly delivers the required screens, states, flows, and copy from a UX perspective.
- Figma frame evidence (layer tree, design context, screenshot notes, and an attached screenshot when available) shows what was transferred to the design canvas. Inspect the visual image as well as the structure. Judge whether each required screen, state, component, interaction cue, and piece of copy is visibly present and matches the latest requirements.
- The Figma comment thread on the frame is the live review conversation, ordered oldest to newest. The newest comment is the current state of that conversation and outranks older comments in the same thread: an outcome that was a gap earlier may already be answered further down.
- An outcome worded as someone confirming, approving, or signing off (e.g. "Lucas confirms …") is satisfied only by that person's own comment stating approval — mark it ok and quote them. A reply from the task owner claiming the change was made is delivery evidence for the change itself, but never a substitute for the reviewer's approval.
- A comment claiming a change is done still needs the canvas or branch to back it up. When the newest comments say it is done but the frame evidence still shows the old state, put it in conflicts and say which side looks stale.
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

/**
 * Per-section budgets, in characters and list entries.
 *
 * Every input here grows on its own: project knowledge accumulates each sync, a
 * design file's layer tree can be enormous, an active repo has dozens of open
 * PRs. Unbounded, the prompt eventually exceeds every model's context and the
 * review fails outright — the task then silently keeps its outcomes unchecked.
 * Trimming a section is always better than not reviewing at all.
 */
const BUDGET = {
  /** Serialized size ceiling per section. */
  section: {
    taskEvidence: 6_000,
    linkedKnowledge: 6_000,
    githubRepoActivity: 3_000,
    gitBranchEvidence: 10_000,
    figmaCommentThread: 5_000,
  },
  taskEvidenceChars: 600,
  knowledgeChars: 800,
  commits: 10,
  changedFiles: 40,
  diffSummaryChars: 1_500,
  uiDiffChars: 5_000,
  gitStatusChars: 1_500,
  figmaMetadataChars: 3_000,
  figmaContextChars: 12_000,
  commentChars: 800,
} as const;

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[truncated: ${max} of ${text.length} characters shown — treat what is missing here as unknown, not as absent from the artifact]`;
}

function clampOptional(text: string | null, max: number): string | null {
  return text == null ? null : clamp(text, max);
}

/**
 * Drops whole entries until the section serializes within its budget. `keep`
 * decides which end survives: a comment thread is read oldest-first, so its
 * newest entries — the current state of the conversation — must be the ones kept.
 */
function fitList<T>(items: T[], maxChars: number, keep: "head" | "tail"): T[] {
  let kept = items;
  while (kept.length > 1 && JSON.stringify(kept, null, 2).length > maxChars) {
    kept = keep === "head" ? kept.slice(0, -1) : kept.slice(1);
  }
  return kept;
}

function applyBudget(input: DeliverySyncReviewInput): DeliverySyncReviewInput {
  return {
    ...input,
    taskEvidence: fitList(
      input.taskEvidence.map((item) => ({
        ...item,
        quote: clampOptional(item.quote, BUDGET.taskEvidenceChars),
        summary: clamp(item.summary, BUDGET.taskEvidenceChars),
      })),
      BUDGET.section.taskEvidence,
      "head"
    ),
    linkedKnowledge: fitList(
      input.linkedKnowledge.map((item) => ({
        ...item,
        content: clamp(item.content, BUDGET.knowledgeChars),
      })),
      BUDGET.section.linkedKnowledge,
      "head"
    ),
    githubRepoActivity: input.githubRepoActivity
      ? {
          ...input.githubRepoActivity,
          openPullRequests: fitList(
            input.githubRepoActivity.openPullRequests,
            BUDGET.section.githubRepoActivity / 2,
            "head"
          ),
          recentCommits: fitList(
            input.githubRepoActivity.recentCommits.slice(0, BUDGET.commits),
            BUDGET.section.githubRepoActivity / 2,
            "head"
          ),
        }
      : null,
    gitBranchEvidence: fitList(
      input.gitBranchEvidence.map((evidence) => ({
        ...evidence,
        latestCommits: evidence.latestCommits.slice(0, BUDGET.commits),
        diffSummary: clamp(evidence.diffSummary, BUDGET.diffSummaryChars),
        uiChangedFiles: evidence.uiChangedFiles.slice(0, BUDGET.changedFiles),
        uiDiffExcerpt: clamp(evidence.uiDiffExcerpt, BUDGET.uiDiffChars),
      })),
      BUDGET.section.gitBranchEvidence,
      "head"
    ),
    localGitEvidence: input.localGitEvidence
      ? {
          ...input.localGitEvidence,
          status: clamp(input.localGitEvidence.status, BUDGET.gitStatusChars),
          changedFiles: input.localGitEvidence.changedFiles.slice(0, BUDGET.changedFiles),
          diffSummary: clamp(input.localGitEvidence.diffSummary, BUDGET.diffSummaryChars),
          latestCommits: input.localGitEvidence.latestCommits.slice(0, BUDGET.commits),
        }
      : null,
    figmaEvidence: input.figmaEvidence
      ? {
          ...input.figmaEvidence,
          metadata: clamp(input.figmaEvidence.metadata, BUDGET.figmaMetadataChars),
          designContext: clamp(input.figmaEvidence.designContext, BUDGET.figmaContextChars),
        }
      : null,
    figmaCommentThread: fitList(
      input.figmaCommentThread.map((comment) => ({
        ...comment,
        message: clamp(comment.message, BUDGET.commentChars),
      })),
      BUDGET.section.figmaCommentThread,
      "tail"
    ),
  };
}

export function buildDeliverySyncReviewUserPrompt(raw: DeliverySyncReviewInput): string {
  const input = applyBudget(raw);
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
    input.figmaCommentThread.length > 0
      ? [
          "Figma comment thread on this frame (oldest first — the last entry is the newest state):",
          wrapUntrustedContent(
            "figma comment thread",
            JSON.stringify(input.figmaCommentThread, null, 2)
          ),
          "",
        ].join("\n")
      : "Figma comment thread on this frame: (no imported comments)\n",
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
