import { z } from "zod";
import type { JobType } from "../types";
import { buildStrictSystemPrompt, confidenceSchema, wrapUntrustedContent } from "./shared";

export const JOB_TYPE: JobType = "figma_frame_discovery";

export interface FigmaFrameDiscoveryInput {
  today: string;
  task: {
    title: string;
    reason: string;
    nextAction: string;
    doneCriteria: string[];
    evidence: {
      sourceTitle: string;
      sourceType: string;
      sourceDate: string;
      quote: string | null;
      summary: string;
      url: string | null;
    }[];
  };
  files: {
    fileKey: string;
    title: string;
    url: string;
    outline: string;
  }[];
}

export const FIGMA_FRAME_DISCOVERY_SYSTEM_PROMPT = buildStrictSystemPrompt({
  role: `You locate the exact Figma frame that corresponds to one work task. You receive the task's latest requirements and read-only outlines of candidate Figma files.`,
  jobInstructions: `
- Match the task to one specific frame, section, component, or page node only when names, visible copy, and structure provide concrete evidence that it is the artifact for this work.
- Treat requirements using this authority order: Confluence/PRD baseline, Jira operational state, then meeting transcripts for the current action. The newest dated explicit instruction wins; a direct Matt or Lucas transcript instruction outranks conflicting non-stakeholder wording.
- Ignore task evidence more than 5 days older than the newest evidence for that task.
- Return "matched": false when the outlines do not contain a defensible task-specific match. Never select a generic dashboard, cover page, or similarly named node just to produce an answer.
- When matched, copy fileKey and nodeId exactly from the supplied candidate outline. Never invent or normalize an id yourself.
- "reason" must name the concrete task wording and the matching frame name/copy that justified the selection.
`,
  outputShape: `{
  "matched": boolean,
  "fileKey": string | null,
  "nodeId": string | null,
  "reason": string,
  "confidence": number
}`,
});

export function buildFigmaFrameDiscoveryUserPrompt(input: FigmaFrameDiscoveryInput): string {
  return [
    `Today: ${input.today}`,
    "",
    "Task and authoritative requirement evidence:",
    wrapUntrustedContent("task requirement", JSON.stringify(input.task, null, 2)),
    "",
    "Candidate Figma file outlines:",
    wrapUntrustedContent("figma candidates", JSON.stringify(input.files, null, 2)),
  ].join("\n");
}

export const figmaFrameDiscoveryOutputSchema = z
  .object({
    matched: z.boolean(),
    fileKey: z.string().min(1).nullable(),
    nodeId: z.string().min(1).nullable(),
    reason: z.string().min(1),
    confidence: confidenceSchema,
  })
  .superRefine((result, ctx) => {
    if (result.matched && (!result.fileKey || !result.nodeId)) {
      ctx.addIssue({
        code: "custom",
        message: "fileKey and nodeId are required when matched is true.",
        path: ["nodeId"],
      });
    }
  });

export type FigmaFrameDiscoveryOutput = z.infer<typeof figmaFrameDiscoveryOutputSchema>;
