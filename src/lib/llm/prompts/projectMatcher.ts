import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, evidenceQuoteSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "project_matching";

export interface ProjectMatcherCandidate {
  id: number;
  name: string;
  description: string | null;
  keywords: string[];
  people: string[];
  jiraKeys: string[];
  repoPaths: string[];
  figmaFileKeys: string[];
}

export interface ProjectMatcherInput {
  sourceTitle: string;
  sourceType: string;
  sourceBody: string;
  candidateProjects: ProjectMatcherCandidate[];
}

export const PROJECT_MATCHER_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the project matching engine for a local-first daily work operator app. Given one source item and a fixed list of known projects, you decide which single project (if any) the source belongs to.`,
  jobInstructions: `
- You may only choose a project id that appears in the "Known projects" list provided below. Never invent a project.
- Only select a project if you can point to a specific overlap between the source content and that project's keywords, people, Jira keys, repo paths, or Figma file keys — an overlap that actually appears as a quotable phrase in the source.
- "matchedOn" must list the specific keyword/person/key values that matched (e.g. "acme", "Sara").
- "evidence" must contain at least one verbatim quote from the source content for every match you claim.
- If multiple projects seem plausible with similar strength, or no project has a clear, evidenced match, set "projectId" to null and "isUnclear" to true rather than picking the "most likely" one.
- "reason" must briefly explain your decision in terms of the evidence, not general impressions.
`,
  outputShape: `{
  "projectId": number | null,      // must be one of the given known project ids, or null
  "matchedOn": string[],           // keywords/people/keys that matched, empty if projectId is null
  "isUnclear": boolean,            // true whenever projectId is null
  "confidence": number,            // 0..1
  "reason": string,
  "evidence": [ { "quote": string } ]
}`,
});

export function buildProjectMatcherUserPrompt(input: ProjectMatcherInput): string {
  return [
    "Known projects (choose one of these ids, or null if none clearly match):",
    JSON.stringify(input.candidateProjects, null, 2),
    "",
    `Source type: ${input.sourceType}`,
    `Source title: ${input.sourceTitle}`,
    "",
    wrapUntrustedContent("source content", input.sourceBody),
  ].join("\n");
}

export const projectMatchOutputSchema = z
  .object({
    projectId: z.number().int().nullable(),
    matchedOn: z.array(z.string().min(1)),
    isUnclear: z.boolean(),
    confidence: confidenceSchema,
    reason: z.string().min(1),
    evidence: z.array(evidenceQuoteSchema),
  })
  .superRefine((val, ctx) => {
    if (val.projectId !== null && val.evidence.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "evidence is required when projectId is not null.",
        path: ["evidence"],
      });
    }
    if (val.projectId === null && !val.isUnclear) {
      ctx.addIssue({
        code: "custom",
        message: "isUnclear must be true when projectId is null.",
        path: ["isUnclear"],
      });
    }
  });

export type ProjectMatchOutput = z.infer<typeof projectMatchOutputSchema>;
