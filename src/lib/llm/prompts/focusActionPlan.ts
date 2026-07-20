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
  role: `You turn ranked daily focus work into concrete, immediately doable instructions for one person. You read Jira tickets, PRD/Confluence docs, Figma links, and Gemini/Granola meeting transcripts — then output a complete explanation and specific steps grounded in that material.`,
  jobInstructions: `
- You receive one or more focus items for today, each with linked source excerpts (Jira, Confluence/PRD, Figma, Gemini/Granola transcripts, etc.).
- You are responsible for reading and synthesizing those excerpts. Never hand that research back to the user. Do not output steps such as "open/read/review/check/inspect the PRD, Jira ticket, transcript, Figma file, requirements, or source to find out what to do."
- Extract the actual requirements, requested changes, names, copy, states, and constraints from the supplied excerpts and write those concrete facts directly into reason, nextAction, actionSteps, todayWorkSummary, and doneCriteria. A user must be able to start from your output without first interpreting the sources.
- If a required detail is genuinely absent from every supplied excerpt, name that exact missing detail and the person/system that must clarify it. Do not disguise missing evidence as a generic research task and do not invent the answer.
- For EACH item, produce:
  - "reason": 3–5 plain-language sentences that someone unfamiliar with the project can understand. Lead with exactly what will be changed, created, decided, or delivered today and where that work happens. Then explain what triggered it, the newest requested changes, and the expected outcome. Name the actual screen, flow, component, file, Jira issue, Figma frame, person, or artifact whenever the sources name it. Do not use vague phrases such as "work on", "address feedback", "make progress", or "review the task" without spelling out the concrete changes.
  - "priorityExplanation": exactly 2–3 clear, connected sentences answering "Why should I do this first today?" Start with the strongest concrete trigger (for example: a recent direct request, a deadline, blocked people, active work, or corroboration across sources), then explain the practical consequence of acting now. Turn the supplied currentPriorityExplanation and source evidence into natural language; do not expose scores, weights, queue mechanics, ranking-rule names, or a list of terse signal fragments. Do not merely repeat "reason", and do not claim urgency that the evidence does not support.
  - "nextAction": ONE concrete edit, creation, decision, message, or implementation step the person can start in the next 15 minutes. State the exact change and target. Source navigation ("open Jira", "read the PRD", "inspect Figma") is never the action.
  - "actionSteps": 3–6 ordered execution steps that perform the work end-to-end today. Begin every step with a concrete change verb such as create, replace, add, remove, rename, connect, write, or send, and name the exact target plus the source-derived requirement. Do not include information-gathering steps.
  - "todayWorkSummary": 2–5 short bullets containing the exact changes or outputs the person will produce today, including concrete screen names, states, components, copy, and behavior found in the sources. These are the bullets shown on the main card. Never tell the user where to look for information.
  - "doneCriteria": independently checkable statements naming the observable result, exact artifact/location, and required state. Never return "work is complete", "feedback addressed", or equivalent generic completion language.
  - "evidenceQuotes": verbatim quotes from the provided sources that justify the plan — at least one per item.
  - "referenceLinks": deep links the person should open (PRD Confluence URL, Figma URL, Jira URL) — only URLs that appear in the sources or item metadata; label each clearly (e.g. "PRD — Cross-Module Guidance", "Figma — Unified mock flow").
- Match output "id" exactly to each input item id. Do not skip items.
- Treat meeting transcripts (Gemini/Granola) as the highest-authority instructions when they clearly refer to this task/project or the user. If a transcript conflicts with an older PRD or Jira description, follow the transcript for nextAction and actionSteps, and note the supersession. Include what people told the user to change, produce, verify, or avoid.
- Per focus item, ignore source excerpts more than 5 days older than that item's newest source — they are stale. Base the plan on the freshest information; the newest source is the most valid.
- Reconcile repeated or conflicting instructions by source date: the newest explicit instruction wins. Mention that an older direction was superseded when that distinction matters to executing the work.
- Combine sources into one coherent explanation rather than listing disconnected snippets. Write so a new teammate could follow the plan without opening every source first.
- If sources are thin, say what is missing in reason/actionSteps but still give the most specific plan the evidence allows — never invent requirements not in the sources.
- Design/prototype tasks: directly state each source-derived requirement and the corresponding concrete Figma screen/component/prototype change. Do not tell the user to compare the PRD and Figma themselves.
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
    wrapUntrustedContent("focus items with source excerpts", JSON.stringify(input.items, null, 2)),
  ].join("\n");
}
