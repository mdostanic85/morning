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
  /** WL-08: user-authored, scope-matched extraction constraints (e.g. "ignore GitHub CI noise"). */
  ingestionRules?: string[];
  existingTasks?: {
    id: number;
    title: string;
    reason: string;
    nextAction: string;
    doneCriteria: string[];
    status: string;
    jiraKey?: string | null;
  }[];
}

const ROLE = `You are the task extraction engine for a local-first daily work operator app. Your job is to read one raw source item (a transcript, email, ticket, or note) and extract the concrete candidate tasks a careful assistant would flag from it.`;

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
- "title" must fit on one desktop UI line: use 3–7 words and no more than 44 characters. Make it immediately clear by naming the concrete action and its object or intended result. Do not copy workflow labels or nested source headings such as "DESIGN -", "Task:", or "Review ticket". For Jira tasks, keep the Jira key once at the start, then use the shortest clear action phrasing (for example, "UATL-367 · Convert file manager to Canvas").
- "reason" must be 1–2 sentences: first state what triggered the task, then name what the user needs to deliver or decide. Include file, system, person, or location names when the source provides them. If sources disagree, state the winning understanding and briefly note that it replaced the earlier direction. Do not pad with vague filler.
- "nextAction" must be a single, concrete, immediately doable step — not a restatement of the title and not a vague instruction like "follow up". Every task must have one.
- "doneCriteria" must be an array of specific, independently checkable statements — never a single vague statement like "finish the work". Every task must have at least one.
- For transcript sources, fill "meetingContext" with a useful, detailed account of what matters for this task:
  - "overview": 2–4 sentences explaining the discussion and why it changes or clarifies the task.
  - "keyPoints": the concrete facts and constraints the user needs while doing the work.
  - "decisions": decisions that were explicitly made in the meeting.
  - "requestedChanges": specific changes, feedback, or follow-ups requested for this task.
  - "openQuestions": unresolved questions that still need confirmation.
  - "evidenceQuotes": short verbatim excerpts supporting the context. Do not include generic meeting discussion unrelated to this task.
  Use empty arrays when a category was not discussed. For non-transcript sources, use null.
- "owner", if the source names one, must be copied exactly as written. If no owner is named, use null — never infer or guess a name.
- "dueDate" must only be filled if the source states an explicit date or day; resolve relative dates (e.g. "Friday") against the given source date only if unambiguous, in ISO 8601 form, otherwise leave it null.
- Every task must include at least one verbatim quote from the source as evidence. If you cannot find a supporting quote for a candidate task, do not emit it at all — never invent a task that isn't backed by the source text.
- Source authority hierarchy for conflicts and wording of nextAction/doneCriteria/reason:
  1. Confluence space docs are baseline product context.
  2. Explicit PRD/Confluence page requirements are the requirements baseline.
  3. Jira is authoritative for ticket status, assignee, and mechanical fields.
  4. Meeting transcripts (Gemini Gmail/Drive notes, Granola, manual transcripts) carry action instructions. The newest dated source wins by default. A transcript still wins when Matt Pettit (Product Manager) or Lucas Saeed (Design Team Lead) explicitly gave the instruction, even against a newer non-stakeholder source.
  For any single task, ignore information more than 5 days older than the newest evidence for that task — it is stale and must not shape title, nextAction, doneCriteria, or reason. Within those 5 days, the newest information is the most valid.
- Action items spoken in a transcript ("please fix", "update", "ship", "change X") — especially from Matt Pettit or Lucas Saeed — are high-priority candidate tasks. Note supersession in reason when they override older PRD/Jira wording.
- If this source is a meeting transcript and something the user is expected to do was discussed, you MUST extract it as a task even when no Jira ticket or other written record exists for it. A spoken commitment in a meeting is sufficient evidence on its own — do not drop it just because it is not tracked elsewhere.
- Merge-first for transcripts (Granola / Gemini / meeting notes): prefer updating an existing open task over creating a parallel fragment.
  - If the source mentions a Jira key that matches an existing open task (title or jiraKey field), you MUST set "existingTaskId" to that task. Put the newest concrete next step for that ticket into nextAction/doneCriteria — do not invent a second "Review UATL-…" / "Finish remaining…" task beside it.
  - If the source does not name a key but clearly continues the user's only active now/next ticket on the same topic (same feature/area), set "existingTaskId" to that task.
  - Use null only for genuinely new work (different ticket, different owner, or a waiting item that is not the user's current ticket).
  - Small follow-ups that refine the same ticket (final screens, ping for review, handoff polish) belong on that existingTaskId, not as separate later tasks.
- You may receive existing open tasks. If a source changes, clarifies, or adds evidence to one of them, set "existingTaskId" to that task id. Never force a weak match merely because wording is similar when multiple active tasks compete.
- If project context is provided, use its people/keywords/description only to help you judge ownership and domain terminology — never as a source of tasks by itself; every task must still be evidenced in the source content, not in the project context.
- If ingestion rules are provided, they are user-authored preferences that scope or filter extraction for this specific source (e.g. "ignore GitHub CI status noise", "attribute repo X work to project Y"). Honor them when deciding what to extract and how to frame it. They can narrow or redirect extraction, but they can never override the universal rules above (no inventing facts, no skipping evidence grounding, no forcing a confident owner) — if a rule conflicts with those, follow the universal rules instead.
- If the source contains no actionable work, return an empty "tasks" array — do not invent content just to produce output.
`.trim();
}

const OUTPUT_SHAPE = `{
  "tasks": [
    {
      "title": string,
      "existingTaskId": number | null, // matching existing task, or null for new work
      "reason": string,               // why this matters, grounded in the source
      "nextAction": string,
      "doneCriteria": string[],       // at least one
      "doneCriteriaEvidence": [ { "criterion": string, "quote": string } ],
      "meetingContext": {
        "overview": string,
        "keyPoints": string[],
        "decisions": string[],
        "requestedChanges": string[],
        "openQuestions": string[],
        "evidenceQuotes": string[],
        "confidence": number
      } | null,
      "status": "actionable" | "waiting" | "unclear",
      "waitingOn": string | null,     // required when status is "waiting"
      "unclearReason": string | null, // required when status is "unclear"
      "owner": string | null,
      "dueDate": string | null,       // ISO 8601 date, or null
      "confidence": number,           // 0..1
      "evidence": [ { "quote": string } ]  // at least one verbatim quote
    }
  ]
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
    input.ingestionRules && input.ingestionRules.length > 0
      ? [
          "Ingestion rules for this source (user-authored extraction preferences — see job instructions for how to apply them):",
          wrapUntrustedContent(
            "ingestion rules",
            input.ingestionRules.map((rule) => `- ${rule}`).join("\n")
          ),
          "",
        ].join("\n")
      : null,
    input.existingTasks && input.existingTasks.length > 0
      ? [
          "Existing open tasks (merge transcript updates into these when the Jira key or only-active topic matches):",
          wrapUntrustedContent("existing tasks", JSON.stringify(input.existingTasks, null, 2)),
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
    title: z.string().min(1).max(44),
    existingTaskId: z.number().int().positive().nullable().default(null),
    reason: z.string().min(1),
    nextAction: z.string().min(1),
    doneCriteria: z.array(z.string().min(1)).min(1),
    doneCriteriaEvidence: z
      .array(
        z.object({
          criterion: z.string().min(1),
          quote: z.string().min(1),
        })
      )
      .default([]),
    meetingContext: z
      .object({
        overview: z.string().min(1),
        keyPoints: z.array(z.string().min(1)),
        decisions: z.array(z.string().min(1)),
        requestedChanges: z.array(z.string().min(1)),
        openQuestions: z.array(z.string().min(1)),
        evidenceQuotes: z.array(z.string().min(1)).min(1),
        confidence: confidenceSchema,
      })
      .nullable()
      .default(null),
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

export const taskExtractionOutputSchema = z.object({
  tasks: z.array(extractedTaskSchema),
});

export type ExtractedTask = z.infer<typeof extractedTaskSchema>;
export type TaskExtractionOutput = z.infer<typeof taskExtractionOutputSchema>;
