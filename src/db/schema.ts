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

export const PROJECT_STATUSES = ["active", "inactive"] as const;

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  // "inactive" projects are hidden from the default Projects view but kept
  // around so the user can restore them later.
  status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
  // Free-form lists used to match incoming signals to this project.
  keywords: text("keywords", { mode: "json" }).notNull().$type<string[]>().default([]),
  people: text("people", { mode: "json" }).notNull().$type<string[]>().default([]),
  jiraKeys: text("jira_keys", { mode: "json" }).notNull().$type<string[]>().default([]),
  repoPaths: text("repo_paths", { mode: "json" }).notNull().$type<string[]>().default([]),
  githubRepositories: text("github_repositories", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  confluenceSpaces: text("confluence_spaces", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  confluencePageUrls: text("confluence_page_urls", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  discordChannels: text("discord_channels", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
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

export const REVIEW_STATUSES = ["pending", "approved"] as const;

export const workTasks = sqliteTable("work_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => projects.id),
  title: text("title").notNull(),
  status: text("status", { enum: WORK_TASK_STATUSES }).notNull(),
  // True once the user explicitly set the status (Start/Snooze/Waiting/Not
  // mine/Done). The priority planner must never overwrite a manual decision.
  statusManuallySet: integer("status_manually_set", { mode: "boolean" }).notNull().default(false),
  // "pending" tasks were extracted but not yet approved by the user — they
  // stay out of the Today queue until reviewed in the Inbox.
  reviewStatus: text("review_status", { enum: REVIEW_STATUSES }).notNull().default("approved"),
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
  figmaFrameUrl: text("figma_frame_url"),
  localRepoPath: text("local_repo_path"),
  githubRepo: text("github_repo"),
  workContext: text("work_context", { mode: "json" })
    .$type<import("@/domain/taskWorkContext").TaskWorkContextSnapshot | null>(),
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
  // "pending" items were extracted but not yet accepted by the user.
  reviewStatus: text("review_status", { enum: REVIEW_STATUSES }).notNull().default("approved"),
  // Verbatim quotes from the source that justify this item existing.
  evidenceQuotes: text("evidence_quotes", { mode: "json" }).notNull().$type<string[]>().default([]),
  ...createdAt,
});

export const KNOWLEDGE_EMBEDDING_ITEM_TYPES = ["source_item", "knowledge_item"] as const;

export const knowledgeEmbeddings = sqliteTable("knowledge_embeddings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemType: text("item_type", { enum: KNOWLEDGE_EMBEDDING_ITEM_TYPES }).notNull(),
  sourceItemId: integer("source_item_id").references(() => sourceItems.id),
  knowledgeItemId: integer("knowledge_item_id").references(() => knowledgeItems.id),
  projectId: integer("project_id").references(() => projects.id),
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: text("embedding", { mode: "json" }).notNull().$type<number[]>(),
  model: text("model").notNull(),
  sourceDate: text("source_date").notNull(),
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

export const syncReviewReports = sqliteTable("sync_review_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => workTasks.id),
  summary: text("summary").notNull(),
  ok: text("ok", { mode: "json" }).notNull().$type<string[]>().default([]),
  notOk: text("not_ok", { mode: "json" }).notNull().$type<string[]>().default([]),
  conflicts: text("conflicts", { mode: "json" }).notNull().$type<string[]>().default([]),
  githubBranch: text("github_branch"),
  figmaUrl: text("figma_url"),
  recommendedNextAction: text("recommended_next_action").notNull(),
  confidence: real("confidence"),
  ...createdAt,
});

export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  name: text("name"),
  ...createdAndUpdatedAt,
});

export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export const CONNECTION_AUTH_TYPES = ["oauth", "api_key", "pat", "mcp", "none"] as const;

export const connections = sqliteTable("connections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(),
  status: text("status", { enum: CONNECTION_STATUSES }).notNull().default("disconnected"),
  authType: text("auth_type", { enum: CONNECTION_AUTH_TYPES }).notNull(),
  scopes: text("scopes", { mode: "json" }).notNull().$type<string[]>().default([]),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  ...createdAndUpdatedAt,
});

export const dailyMemories = sqliteTable("daily_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  whatWorkedOn: text("what_worked_on", { mode: "json" }).notNull().$type<string[]>().default([]),
  completed: text("completed", { mode: "json" }).notNull().$type<string[]>().default([]),
  stillOpen: text("still_open", { mode: "json" }).notNull().$type<string[]>().default([]),
  waitingOn: text("waiting_on", { mode: "json" }).notNull().$type<string[]>().default([]),
  firstTomorrow: text("first_tomorrow"),
  risks: text("risks", { mode: "json" }).notNull().$type<string[]>().default([]),
  summary: text("summary").notNull(),
  confidence: real("confidence"),
  ...createdAt,
});
