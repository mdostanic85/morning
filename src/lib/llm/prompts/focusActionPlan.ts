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
  sources: FocusActionPlanSource[];
}

export interface FocusActionPlanInput {
  today: string;
  items: FocusActionPlanItemInput[];
}

const planItemSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
  nextAction: z.string().min(1),
  actionSteps: z.array(z.string().min(1)).min(2).max(8),
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
  role: `You turn ranked daily focus work into concrete, immediately doable instructions for one person. You read Jira tickets, PRD/Confluence docs, Figma links, and meeting notes — then output specific steps grounded in that material.`,
  jobInstructions: `
- You receive one or more focus items for today, each with linked source excerpts (Jira, Confluence/PRD, Figma, etc.).
- For EACH item, produce:
  - "reason": 2–3 sentences — why this is today's work, citing specifics from the sources (ticket status, PRD scope, design intent).
  - "nextAction": ONE concrete step the person can start in the next 15 minutes — not "open Jira" or "review PRD" unless that truly is the only honest step. Prefer a deliverable micro-action (e.g. "In Figma, open the Unified file at the linked node and annotate gaps between the mocked flow and the PRD acceptance criteria").
  - "actionSteps": 3–6 ordered steps that walk through the work end-to-end today. Each step must be specific (name files, screens, artifacts, or Jira fields when sources mention them). When a PRD or Figma link is in the sources, steps MUST tell the person to use those artifacts and what to look for or produce there.
  - "doneCriteria": checkable statements for when today's slice of this work is truly done.
  - "evidenceQuotes": verbatim quotes from the provided sources that justify the plan — at least one per item.
  - "referenceLinks": deep links the person should open (PRD Confluence URL, Figma URL, Jira URL) — only URLs that appear in the sources or item metadata; label each clearly (e.g. "PRD — Cross-Module Guidance", "Figma — Unified mock flow").
- Match output "id" exactly to each input item id. Do not skip items.
- If sources are thin, say what is missing in reason/actionSteps but still give the most specific plan the evidence allows — never invent requirements not in the sources.
- Design/prototype tasks: steps should connect PRD requirements → Figma screens → concrete prototype updates or annotations → Jira comment/status update.
`,
  outputShape: `{
  "items": [
    {
      "id": string,
      "reason": string,
      "nextAction": string,
      "actionSteps": string[],
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
