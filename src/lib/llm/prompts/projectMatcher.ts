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
  githubRepositories: string[];
  confluenceSpaces: string[];
  confluencePageUrls: string[];
  discordChannels: string[];
  figmaFileKeys: string[];
  previousLinkedSources?: {
    title: string;
    sourceType: string;
    sourceDate: string;
    excerpt: string;
  }[];
}

export interface ProjectMatcherInput {
  sourceTitle: string;
  sourceType: string;
  sourceBody: string;
  candidateProjects: ProjectMatcherCandidate[];
}

export const PROJECT_MATCHER_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the project matching engine for a local-first daily work operator app. Given one source item or extracted task and a fixed list of known projects, you decide which single project (if any) the item belongs to.`,
  jobInstructions: `
- You may only choose a project id that appears in the "Known projects" list provided below. Never invent a project.
- Matching signals include project name, keywords, people, Jira keys, repo paths, GitHub repositories, Confluence spaces/page URLs, Discord channels, Figma file keys, the item title, the item body, and previous linked sources shown under each project.
- Only select a project if you can point to specific overlap between the item and that project's name, keywords, people, Jira keys, repo paths, GitHub repositories, Confluence spaces/page URLs, Discord channels, Figma file keys, or previous linked source history.
- "matchedOn" must list the specific project signal values that matched (e.g. "Acme Mobile", "Sara", "ACME-123", "apps/mobile", "Figma file key abc123").
- "evidence" must contain at least one verbatim quote from the source content for every match you claim.
- If multiple projects seem plausible with similar strength, or no project has a clear, evidenced match, set "projectId" to null and "isUnclear" to true rather than picking the "most likely" one.
- If your confidence is below 0.7, set "projectId" to null and "isUnclear" to true.
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
  // Candidate projects include excerpts of previously linked external sources,
  // and titles come from connectors — all of it is untrusted data.
  return [
    "Known projects (choose one of these ids, or null if none clearly match):",
    wrapUntrustedContent("candidate projects", JSON.stringify(input.candidateProjects, null, 2)),
    "",
    wrapUntrustedContent(
      "source metadata",
      [`Source type: ${input.sourceType}`, `Source title: ${input.sourceTitle}`].join("\n")
    ),
    "",
    wrapUntrustedContent(
      "source content",
      [`Title: ${input.sourceTitle}`, "", "Body:", input.sourceBody].join("\n")
    ),
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
