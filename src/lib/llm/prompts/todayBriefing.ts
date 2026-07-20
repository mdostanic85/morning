import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, evidenceQuoteSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "today_briefing";

export interface TodayBriefingJiraItem {
  key: string;
  title: string;
  status: string;
  priority: string | null;
  url: string | null;
  updatedAt: string;
  excerpt: string;
}

export interface TodayBriefingKnowledgeItem {
  id: number;
  type: string;
  title: string;
  content: string;
  projectName: string | null;
  evidenceQuotes: string[];
}

export interface TodayBriefingSourceItem {
  id: number;
  sourceType: string;
  title: string;
  sourceDate: string;
  excerpt: string;
  projectName: string | null;
}

export interface TodayBriefingOpenTask {
  id: number;
  title: string;
  status: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  projectName: string | null;
  priorityScore: number | null;
  dueDate: string | null;
  waitingOn: string | null;
  jiraKey: string | null;
  jiraPriority: string | null;
}

export interface TodayBriefingInput {
  today: string;
  jiraPending: TodayBriefingJiraItem[];
  knowledge: TodayBriefingKnowledgeItem[];
  recentSources: TodayBriefingSourceItem[];
  openTasks: TodayBriefingOpenTask[];
  rankedFocusTitles: string[];
  projectNames: string[];
  connectedProviders: string[];
  previousDailyMemory: string | null;
}

const jiraBriefingItemSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  reason: z.string().min(1),
  nextAction: z.string().min(1),
  doneCriteria: z.array(z.string().min(1)).min(1),
  evidenceQuotes: z.array(evidenceQuoteSchema).min(1),
});

const knowledgeHighlightSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.string().min(1),
  evidenceQuotes: z.array(evidenceQuoteSchema).min(1),
});

export const todayBriefingContentSchema = z.object({
  summary: z.string().min(1),
  jiraPending: z.array(jiraBriefingItemSchema),
  knowledgeHighlights: z.array(knowledgeHighlightSchema),
  waitingOn: z.array(z.string()),
  risks: z.array(z.string()),
});

const referenceLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

const focusItemSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  nextAction: z.string().min(1),
  actionSteps: z.array(z.string().min(1)).optional(),
  todayWorkSummary: z.array(z.string().min(1)).optional(),
  referenceLinks: z.array(referenceLinkSchema).optional(),
  doneCriteria: z.array(z.string().min(1)).min(1),
  evidenceQuotes: z.array(evidenceQuoteSchema).min(1),
  linkedTaskId: z.number().int().nullable(),
  linkedJiraKey: z.string().nullable(),
  priorityExplanation: z.string().min(1),
});

export const todayBriefingOutputSchema = todayBriefingContentSchema.extend({
  focusItems: z.array(focusItemSchema).max(5),
});

export const TODAY_BRIEFING_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the Today briefing engine for a local-first daily work operator app. You synthesize pending Jira work, connector knowledge, recent source signals, and the open task queue into one calm morning briefing.`,
  jobInstructions: `
- Write for one person starting their workday. Be direct and short — a briefing, not a dashboard essay.
- "summary" is 2–4 sentences about the single focus task for today. The ranked focus order is already decided — describe only that one priority, do not list a backlog.
- "jiraPending" must always be an empty array — Jira context is input only; the app surfaces one focus card, not a Jira dashboard.
- "knowledgeHighlights" is the user's personal news feed: pick the most important approved developments for them (deadlines, risks, decisions, requirements, direct feedback, or changes affecting their work) — max 5.
- Include important developments for the user even when they are unrelated to today's focus project or have no project assigned.
- Prefer distinct developments across sources/topics. Do not spend multiple highlights restating the same project update.
- Do not output focusItems — the app assigns focus order deterministically from Jira priority, due dates, queue status, and evidence recency.
- Do not invent Jira keys, task ids, or facts not in the inputs.
- "waitingOn" and "risks" are short bullet strings from evidenced signals only; empty arrays if none.
- If Jira pending is empty but other sources exist, focus on those. If everything is thin, say so honestly in summary.
`,
  outputShape: `{
  "summary": string,
  "jiraPending": [
    {
      "key": string,
      "title": string,
      "status": string,
      "reason": string,
      "nextAction": string,
      "doneCriteria": string[],
      "evidenceQuotes": [ { "quote": string } ]
    }
  ],
  "knowledgeHighlights": [
    {
      "title": string,
      "content": string,
      "type": string,
      "evidenceQuotes": [ { "quote": string } ]
    }
  ],
  "waitingOn": string[],
  "risks": string[]
}`,
});

export function buildTodayBriefingUserPrompt(input: TodayBriefingInput): string {
  return [
    `Today's date: ${input.today}`,
    `Projects: ${input.projectNames.join(", ") || "none"}`,
    `Connected providers: ${input.connectedProviders.join(", ") || "none"}`,
    `Deterministic focus order (do not change): ${input.rankedFocusTitles.join(" → ") || "none"}`,
    "",
    "Jira pending (assigned, not done):",
    wrapUntrustedContent("jira pending", JSON.stringify(input.jiraPending, null, 2)),
    "",
    "Approved knowledge:",
    wrapUntrustedContent("knowledge", JSON.stringify(input.knowledge, null, 2)),
    "",
    "Recent connector sources:",
    wrapUntrustedContent("recent sources", JSON.stringify(input.recentSources, null, 2)),
    "",
    "Open task queue:",
    wrapUntrustedContent("open tasks", JSON.stringify(input.openTasks, null, 2)),
    "",
    "Previous daily memory:",
    input.previousDailyMemory
      ? wrapUntrustedContent("previous daily memory", input.previousDailyMemory)
      : "(none)",
  ].join("\n");
}

export type TodayBriefingContent = z.infer<typeof todayBriefingContentSchema>;
export type TodayBriefingOutput = z.infer<typeof todayBriefingOutputSchema>;

export interface BriefingSourceUsed {
  id: number;
  sourceType: string;
  title: string;
  sourceDate: string;
  author?: string | null;
  projectName: string | null;
  url: string | null;
}

export interface StoredTodayBriefingJiraItem {
  key: string;
  title: string;
  status: string;
  assignee: string | null;
  reason: string;
  nextAction: string;
  actionSteps?: string[];
  referenceLinks?: { label: string; url: string }[];
  doneCriteria: string[];
  evidenceQuotes: { quote: string }[];
  url: string | null;
  priorityExplanation?: string;
}

export interface StoredTodayBriefing extends Omit<TodayBriefingOutput, "jiraPending"> {
  jiraPending: StoredTodayBriefingJiraItem[];
  generatedAt: string;
  today: string;
  inputHash?: string;
  jiraIssueCount: number;
  sourceCount: number;
  sourcesUsed: BriefingSourceUsed[];
  connectedProviders: string[];
}
