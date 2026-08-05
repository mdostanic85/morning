import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "daily_memory";

export interface DailyMemoryInput {
  today: string;
  userNotes: string | null;
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
- Summarize only evidence present in the provided data and the user's own notes. Do not invent completed work or commitments.
- When user notes are present, treat them as the user's first-person account of the day. Reconcile them with automated evidence — use notes for nuance, context, and work the system did not capture.
- Route user-note content to the right fields: active/finished work → whatWorkedOn; explicit completions → completed (only when the user says something is done or a task is marked done / verified); unresolved items → stillOpen; blockers → waitingOn; loose ends and concerns → risks; tomorrow intent → firstTomorrow when consistent with open tasks.
- If user notes conflict with task status (e.g. user says they finished something still open in the queue), reflect the work in whatWorkedOn and note the mismatch in stillOpen or risks — do not silently mark it completed.
- "whatWorkedOn" should include started tasks, active local git work, meaningful source activity, and relevant user-note work.
- "completed" should include tasks explicitly marked done, verification reports that support completion, or work the user explicitly states they finished today.
- "stillOpen" should include unresolved open tasks worth remembering.
- "waitingOn" should include tasks that are blocked on another person/system.
- "firstTomorrow" should be one concrete task title the user can act on at the start of the next workday. Prefer a high-priority open/next task. Never pick a waiting/blocked task — if the top item is blocked, pick the next actionable one. If nothing is clear, return null.
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
  const sections = [
    `Date: ${input.today}`,
    "",
    "Create an end-of-day memory from the local evidence below.",
  ];

  if (input.userNotes?.trim()) {
    sections.push(
      "",
      wrapUntrustedContent("user notes", input.userNotes.trim()),
      "",
      "Incorporate the user notes into the correct memory fields. They override gaps in automated evidence but must still be reconciled with task status and verification data."
    );
  }

  const { userNotes: _userNotes, ...automatedEvidence } = input;
  sections.push("", wrapUntrustedContent("daily evidence", JSON.stringify(automatedEvidence, null, 2)));

  return sections.join("\n");
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
