import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "daily_memory";

export interface DailyMemoryInput {
  today: string;
  completedTasks: { id: number; title: string; projectName: string | null; updatedAt: string }[];
  startedTasks: { id: number; title: string; projectName: string | null; updatedAt: string }[];
  openTasks: {
    id: number;
    title: string;
    status: string;
    projectName: string | null;
    reason: string;
    nextAction: string;
    waitingOn: string | null;
  }[];
  verificationReports: {
    taskId: number;
    verdict: string;
    recommendedNextAction: string;
    createdAt: string;
  }[];
  latestSourceItems: {
    title: string;
    sourceType: string;
    sourceDate: string;
    projectName: string | null;
  }[];
  gitEvidence: {
    projectName: string;
    repoPath: string;
    currentBranch: string | null;
    changedFiles: { path: string; status: string; staged: boolean }[];
    diffSummary: string;
    error?: string;
  }[];
}

export const DAILY_MEMORY_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the end-of-day memory engine for a local-first daily work operator app. You convert today's local task/source/git evidence into a concise memory for tomorrow.`,
  jobInstructions: `
- Summarize only evidence present in the provided data. Do not invent completed work or commitments.
- "whatWorkedOn" should include started tasks, active local git work, and meaningful source activity.
- "completed" should include only tasks explicitly marked done or verification reports that support completion.
- "stillOpen" should include unresolved open tasks worth remembering.
- "waitingOn" should include tasks that are blocked on another person/system.
- "firstTomorrow" should be one concrete task title the user can act on tomorrow morning. Prefer a high-priority open/next task. Never pick a waiting/blocked task — if the top item is blocked, pick the next actionable one. If nothing is clear, return null.
- "risks" should capture loose ends, unclear ownership, failed/cannot-verify reports, or risky git work-in-progress.
- Keep every list short and useful. This is a personal memory, not a dashboard.
`,
  outputShape: `{
  "summary": string,
  "whatWorkedOn": string[],
  "completed": string[],
  "stillOpen": string[],
  "waitingOn": string[],
  "firstTomorrow": string | null,
  "risks": string[],
  "confidence": number
}`,
});

export function buildDailyMemoryUserPrompt(input: DailyMemoryInput): string {
  return [
    `Date: ${input.today}`,
    "",
    "Create an end-of-day memory from the local evidence below.",
    "",
    wrapUntrustedContent("daily evidence", JSON.stringify(input, null, 2)),
  ].join("\n");
}

export const dailyMemoryOutputSchema = z.object({
  summary: z.string().min(1),
  whatWorkedOn: z.array(z.string().min(1)),
  completed: z.array(z.string().min(1)),
  stillOpen: z.array(z.string().min(1)),
  waitingOn: z.array(z.string().min(1)),
  firstTomorrow: z.string().min(1).nullable(),
  risks: z.array(z.string().min(1)),
  confidence: confidenceSchema,
});

export type DailyMemoryOutput = z.infer<typeof dailyMemoryOutputSchema>;
