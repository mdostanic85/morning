import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "daily_memory";

export const DAILY_MEMORY_CHANGE_TYPES = [
  "created",
  "completed",
  "became_unclear",
  "status_changed",
] as const;
export type DailyMemoryChangeType = (typeof DAILY_MEMORY_CHANGE_TYPES)[number];

export interface DailyMemoryTaskChange {
  taskId: number;
  title: string;
  changeType: DailyMemoryChangeType;
  detail: string;
}

export interface DailyMemoryInput {
  /** ISO datetime of the last check-in, or null if this is the first one. */
  previousCheckIn: string | null;
  currentDateTime: string;
  changes: DailyMemoryTaskChange[];
}

export const DAILY_MEMORY_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the daily memory engine for a local-first daily work operator app. Given the list of task changes since the user's last check-in, you write a short briefing summarizing what changed.`,
  jobInstructions: `
- Summarize only the changes explicitly listed below — never mention a task, project, or event that is not present in the provided changes list.
- Write "summary" as a short, calm briefing paragraph (2–4 sentences), not a bulleted status report and not a to-do list.
- "highlights" must be the handful of changes most worth surfacing, each citing the exact "taskId" it refers to from the provided list — never a taskId that wasn't given.
- If you are unsure how to characterize a change, or the provided data is contradictory or incomplete, add a short note to "unclearPoints" instead of guessing at a confident interpretation.
- Preserve task titles and dates exactly as given in the changes list — do not shorten, rename, or reformat them.
- If the changes list is empty, say so plainly in "summary" (e.g. nothing changed since last time) rather than inventing activity.
`,
  outputShape: `{
  "summary": string,
  "highlights": [ { "taskId": number, "text": string } ],
  "unclearPoints": string[],
  "confidence": number   // 0..1
}`,
});

export function buildDailyMemoryUserPrompt(input: DailyMemoryInput): string {
  return [
    `Previous check-in: ${input.previousCheckIn ?? "none — this is the first check-in"}`,
    `Current date/time: ${input.currentDateTime}`,
    "",
    "Summarize the changes below.",
    "",
    wrapUntrustedContent("task changes", JSON.stringify(input.changes, null, 2)),
  ].join("\n");
}

export const dailyMemoryHighlightSchema = z.object({
  taskId: z.number().int(),
  text: z.string().min(1),
});

export const dailyMemoryOutputSchema = z.object({
  summary: z.string().min(1),
  highlights: z.array(dailyMemoryHighlightSchema),
  unclearPoints: z.array(z.string().min(1)),
  confidence: confidenceSchema,
});

export type DailyMemoryHighlight = z.infer<typeof dailyMemoryHighlightSchema>;
export type DailyMemoryOutput = z.infer<typeof dailyMemoryOutputSchema>;
