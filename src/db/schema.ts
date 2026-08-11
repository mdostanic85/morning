import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

const createdAndUpdatedAt = {
  ...createdAt,
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const PROJECT_STATUSES = ["active", "inactive"] as const;

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  people: jsonb("people").$type<string[]>().notNull().default([]),
  jiraKeys: jsonb("jira_keys").$type<string[]>().notNull().default([]),
  repoPaths: jsonb("repo_paths").$type<string[]>().notNull().default([]),
  githubRepositories: jsonb("github_repositories").$type<string[]>().notNull().default([]),
  confluenceSpaces: jsonb("confluence_spaces").$type<string[]>().notNull().default([]),
  confluencePageUrls: jsonb("confluence_page_urls").$type<string[]>().notNull().default([]),
  discordChannels: jsonb("discord_channels").$type<string[]>().notNull().default([]),
  figmaFileKeys: jsonb("figma_file_keys").$type<string[]>().notNull().default([]),
  ...createdAndUpdatedAt,
});

export const SOURCE_TYPES = [
  "manual_transcript",
  "gmail",
  "calendar",
  "drive",
  "jira",
  "confluence",
  "granola",
  "github",
  "figma",
  "discord",
  "git",
] as const;

export const sourceItems = pgTable("source_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
  sourceExternalId: text("source_external_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  author: text("author"),
  sourceDate: text("source_date").notNull(),
  url: text("url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  /** sha256 of (title, body, author, sourceDate, url) — real-change detection independent of the extraction-skip fingerprint (WL-03). */
  contentHash: text("content_hash"),
  ...createdAt,
  updatedAt: text("updated_at"),
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

export const OWNERSHIP_DECISIONS = ["confirmed_mine", "rejected_not_mine"] as const;
export type OwnershipDecision = (typeof OWNERSHIP_DECISIONS)[number];

export const CONFLICT_RESOLUTION_DECISIONS = [
  "keep_open",
  "mark_done_locally",
  "decide_later",
] as const;
export type ConflictResolutionDecision = (typeof CONFLICT_RESOLUTION_DECISIONS)[number];

export const workTasks = pgTable("work_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  title: text("title").notNull(),
  status: text("status", { enum: WORK_TASK_STATUSES }).notNull(),
  statusManuallySet: boolean("status_manually_set").notNull().default(false),
  reviewStatus: text("review_status", { enum: REVIEW_STATUSES }).notNull().default("approved"),
  priorityScore: doublePrecision("priority_score"),
  confidence: doublePrecision("confidence"),
  /** WL-05 decomposed confidence breakdown — the deterministic components that produced `confidence`. */
  confidenceComponents: jsonb("confidence_components")
    .$type<import("@/lib/tasks/confidenceModel").ConfidenceComponents | null>(),
  reason: text("reason").notNull(),
  nextAction: text("next_action").notNull(),
  doneCriteria: jsonb("done_criteria").$type<string[]>().notNull(),
  meetingContext: jsonb("meeting_context")
    .$type<import("@/domain/workTask").TaskMeetingContextEntry[]>()
    .notNull()
    .default([]),
  /** Critical overrides: newer meeting information that replaced task fields. */
  overrides: jsonb("overrides")
    .$type<import("@/lib/tasks/taskOverride").TaskOverrideRecord[]>()
    .notNull()
    .default([]),
  dueDate: text("due_date"),
  owner: text("owner"),
  waitingOn: text("waiting_on"),
  figmaFrameUrl: text("figma_frame_url"),
  localRepoPath: text("local_repo_path"),
  githubRepo: text("github_repo"),
  workContext: jsonb("work_context")
    .$type<import("@/domain/taskWorkContext").TaskWorkContextSnapshot | null>(),
  /** Stable identity e.g. jira:{site}:{KEY} — nullable until backfilled. */
  canonicalKey: text("canonical_key"),
  /** User-confirmed ownership — survives sync and must not be overwritten. */
  ownershipDecision: text("ownership_decision", { enum: OWNERSHIP_DECISIONS }),
  ...createdAndUpdatedAt,
});

export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
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

export const taskCriterionEvidence = pgTable(
  "task_criterion_evidence",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => workTasks.id),
    criterionItemId: text("criterion_item_id").notNull(),
    evidenceId: integer("evidence_id")
      .notNull()
      .references(() => evidence.id),
    ...createdAt,
  },
  (table) => [
    unique("task_criterion_evidence_unique").on(
      table.taskId,
      table.criterionItemId,
      table.evidenceId
    ),
  ]
);

export const taskConflictDecisions = pgTable(
  "task_conflict_decisions",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => workTasks.id),
    conflictKey: text("conflict_key").notNull(),
    summary: text("summary").notNull(),
    decision: text("decision", { enum: CONFLICT_RESOLUTION_DECISIONS }).notNull(),
    evidenceSourceItemIds: jsonb("evidence_source_item_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    ...createdAndUpdatedAt,
  },
  (table) => [unique("task_conflict_decisions_unique").on(table.taskId, table.conflictKey)]
);

export const KNOWLEDGE_ITEM_TYPES = [
  "requirement",
  "decision",
  "open_question",
  "risk",
  "deadline",
  "stakeholder_preference",
  "acceptance_criteria",
] as const;

export const knowledgeItems = pgTable("knowledge_items", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  type: text("type", { enum: KNOWLEDGE_ITEM_TYPES }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceItemId: integer("source_item_id").references(() => sourceItems.id),
  confidence: doublePrecision("confidence"),
  reviewStatus: text("review_status", { enum: REVIEW_STATUSES }).notNull().default("approved"),
  evidenceQuotes: jsonb("evidence_quotes").$type<string[]>().notNull().default([]),
  ...createdAt,
});

export const KNOWLEDGE_EMBEDDING_ITEM_TYPES = ["source_item", "knowledge_item"] as const;

export const knowledgeEmbeddings = pgTable("knowledge_embeddings", {
  id: serial("id").primaryKey(),
  itemType: text("item_type", { enum: KNOWLEDGE_EMBEDDING_ITEM_TYPES }).notNull(),
  sourceItemId: integer("source_item_id").references(() => sourceItems.id),
  knowledgeItemId: integer("knowledge_item_id").references(() => knowledgeItems.id),
  projectId: integer("project_id").references(() => projects.id),
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: jsonb("embedding").$type<number[]>().notNull(),
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

export const verificationReports = pgTable("verification_reports", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => workTasks.id),
  verdict: text("verdict", { enum: VERIFICATION_VERDICTS }).notNull(),
  matches: jsonb("matches").$type<string[]>().notNull().default([]),
  missing: jsonb("missing").$type<string[]>().notNull().default([]),
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  recommendedNextAction: text("recommended_next_action").notNull(),
  confidence: doublePrecision("confidence"),
  ...createdAt,
});

export const syncReviewReports = pgTable("sync_review_reports", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => workTasks.id),
  summary: text("summary").notNull(),
  ok: jsonb("ok").$type<string[]>().notNull().default([]),
  notOk: jsonb("not_ok").$type<string[]>().notNull().default([]),
  conflicts: jsonb("conflicts").$type<string[]>().notNull().default([]),
  githubBranch: text("github_branch"),
  figmaUrl: text("figma_url"),
  recommendedNextAction: text("recommended_next_action").notNull(),
  confidence: doublePrecision("confidence"),
  ...createdAt,
});

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  email: text("email").notNull(),
  name: text("name"),
  ...createdAndUpdatedAt,
});

export const CONNECTION_STATUSES = ["connected", "disconnected", "error"] as const;
export const CONNECTION_AUTH_TYPES = ["oauth", "api_key", "pat", "mcp", "none"] as const;

export const connections = pgTable(
  "connections",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => userProfiles.id),
    provider: text("provider").notNull(),
    status: text("status", { enum: CONNECTION_STATUSES }).notNull().default("disconnected"),
    authType: text("auth_type", { enum: CONNECTION_AUTH_TYPES }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...createdAndUpdatedAt,
  },
  (table) => [unique("connections_user_provider_unique").on(table.userId, table.provider)]
);

// Connector tokens, one encrypted row per provider. Kept out of `connections`
// so the table the UI reads can never accidentally carry a credential.
export const connectionSecrets = pgTable(
  "connection_secrets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => userProfiles.id),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    ...createdAndUpdatedAt,
  },
  (table) => [
    unique("connection_secrets_user_provider_unique").on(table.userId, table.provider),
  ]
);

/** One-time OAuth CSRF records. They are deliberately separate from credentials. */
export const oauthStates = pgTable("oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => userProfiles.id),
  provider: text("provider").notNull(),
  linkedProviders: jsonb("linked_providers").$type<string[]>().notNull().default([]),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const dailyMemories = pgTable("daily_memories", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  whatWorkedOn: jsonb("what_worked_on").$type<string[]>().notNull().default([]),
  completed: jsonb("completed").$type<string[]>().notNull().default([]),
  stillOpen: jsonb("still_open").$type<string[]>().notNull().default([]),
  waitingOn: jsonb("waiting_on").$type<string[]>().notNull().default([]),
  firstTomorrow: text("first_tomorrow"),
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  summary: text("summary").notNull(),
  confidence: doublePrecision("confidence"),
  ...createdAt,
});

export const REPORT_RUN_STATUSES = [
  "queued",
  "fetching_sources",
  "normalizing",
  "ranking",
  "generating",
  "validating",
  "delivering",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

export const REPORT_RUN_TYPES = ["morning", "evening", "manual"] as const;
export const SCHEDULE_TYPES = ["morning", "evening"] as const;

export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Personal workspace"),
  timezone: text("timezone").notNull().default("Europe/Belgrade"),
  ...createdAndUpdatedAt,
});

export const reportTasks = pgTable("report_tasks", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  projectId: integer("project_id").references(() => projects.id),
  name: text("name").notNull(),
  template: text("template").notNull().default("hydra_asc"),
  promptVersion: text("prompt_version").notNull().default("hydra-report-v1"),
  schemaVersion: text("schema_version").notNull().default("hydra-report-v1"),
  configVersion: integer("config_version").notNull().default(1),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  deliverySettings: jsonb("delivery_settings")
    .$type<{ inApp: boolean; email: boolean; push: boolean }>()
    .notNull()
    .default({ inApp: true, email: false, push: false }),
  active: boolean("active").notNull().default(true),
  ...createdAndUpdatedAt,
});

export const taskSchedules = pgTable("task_schedules", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id")
    .notNull()
    .references(() => reportTasks.id),
  type: text("type", { enum: SCHEDULE_TYPES }).notNull(),
  cron: text("cron").notNull(),
  hour: integer("hour").notNull(),
  minute: integer("minute").notNull(),
  timezone: text("timezone").notNull().default("Europe/Belgrade"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: text("last_run_at"),
  ...createdAndUpdatedAt,
});

export const syncCursors = pgTable("sync_cursors", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id")
    .notNull()
    .references(() => reportTasks.id),
  provider: text("provider").notNull(),
  cursor: text("cursor"),
  lastSuccessfulSyncAt: text("last_successful_sync_at"),
  ...createdAndUpdatedAt,
});

export const sourceDocuments = pgTable("source_documents", {
  id: serial("id").primaryKey(),
  sourceItemId: integer("source_item_id")
    .notNull()
    .references(() => sourceItems.id),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  version: text("version"),
  contentHash: text("content_hash").notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  fetchedAt: text("fetched_at").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...createdAndUpdatedAt,
});

export const reportRuns = pgTable(
  "report_runs",
  {
    id: serial("id").primaryKey(),
    reportTaskId: integer("report_task_id")
      .notNull()
      .references(() => reportTasks.id),
    runType: text("run_type", { enum: REPORT_RUN_TYPES }).notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: REPORT_RUN_STATUSES }).notNull().default("queued"),
    sourceHealth: jsonb("source_health")
      .$type<import("@/domain/hydraReport").SourceStatus[]>()
      .notNull()
      .default([]),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    timings: jsonb("timings").$type<Record<string, number>>().notNull().default({}),
    configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    evidenceCount: integer("evidence_count").notNull().default(0),
    modelProvider: text("model_provider"),
    modelName: text("model_name"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCost: doublePrecision("estimated_cost"),
    error: text("error"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    ...createdAt,
  },
  (table) => [unique("report_runs_idempotency_key_unique").on(table.idempotencyKey)]
);

export const hydraEvidenceItems = pgTable("hydra_evidence_items", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => reportRuns.id),
  sourceItemId: integer("source_item_id").references(() => sourceItems.id),
  source: text("source").notNull(),
  sourceType: text("source_type").notNull(),
  externalId: text("external_id").notNull(),
  version: text("version"),
  occurredAt: text("occurred_at").notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  fetchedAt: text("fetched_at").notNull(),
  author: text("author"),
  participants: jsonb("participants").$type<string[]>().notNull().default([]),
  title: text("title").notNull(),
  content: text("content").notNull(),
  url: text("url"),
  contentHash: text("content_hash").notNull(),
  score: doublePrecision("score").notNull().default(0),
  scoreReasons: jsonb("score_reasons").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...createdAt,
});

export const evidenceRelations = pgTable("evidence_relations", {
  id: serial("id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => reportRuns.id),
  fromEvidenceId: integer("from_evidence_id")
    .notNull()
    .references(() => hydraEvidenceItems.id),
  toEvidenceId: integer("to_evidence_id")
    .notNull()
    .references(() => hydraEvidenceItems.id),
  relation: text("relation").notNull(),
  reason: text("reason").notNull(),
  ...createdAt,
});

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => reportRuns.id),
    schemaVersion: text("schema_version").notNull(),
    structuredJson: jsonb("structured_json")
      .$type<import("@/domain/hydraReport").HydraReport>()
      .notNull(),
    renderedText: text("rendered_text").notNull(),
    citationCoverage: doublePrecision("citation_coverage").notNull(),
    ...createdAt,
  },
  (table) => [unique("reports_run_id_unique").on(table.runId)]
);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.id),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  providerResponse: text("provider_response"),
  lastAttemptAt: text("last_attempt_at"),
  ...createdAt,
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id),
  actor: text("actor").notNull().default("local-user"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...createdAt,
});

export const reportFeedback = pgTable("report_feedback", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => reports.id),
  section: text("section").notNull(),
  rating: text("rating").notNull(),
  note: text("note"),
  ...createdAt,
});

export const CONNECTION_CURSOR_SCOPE_TYPES = ["connection", "provider", "resource"] as const;
export const CONNECTION_CURSOR_VALUE_TYPES = [
  "updated_since",
  "page_token",
  "opaque",
] as const;

export const connectionCursors = pgTable(
  "connection_cursors",
  {
    id: serial("id").primaryKey(),
    connectionId: integer("connection_id")
      .notNull()
      .references(() => connections.id),
    provider: text("provider").notNull(),
    scopeType: text("scope_type", { enum: CONNECTION_CURSOR_SCOPE_TYPES }).notNull(),
    scopeKey: text("scope_key").notNull().default(""),
    cursorType: text("cursor_type").notNull(),
    cursorValueType: text("cursor_value_type", { enum: CONNECTION_CURSOR_VALUE_TYPES })
      .notNull()
      .default("updated_since"),
    cursorValue: text("cursor_value"),
    lastSeenUpdatedAt: text("last_seen_updated_at"),
    overlapDurationMs: integer("overlap_duration_ms").notNull().default(86_400_000),
    lastSuccessfulSyncAt: text("last_successful_sync_at"),
    ...createdAndUpdatedAt,
  },
  (table) => [
    unique("connection_cursors_scope_unique").on(
      table.connectionId,
      table.provider,
      table.scopeType,
      table.scopeKey,
      table.cursorType
    ),
  ]
);

export const SYNC_RUN_TRIGGERS = ["manual", "scheduled"] as const;
export const SYNC_RUN_MODES = ["full"] as const;
export const SYNC_RUN_STATUSES = [
  "running",
  "cancelling",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export const SYNC_PROVIDER_RUN_STATUSES = ["running", "completed", "failed", "cancelled"] as const;

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => userProfiles.id),
  trigger: text("trigger", { enum: SYNC_RUN_TRIGGERS }).notNull(),
  mode: text("mode", { enum: SYNC_RUN_MODES }).notNull(),
  status: text("status", { enum: SYNC_RUN_STATUSES }).notNull().default("running"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  cancelRequestedAt: text("cancel_requested_at"),
  errorSummary: text("error_summary"),
  /** JSON-serialized SyncWhatsNew payload for post-sync UI. */
  whatsNew: text("whats_new"),
  ...createdAndUpdatedAt,
});

export const TASK_PROGRESS_ITEM_TYPES = ["step", "done_criterion"] as const;

export const taskProgressState = pgTable(
  "task_progress_state",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => workTasks.id),
    planVersion: text("plan_version").notNull(),
    itemId: text("item_id").notNull(),
    itemType: text("item_type", { enum: TASK_PROGRESS_ITEM_TYPES }).notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: text("completed_at"),
    ...createdAndUpdatedAt,
  },
  (table) => [
    unique("task_progress_state_unique").on(
      table.taskId,
      table.planVersion,
      table.itemId,
      table.itemType
    ),
  ]
);

export const syncProviderRuns = pgTable("sync_provider_runs", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id")
    .notNull()
    .references(() => syncRuns.id),
  provider: text("provider").notNull(),
  status: text("status", { enum: SYNC_PROVIDER_RUN_STATUSES }).notNull().default("running"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  itemsFetched: integer("items_fetched").notNull().default(0),
  itemsCreated: integer("items_created").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  itemsUnchanged: integer("items_unchanged").notNull().default(0),
  itemsFailed: integer("items_failed").notNull().default(0),
  /** Persisted but failed task/knowledge/embedding interpretation (WL-01) — previously invisible to completion status. */
  itemsExtractionFailed: integer("items_extraction_failed").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
});

/**
 * WL-10 — durable person entities. `mergedIntoId` is set only by an
 * explicit, separate confirm action (`mergePersonInto` in
 * `services/people.ts`) — resolution never auto-merges two distinct-looking
 * people (see `personIdentity.ts`).
 */
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  mergedIntoId: integer("merged_into_id").references((): AnyPgColumn => people.id),
  ...createdAndUpdatedAt,
});

export const personAliases = pgTable("person_aliases", {
  id: serial("id").primaryKey(),
  personId: integer("person_id")
    .notNull()
    .references(() => people.id),
  alias: text("alias").notNull(),
  ...createdAt,
});

/**
 * WL-08 — user-authored, per-scope extraction steering ("ignore GitHub CI
 * noise", "attribute repo X to project Y"). Null `sourceType`/`projectId`
 * means "applies to all". Rule text is untrusted-adjacent (user-authored,
 * but still wrapped like any other prompt content) — see
 * `ingestionRuleMatch.ts` and `taskExtractor.ts`.
 */
export const ingestionRules = pgTable("ingestion_rules", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type", { enum: SOURCE_TYPES }),
  projectId: integer("project_id").references(() => projects.id),
  rule: text("rule").notNull(),
  active: boolean("active").notNull().default(true),
  ...createdAndUpdatedAt,
});

/**
 * Per-call audit trail for every `runLlmJob`/`runEmbeddingJob` invocation —
 * the measurement backbone that later accuracy work (confidence calibration,
 * extraction stability) compares against. Previously only `console.info`.
 */
export const llmTelemetry = pgTable("llm_telemetry", {
  id: serial("id").primaryKey(),
  jobType: text("job_type").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version"),
  inputHash: text("input_hash").notNull(),
  ok: boolean("ok").notNull(),
  errorKind: text("error_kind"),
  fallback: boolean("fallback").notNull().default(false),
  durationMs: integer("duration_ms").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  estimatedCostUsd: doublePrecision("estimated_cost_usd"),
  ...createdAt,
});

/** One DailyBriefV2 per calendar day — Sync my day write target. */
export const dailyBriefs = pgTable(
  "daily_briefs",
  {
    id: serial("id").primaryKey(),
    today: text("today").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    inputHash: text("input_hash").notNull(),
    structuredJson: jsonb("structured_json")
      .$type<import("@/domain/dailyBrief").DailyBriefV2>()
      .notNull(),
    modelProvider: text("model_provider"),
    modelName: text("model_name"),
    promptVersion: text("prompt_version"),
    validationOk: boolean("validation_ok").notNull().default(true),
    ...createdAndUpdatedAt,
  },
  (table) => [unique("daily_briefs_today_unique").on(table.today)]
);
