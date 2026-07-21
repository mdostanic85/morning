import { z } from "zod";

export const DAILY_BRIEF_SCHEMA_VERSION = 1;

const citedClaimSchema = z.object({
  text: z.string(),
  evidenceIds: z.array(z.number().int()),
  kind: z.enum(["fact", "recommendation", "unknown"]),
});

const dailyWorkItemSchema = z.object({
  title: z.string(),
  reason: z.string(),
  nextAction: z.string(),
  doneCriteria: z.array(z.string()).min(1),
  evidenceIds: z.array(z.number().int()),
  sourceLinks: z.array(
    z.object({
      label: z.string(),
      url: z.string().nullable(),
    })
  ),
  canonicalKey: z.string().nullable(),
  jiraKey: z.string().nullable(),
  taskId: z.number().int().nullable(),
  kind: z.enum(["fact", "recommendation", "unknown"]),
  statusHint: z.enum(["now", "next", "later", "waiting", "unclear"]).optional(),
});

export const dailyBriefV2Schema = z.object({
  schemaVersion: z.literal(DAILY_BRIEF_SCHEMA_VERSION),
  dayChange: citedClaimSchema.nullable(),
  todayFirst: dailyWorkItemSchema,
  afterThat: z.array(dailyWorkItemSchema).max(2),
  sourceConflicts: z.array(
    z.object({
      summary: z.string(),
      evidenceIds: z.array(z.number().int()),
    })
  ),
  todayMeetings: z.array(
    z.object({
      title: z.string(),
      startAt: z.string().nullable().optional(),
      questions: z.array(z.string()),
    })
  ),
  meetingPrep: z.array(
    z.object({
      meetingTitle: z.string(),
      questions: z.array(z.string()).max(5),
      relatedJiraKeys: z.array(z.string()),
      evidenceIds: z.array(z.number().int()),
    })
  ),
  blockedWaiting: z.array(
    z.object({
      title: z.string(),
      jiraKey: z.string().nullable(),
      reason: z.string(),
      evidenceIds: z.array(z.number().int()),
      // Nullable + defaulted so a brief cached before this field existed
      // still parses (see buildDailyBrief.ts's safeParse fallback).
      taskId: z.number().int().nullable().default(null),
    })
  ),
  reviewReadiness: z
    .object({
      verified: z.boolean(),
      checklist: z.array(z.string()),
      warning: z.string().nullable(),
      evidenceIds: z.array(z.number().int()),
    })
    .nullable(),
  knowledgeHighlights: z.array(citedClaimSchema),
  keySources: z.array(
    z.object({
      label: z.string(),
      url: z.string().nullable(),
      sourceType: z.string().nullable().optional(),
    })
  ),
  coverageWarnings: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    })
  ),
  generatedAt: z.string(),
  inputHash: z.string(),
  today: z.string(),
});

export type DailyBriefV2 = z.infer<typeof dailyBriefV2Schema>;
export type DailyWorkItem = z.infer<typeof dailyWorkItemSchema>;
export type CitedClaim = z.infer<typeof citedClaimSchema>;
