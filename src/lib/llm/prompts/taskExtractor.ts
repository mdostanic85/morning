import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, evidenceQuoteSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "task_extraction";

export interface TaskExtractorProjectContext {
  name: string;
  description: string | null;
  keywords: string[];
  people: string[];
}

export interface TaskExtractorInput {
  sourceTitle: string;
  sourceType: string;
  sourceDate: string;
  sourceAuthor?: string | null;
  sourceBody: string;
  /** Used only to help judge ownership/terminology — never a source of tasks by itself. */
  project?: TaskExtractorProjectContext | null;
}

const ROLE = `You are the task extraction engine for a local-first daily work operator app. Your job is to read one raw source item (a transcript, email, ticket, or note) and extract the concrete candidate tasks a careful assistant would flag from it, plus any supporting knowledge signals (decisions, open questions, risks, deadlines, acceptance criteria) worth remembering from the same source.`;

function ownershipRuleText(currentUserName?: string | null): string {
  if (currentUserName && currentUserName.trim()) {
    return `The user's name is "${currentUserName.trim()}". A task is only "actionable" if it is clearly ${currentUserName.trim()}'s own responsibility to act on. If the source names a different, specific person as the one who needs to act, ${currentUserName.trim()} is NOT the owner of that task.`;
  }
  return `The user's name was not provided to you. Treat any task whose owner is explicitly named as a specific person as NOT clearly the user's task. Only an unattributed first-person commitment (e.g. "I'll do X", "I will follow up") may be treated as the user's own task with full confidence.`;
}

function jobInstructions(currentUserName?: string | null): string {
  return `
- Only extract a task if the source text describes work that actually needs to happen: a request, a commitment, an open action item, or a blocker. Do not extract tasks for things that are already fully resolved, purely informational, or small talk.
- Classify each task's "status":
  - "actionable" — someone can act on it right now AND it is genuinely the user's own task (see ownership rule below).
  - "waiting" — it is blocked on another person, system, or event, OR the source indicates someone else already owns the next step and the user is only waiting to hear back. "waitingOn" is then required and must describe what/who it's waiting on, using only what the source actually says.
  - "unclear" — ownership is ambiguous, the requirement itself is too vague to act on, or you cannot tell whether this is really the user's responsibility at all. "unclearReason" is then required. Do not guess to avoid this path — it exists exactly so you don't have to guess.
- Ownership: ${ownershipRuleText(currentUserName)}
  - If a task's owner is named and is not clearly the user, lower "confidence" — it may not belong on the user's queue at all.
  - If it sounds like someone else is responsible for the actual work, set status to "waiting" (the user is expecting something back from them) or "unclear" (the user's role in it isn't clear) — never "actionable".
- Vagueness: if you cannot derive a specific, concrete "nextAction" and specific "doneCriteria" from the source, the task is too vague to act on — set status to "unclear" rather than inventing specificity that isn't in the source.
- "reason" must be 2–4 sentences that together give a complete picture for the user: (1) why this task is on their list and what triggered it, grounded in the source, (2) what specifically they need to deliver or decide, including file/system/person/location names when the source names them, (3) if multiple sources would disagree, state only the latest understanding and note that earlier sources were superseded. Do not pad with vague filler.
- "nextAction" must be a single, concrete, immediately doable step — not a restatement of the title and not a vague instruction like "follow up". Every task must have one.
- "doneCriteria" must be an array of specific, independently checkable statements — never a single vague statement like "finish the work". Every task must have at least one.
- "owner", if the source names one, must be copied exactly as written. If no owner is named, use null — never infer or guess a name.
- "dueDate" must only be filled if the source states an explicit date or day; resolve relative dates (e.g. "Friday") against the given source date only if unambiguous, in ISO 8601 form, otherwise leave it null.
- Every task must include at least one verbatim quote from the source as evidence. If you cannot find a supporting quote for a candidate task, do not emit it at all — never invent a task that isn't backed by the source text.
- When the same topic appears with conflicting instructions across quotes or sources, treat the most recent source date as authoritative for nextAction, doneCriteria, and reason. Do not blend incompatible instructions — reflect the latest stated requirement only.
- If project context is provided, use its people/keywords/description only to help you judge ownership and domain terminology — never as a source of tasks by itself; every task must still be evidenced in the source content, not in the project context.
- Alongside tasks, capture supporting knowledge signals from the same source into separate buckets: "decisions" already made, "openQuestions" still unresolved, "risks" that could derail the work, "deadlines" mentioned (with a "date" field filled in when resolvable, otherwise null), and "acceptanceCriteria" stated for any deliverable. Each entry in every bucket must also include at least one verbatim quote as evidence and its own confidence score. Leave a bucket as an empty array if the source has nothing of that kind — never invent entries to fill it.
- If the source contains no actionable work and no notable knowledge signals, return empty arrays for everything — do not invent content just to produce output.
`.trim();
}

const OUTPUT_SHAPE = `{
  "tasks": [
    {
      "title": string,
      "reason": string,               // why this matters, grounded in the source
      "nextAction": string,
      "doneCriteria": string[],       // at least one
      "status": "actionable" | "waiting" | "unclear",
      "waitingOn": string | null,     // required when status is "waiting"
      "unclearReason": string | null, // required when status is "unclear"
      "owner": string | null,
      "dueDate": string | null,       // ISO 8601 date, or null
      "confidence": number,           // 0..1
      "evidence": [ { "quote": string } ]  // at least one verbatim quote
    }
  ],
  "decisions": [ { "title": string, "content": string, "confidence": number, "evidence": [ { "quote": string } ] } ],
  "openQuestions": [ { "title": string, "content": string, "confidence": number, "evidence": [ { "quote": string } ] } ],
  "risks": [ { "title": string, "content": string, "confidence": number, "evidence": [ { "quote": string } ] } ],
  "deadlines": [ { "title": string, "content": string, "date": string | null, "confidence": number, "evidence": [ { "quote": string } ] } ],
  "acceptanceCriteria": [ { "title": string, "content": string, "confidence": number, "evidence": [ { "quote": string } ] } ]
}`;

/** The default system prompt, with no known user identity — used as the router's static fallback. */
export const TASK_EXTRACTOR_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: ROLE,
  jobInstructions: jobInstructions(null),
  outputShape: OUTPUT_SHAPE,
});

/** Builds a request-tailored system prompt that bakes in who "the user" is, so ownership judgments are grounded rather than guessed. */
export function buildTaskExtractorSystemPrompt(options?: { currentUserName?: string | null }): string {
  return buildStrictSystemPrompt({
    role: ROLE,
    jobInstructions: jobInstructions(options?.currentUserName ?? null),
    outputShape: OUTPUT_SHAPE,
  });
}

export function buildTaskExtractorUserPrompt(input: TaskExtractorInput): string {
  // Titles, authors and project hints originate from external sources or user
  // input, so they are wrapped as untrusted data alongside the body.
  const metadata = [
    `Source type: ${input.sourceType}`,
    `Source title: ${input.sourceTitle}`,
    `Source date: ${input.sourceDate}`,
    input.sourceAuthor ? `Source author: ${input.sourceAuthor}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return [
    input.project
      ? [
          "Project context (for judging ownership/terminology only — not a source of tasks by itself):",
          wrapUntrustedContent("project context", JSON.stringify(input.project, null, 2)),
          "",
        ].join("\n")
      : null,
    wrapUntrustedContent("source metadata", metadata),
    "",
    "Extract candidate tasks and supporting knowledge signals from the source content below.",
    "",
    wrapUntrustedContent("source content", input.sourceBody),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const extractedTaskSchema = z
  .object({
    title: z.string().min(1),
    reason: z.string().min(1),
    nextAction: z.string().min(1),
    doneCriteria: z.array(z.string().min(1)).min(1),
    status: z.enum(["actionable", "waiting", "unclear"]),
    waitingOn: z.string().min(1).nullable(),
    unclearReason: z.string().min(1).nullable(),
    owner: z.string().min(1).nullable(),
    dueDate: z.string().min(1).nullable(),
    confidence: confidenceSchema,
    evidence: z.array(evidenceQuoteSchema).min(1),
  })
  .superRefine((task, ctx) => {
    if (task.status === "waiting" && !task.waitingOn) {
      ctx.addIssue({
        code: "custom",
        message: "waitingOn is required when status is 'waiting'.",
        path: ["waitingOn"],
      });
    }
    if (task.status === "unclear" && !task.unclearReason) {
      ctx.addIssue({
        code: "custom",
        message: "unclearReason is required when status is 'unclear'.",
        path: ["unclearReason"],
      });
    }
  });

/** A supporting knowledge signal — decision, open question, risk, or acceptance criteria. */
export const insightSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  confidence: confidenceSchema,
  evidence: z.array(evidenceQuoteSchema).min(1),
});

export const deadlineInsightSchema = insightSchema.extend({
  date: z.string().min(1).nullable(),
});

export const taskExtractionOutputSchema = z.object({
  tasks: z.array(extractedTaskSchema),
  decisions: z.array(insightSchema).default([]),
  openQuestions: z.array(insightSchema).default([]),
  risks: z.array(insightSchema).default([]),
  deadlines: z.array(deadlineInsightSchema).default([]),
  acceptanceCriteria: z.array(insightSchema).default([]),
});

export type ExtractedTask = z.infer<typeof extractedTaskSchema>;
export type Insight = z.infer<typeof insightSchema>;
export type DeadlineInsight = z.infer<typeof deadlineInsightSchema>;
export type TaskExtractionOutput = z.infer<typeof taskExtractionOutputSchema>;
