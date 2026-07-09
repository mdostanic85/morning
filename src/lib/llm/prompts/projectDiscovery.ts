import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, evidenceQuoteSchema, wrapUntrustedContent } from "./shared";
import { z } from "zod";

export const JOB_TYPE: JobType = "project_discovery";

export interface ProjectDiscoverySignal {
  source: string;
  kind: string;
  label: string;
  detail?: string;
}

export interface ExistingProjectSnapshot {
  id: number;
  name: string;
  description: string | null;
  keywords: string[];
  people: string[];
  jiraKeys: string[];
  confluenceSpaces: string[];
  githubRepositories: string[];
}

export interface ProjectDiscoveryInput {
  signals: ProjectDiscoverySignal[];
  existingProjects: ExistingProjectSnapshot[];
  connectedProviders: string[];
}

export const PROJECT_DISCOVERY_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You are the project discovery engine for a local-first daily work operator app. Given work signals from connected sources (Jira, Confluence, Gmail/Gemini notes, GitHub, Granola, etc.) and any existing projects, you infer the real project contexts this person is working on.`,
  jobInstructions: `
- Infer projects only when multiple signals or a strong single signal (e.g. a Jira project key, Confluence space, GitHub repo) point to the same work context.
- Each project must represent one coherent body of work — not a generic bucket like "Meetings" or "Email".
- "name" should be short and human-readable (how the person would say it: "Acme Mobile", "Design System", not "PROJ-123").
- Fill integration hints when evidenced: jiraKeys (e.g. "ACME"), confluenceSpaces (space keys), githubRepositories (owner/repo), keywords, people mentioned as stakeholders or owners.
- For "update" actions, set existingProjectId to an id from the existing projects list when the discovered project is clearly the same context (same name, same Jira key, same repo).
- For "create" actions, only when no existing project clearly matches.
- Never duplicate an existing project under a new name unless the signals show they are genuinely different contexts.
- "evidence" must quote verbatim text from the signals (titles, labels, issue keys, repo names).
- If signals are too thin to infer a project with confidence >= 0.7, return an empty projects array.
- Prefer fewer, higher-confidence projects over many weak guesses.
`,
  outputShape: `{
  "projects": [
    {
      "action": "create" | "update",
      "existingProjectId": number | null,
      "name": string,
      "description": string,
      "keywords": string[],
      "people": string[],
      "jiraKeys": string[],
      "confluenceSpaces": string[],
      "githubRepositories": string[],
      "confidence": number,
      "reason": string,
      "evidence": [ { "quote": string } ]
    }
  ]
}`,
});

export function buildProjectDiscoveryUserPrompt(input: ProjectDiscoveryInput): string {
  return [
    `Connected providers: ${input.connectedProviders.join(", ") || "none"}`,
    "",
    "Existing projects:",
    wrapUntrustedContent(
      "existing projects",
      JSON.stringify(input.existingProjects, null, 2)
    ),
    "",
    "Work signals gathered from connectors and recent imports:",
    wrapUntrustedContent("project signals", JSON.stringify(input.signals, null, 2)),
  ].join("\n");
}

const discoveredProjectSchema = z.object({
  action: z.enum(["create", "update"]),
  existingProjectId: z.number().int().nullable(),
  name: z.string().min(1),
  description: z.string(),
  keywords: z.array(z.string()),
  people: z.array(z.string()),
  jiraKeys: z.array(z.string()),
  confluenceSpaces: z.array(z.string()),
  githubRepositories: z.array(z.string()),
  confidence: confidenceSchema,
  reason: z.string().min(1),
  evidence: z.array(evidenceQuoteSchema).min(1),
});

export const projectDiscoveryOutputSchema = z
  .object({
    projects: z.array(discoveredProjectSchema),
  })
  .superRefine((val, ctx) => {
    for (const [index, project] of val.projects.entries()) {
      if (project.action === "update" && project.existingProjectId === null) {
        ctx.addIssue({
          code: "custom",
          message: "existingProjectId is required for update actions.",
          path: ["projects", index, "existingProjectId"],
        });
      }
    }
  });

export type ProjectDiscoveryOutput = z.infer<typeof projectDiscoveryOutputSchema>;
