import { z } from "zod";

export const HYDRA_REPORT_SCHEMA_VERSION = "hydra-report-v1";

export const sourceStatusSchema = z.object({
  provider: z.string().min(1),
  status: z.enum(["connected", "degraded", "expired", "error", "not_connected"]),
  lastSuccessfulSyncAt: z.string().nullable().optional(),
  checkedAt: z.string(),
  latencyMs: z.number().nonnegative().optional(),
  imported: z.number().int().nonnegative().optional(),
  skipped: z.number().int().nonnegative().optional(),
  capabilities: z.record(z.string(), z.boolean()).default({}),
  warnings: z.array(z.string()).default([]),
}).strict();

export const citedActionItemSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  nextStep: z.string().min(1),
  doneWhen: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  sourceUrls: z.array(z.string().url()).default([]),
  jiraKey: z.string().nullable().optional(),
}).strict();

export const instructionSchema = z.object({
  instruction: z.string().min(1),
  author: z.string().min(1),
  occurredAt: z.string(),
  evidenceIds: z.array(z.string().min(1)).min(1),
  sourceUrl: z.string().url().nullable().optional(),
}).strict();

export const blockerSchema = z.object({
  title: z.string().min(1),
  waitingOn: z.string().min(1),
  question: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const jiraStateItemSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  outdated: z.boolean(),
  evidenceIds: z.array(z.string().min(1)).min(1),
  url: z.string().url().nullable().optional(),
}).strict();

export const sourceConflictSchema = z.object({
  title: z.string().min(1),
  winningInstruction: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(2),
}).strict();

export const figmaAuditSchema = z.object({
  status: z.enum(["green", "yellow", "red"]),
  preliminary: z.boolean(),
  nodeUrl: z.string().url(),
  summary: z.string().min(1),
  findings: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict();

export const hydraReportSchema = z.object({
  todayFirst: citedActionItemSchema,
  afterThat: z.array(citedActionItemSchema).max(3),
  directInstructions: z.array(instructionSchema),
  blockers: z.array(blockerSchema),
  jiraState: z.array(jiraStateItemSchema),
  conflicts: z.array(sourceConflictSchema),
  suggestedMessage: z.string().min(1).optional(),
  figmaAudit: figmaAuditSchema.optional(),
  runSummary: z.object({
    sourceStatus: z.array(sourceStatusSchema),
    evidenceCount: z.number().int().nonnegative(),
    generatedAt: z.string(),
    configVersion: z.number().int().positive(),
    promptVersion: z.string().min(1),
  }).strict(),
}).strict();

export type HydraReport = z.infer<typeof hydraReportSchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export type HydraActionItem = z.infer<typeof citedActionItemSchema>;

export const HYDRA_SOURCE_PRIORITY = [
  "direct_instruction_to_milos",
  "matt_or_lucas_instruction",
  "newer_meeting",
  "jira_comment_or_status",
  "prd_or_confluence",
] as const;

export const DEFAULT_HYDRA_CONFIG = {
  project: "Hydra/ASC",
  jiraProject: "UATL",
  assignee: "Milos Dostanic",
  timezone: "Europe/Belgrade",
  stakeholders: ["Matt Pettit", "Lucas Saeed"],
  sourcePriority: [...HYDRA_SOURCE_PRIORITY],
  reportSections: [
    "today_first",
    "after_that",
    "directly_told_to_you",
    "blocked",
    "jira_state",
    "source_conflicts",
    "suggested_message",
    "figma_audit",
  ],
  sourceRetentionDays: 90,
} as const;
