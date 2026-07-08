import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

const createdAt = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

const createdAndUpdatedAt = {
  ...createdAt,
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // Free-form lists used to match incoming signals to this project.
  keywords: text("keywords", { mode: "json" }).notNull().$type<string[]>().default([]),
  people: text("people", { mode: "json" }).notNull().$type<string[]>().default([]),
  jiraKeys: text("jira_keys", { mode: "json" }).notNull().$type<string[]>().default([]),
  repoPaths: text("repo_paths", { mode: "json" }).notNull().$type<string[]>().default([]),
  figmaFileKeys: text("figma_file_keys", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  ...createdAndUpdatedAt,
});

export const SOURCE_TYPES = [
  "manual_transcript",
  "gmail",
  "jira",
  "confluence",
  "granola",
  "github",
  "figma",
  "discord",
  "git",
] as const;

export const sourceItems = sqliteTable("source_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id),
  sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
  // The connector's own id for this item (email id, ticket key, commit sha, ...).
  sourceExternalId: text("source_external_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  author: text("author"),
  sourceDate: text("source_date").notNull(),
  url: text("url"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  ...createdAt,
});

export const WORK_TASK_STATUSES = [
  "now",
  "next",
  "later",
  "waiting",
  "tomorrow",
  "unclear",
  "done",
] as const;

export const workTasks = sqliteTable("work_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id),
  title: text("title").notNull(),
  status: text("status", { enum: WORK_TASK_STATUSES }).notNull(),
  // Higher sorts first within a status. Deterministic queue rules + LLM signal combined.
  priorityScore: real("priority_score"),
  // 0..1 — how confident the extraction/classification is in this task.
  confidence: real("confidence"),
  reason: text("reason").notNull(),
  nextAction: text("next_action").notNull(),
  doneCriteria: text("done_criteria", { mode: "json" }).notNull().$type<string[]>(),
  dueDate: text("due_date"),
  owner: text("owner"),
  waitingOn: text("waiting_on"),
  ...createdAndUpdatedAt,
});

export const evidence = sqliteTable("evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => workTasks.id),
  sourceItemId: integer("source_item_id")
    .notNull()
    .references(() => sourceItems.id),
  quote: text("quote"),
  summary: text("summary").notNull(),
  sourceDate: text("source_date").notNull(),
  url: text("url"),
});

export const KNOWLEDGE_ITEM_TYPES = [
  "requirement",
  "decision",
  "open_question",
  "risk",
  "deadline",
  "stakeholder_preference",
  "acceptance_criteria",
] as const;

export const knowledgeItems = sqliteTable("knowledge_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id),
  type: text("type", { enum: KNOWLEDGE_ITEM_TYPES }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceItemId: integer("source_item_id").references(() => sourceItems.id),
  confidence: real("confidence"),
  ...createdAt,
});

export const VERIFICATION_VERDICTS = [
  "done",
  "mostly_done",
  "missing_work",
  "cannot_verify",
] as const;

export const verificationReports = sqliteTable("verification_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => workTasks.id),
  verdict: text("verdict", { enum: VERIFICATION_VERDICTS }).notNull(),
  matches: text("matches", { mode: "json" }).notNull().$type<string[]>().default([]),
  missing: text("missing", { mode: "json" }).notNull().$type<string[]>().default([]),
  risks: text("risks", { mode: "json" }).notNull().$type<string[]>().default([]),
  recommendedNextAction: text("recommended_next_action").notNull(),
  confidence: real("confidence"),
  ...createdAt,
});

export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export const CONNECTION_AUTH_TYPES = ["oauth", "api_key", "pat", "none"] as const;

export const connections = sqliteTable("connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  status: text("status", { enum: CONNECTION_STATUSES }).notNull().default("disconnected"),
  authType: text("auth_type", { enum: CONNECTION_AUTH_TYPES }).notNull(),
  scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>().default([]),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  ...createdAndUpdatedAt,
});
