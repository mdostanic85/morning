import { z } from "zod";
import type { JobType } from "../types";
import {
  buildStrictSystemPrompt,
  confidenceSchema,
  evidenceQuoteSchema,
  wrapUntrustedContent,
} from "./shared";

export const JOB_TYPE: JobType = "focus_action_plan";

export interface FocusActionPlanSource {
  sourceType: string;
  title: string;
  sourceDate: string;
  url: string | null;
  excerpt: string;
}

export interface FocusActionPlanItemInput {
  id: string;
  title: string;
  jiraKey: string | null;
  jiraStatus: string | null;
  currentNextAction: string;
  currentReason: string;
  currentPriorityExplanation: string;
  sources: FocusActionPlanSource[];
}

export interface FocusActionPlanInput {
  today: string;
  items: FocusActionPlanItemInput[];
}

const planItemSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
  priorityExplanation: z.string().min(1),
  nextAction: z.string().min(1),
  actionSteps: z.array(z.string().min(1)).min(2).max(8),
  todayWorkSummary: z.array(z.string().min(1)).min(2).max(5),
  doneCriteria: z.array(z.string().min(1)).min(1),
  evidenceQuotes: z.array(evidenceQuoteSchema).min(1),
  referenceLinks: z.array(
    z.object({
      label: z.string().min(1),
      url: z.string().url(),
    })
  ),
  confidence: confidenceSchema,
});

export const focusActionPlanOutputSchema = z.object({
  items: z.array(planItemSchema).min(1),
});

export type FocusActionPlanOutput = z.infer<typeof focusActionPlanOutputSchema>;

export const FOCUS_ACTION_PLAN_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You turn ranked daily focus work into concrete instructions for one person. You read Jira tickets, PRD and Confluence documents, Figma links, and Gemini or Granola meeting transcripts, then produce a specific plan grounded in that material.`,
  jobInstructions: `
- You receive one or more focus items for today, each with linked source excerpts (Jira, Confluence/PRD, Figma, Gemini/Granola transcripts, etc.).
- You are responsible for reading and synthesizing those excerpts. Never hand that research back to the user. Do not output steps such as "open/read/review/check/inspect the PRD, Jira ticket, transcript, Figma file, requirements, or source to find out what to do."
- Extract the actual requirements, requested changes, names, copy, states, and constraints from the supplied excerpts and write those concrete facts directly into reason, nextAction, actionSteps, todayWorkSummary, and doneCriteria. A user must be able to start from your output without first interpreting the sources.
- If a required detail is genuinely absent from every supplied excerpt, name that exact missing detail and the person/system that must clarify it. Do not disguise missing evidence as a generic research task and do not invent the answer.
- For EACH item, produce:
  - "reason": 1–2 plain-language sentences that remind the person what changed or was requested. Name the concrete work product and the newest relevant trigger. Include who asked when the source names them. Do not use vague phrases such as "work on", "address feedback", "make progress", or "review the task". Do not restate the title.
  - "priorityExplanation": exactly 1 sentence answering "Why should I do this first today?" Use the strongest supported trigger and its practical consequence. Do not expose scores, weights, queue mechanics, or ranking-rule names. Do not repeat "reason" or claim unsupported urgency.
  - "nextAction": ONE concrete edit, creation, decision, message, or implementation step the person can start in the next 15 minutes. State the exact change and target. Source navigation ("open Jira", "read the PRD", "inspect Figma") is never the action.
  - "actionSteps": 3–6 ordered execution steps that perform the work end-to-end today. Begin every step with a concrete change verb such as create, replace, add, remove, rename, connect, write, or send, and name the exact target plus the source-derived requirement. Mine Granola/Gemini transcripts for the specific unfinished design/engineering asks (e.g. "Add Figma edge-case frames for SKUs with 18+ files", "Make the entire Content File Manager row clickable", "Left-justify the thumbnail beside the figure number"). Forbidden: outcome restatements ("the Jira issue has been reviewed"), generic closures ("any necessary actions have been taken"), and information-gathering steps.
  - "todayWorkSummary": 2–4 short bullets shown on the main Today card. Each bullet must name a concrete deliverable from the newest meeting or Jira comments: a screen, component, state, copy, count, or behavior. Never paraphrase doneCriteria. Never write "review the ticket" or "take necessary actions".
  - "doneCriteria": independently checkable statements naming the observable result, exact artifact/location, and required state. These are NOT shown as today's work bullets. Never return "work is complete", "feedback addressed", or equivalent generic completion language.
  - "evidenceQuotes": verbatim quotes from the provided sources that justify the plan — at least one per item.
  - "referenceLinks": deep links the person should open (PRD Confluence URL, Figma URL, Jira URL) — only URLs that appear in the sources or item metadata; label each clearly (e.g. "PRD — Cross-Module Guidance", "Figma — Unified mock flow").
- Match output "id" exactly to each input item id. Do not skip items.
- Treat meeting transcripts (Gemini/Granola) as the highest-authority instructions when they clearly refer to this task/project or the user. Prefer them when writing "reason": pull the newest discussion points, validations, and decisions into that reminder paragraph. If a transcript conflicts with an older PRD or Jira description, follow the transcript for nextAction and actionSteps, and note the supersession in reason. Include what people told the user to change, produce, verify, or avoid.
- Per focus item, ignore source excerpts more than 5 days older than that item's newest source — they are stale. Base the plan on the freshest information; the newest source is the most valid.
- Reconcile repeated or conflicting instructions by source date: the newest explicit instruction wins. Mention that an older direction was superseded when that distinction matters to executing the work.
- Combine sources into one coherent explanation rather than listing disconnected snippets. Write so a new teammate could follow the plan without opening every source first.
- If sources are thin, say what is missing in reason/actionSteps but still give the most specific plan the evidence allows — never invent requirements not in the sources.
- Design/prototype tasks: translate every transcript/PRD ask into a named Figma change (frame, component, state, interaction). Prefer unfinished asks from the newest meeting over restating the Jira summary. Do not tell the user to compare the PRD and Figma themselves.
- Reject any todayWorkSummary or actionSteps item that could apply to any ticket without the sources (e.g. "review the issue", "update as needed", "take necessary actions"). Rewrite it into the concrete unfinished work found in the excerpts, or omit it.
`,
  outputShape: `{
  "items": [
    {
      "id": string,
      "reason": string,
      "priorityExplanation": string,
      "nextAction": string,
      "actionSteps": string[],
      "todayWorkSummary": string[],
      "doneCriteria": string[],
      "evidenceQuotes": [ { "quote": string } ],
      "referenceLinks": [ { "label": string, "url": string } ],
      "confidence": number
    }
  ]
}`,
});

export function buildFocusActionPlanUserPrompt(input: FocusActionPlanInput): string {
  return [
    `Today: ${input.today}`,
    "",
    "Produce a concrete action plan for each focus item below.",
    "Priority: Granola/Gemini transcript asks beat older Jira summaries. The Today card bullets must list unfinished concrete work (Figma frames, components, states, counts, people to confirm) — not ticket-review boilerplate.",
    wrapUntrustedContent("focus items with source excerpts", JSON.stringify(input.items, null, 2)),
  ].join("\n");
}
