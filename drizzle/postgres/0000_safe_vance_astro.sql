CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"actor" text DEFAULT 'local-user' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"auth_type" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"what_worked_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"still_open" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"waiting_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_tomorrow" text,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"confidence" double precision,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"source_item_id" integer NOT NULL,
	"quote" text,
	"summary" text NOT NULL,
	"source_date" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "evidence_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"from_evidence_id" integer NOT NULL,
	"to_evidence_id" integer NOT NULL,
	"relation" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hydra_evidence_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"source_item_id" integer,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text NOT NULL,
	"version" text,
	"occurred_at" text NOT NULL,
	"source_updated_at" text,
	"fetched_at" text NOT NULL,
	"author" text,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"url" text,
	"content_hash" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"score_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_type" text NOT NULL,
	"source_item_id" integer,
	"knowledge_item_id" integer,
	"project_id" integer,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding" jsonb NOT NULL,
	"model" text NOT NULL,
	"source_date" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_item_id" integer,
	"confidence" double precision,
	"review_status" text DEFAULT 'approved' NOT NULL,
	"evidence_quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_response" text,
	"last_attempt_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"jira_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repo_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_repositories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confluence_spaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confluence_page_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discord_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"figma_file_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"section" text NOT NULL,
	"rating" text NOT NULL,
	"note" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"run_type" text NOT NULL,
	"scheduled_for" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_health" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"model_provider" text,
	"model_name" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" double precision,
	"error" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "report_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "report_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"project_id" integer,
	"name" text NOT NULL,
	"template" text DEFAULT 'hydra_asc' NOT NULL,
	"prompt_version" text DEFAULT 'hydra-report-v1' NOT NULL,
	"schema_version" text DEFAULT 'hydra-report-v1' NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_settings" jsonb DEFAULT '{"inApp":true,"email":false,"push":false}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"schema_version" text NOT NULL,
	"structured_json" jsonb NOT NULL,
	"rendered_text" text NOT NULL,
	"citation_coverage" double precision NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "reports_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_item_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"version" text,
	"content_hash" text NOT NULL,
	"source_updated_at" text,
	"fetched_at" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"source_type" text NOT NULL,
	"source_external_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author" text,
	"source_date" text NOT NULL,
	"url" text,
	"metadata" jsonb,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"provider" text NOT NULL,
	"cursor" text,
	"last_successful_sync_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_review_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"summary" text NOT NULL,
	"ok" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"not_ok" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_branch" text,
	"figma_url" text,
	"recommended_next_action" text NOT NULL,
	"confidence" double precision,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"type" text NOT NULL,
	"cron" text NOT NULL,
	"hour" integer NOT NULL,
	"minute" integer NOT NULL,
	"timezone" text DEFAULT 'Europe/Belgrade' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"verdict" text NOT NULL,
	"matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_next_action" text NOT NULL,
	"confidence" double precision,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"status_manually_set" boolean DEFAULT false NOT NULL,
	"review_status" text DEFAULT 'approved' NOT NULL,
	"priority_score" double precision,
	"confidence" double precision,
	"reason" text NOT NULL,
	"next_action" text NOT NULL,
	"done_criteria" jsonb NOT NULL,
	"due_date" text,
	"owner" text,
	"waiting_on" text,
	"figma_frame_url" text,
	"local_repo_path" text,
	"github_repo" text,
	"work_context" jsonb,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Personal workspace' NOT NULL,
	"timezone" text DEFAULT 'Europe/Belgrade' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_relations" ADD CONSTRAINT "evidence_relations_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_relations" ADD CONSTRAINT "evidence_relations_from_evidence_id_hydra_evidence_items_id_fk" FOREIGN KEY ("from_evidence_id") REFERENCES "public"."hydra_evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_relations" ADD CONSTRAINT "evidence_relations_to_evidence_id_hydra_evidence_items_id_fk" FOREIGN KEY ("to_evidence_id") REFERENCES "public"."hydra_evidence_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydra_evidence_items" ADD CONSTRAINT "hydra_evidence_items_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydra_evidence_items" ADD CONSTRAINT "hydra_evidence_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_knowledge_item_id_knowledge_items_id_fk" FOREIGN KEY ("knowledge_item_id") REFERENCES "public"."knowledge_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_feedback" ADD CONSTRAINT "report_feedback_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_report_task_id_report_tasks_id_fk" FOREIGN KEY ("report_task_id") REFERENCES "public"."report_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_tasks" ADD CONSTRAINT "report_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_tasks" ADD CONSTRAINT "report_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."report_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_report_task_id_report_tasks_id_fk" FOREIGN KEY ("report_task_id") REFERENCES "public"."report_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_review_reports" ADD CONSTRAINT "sync_review_reports_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_schedules" ADD CONSTRAINT "task_schedules_report_task_id_report_tasks_id_fk" FOREIGN KEY ("report_task_id") REFERENCES "public"."report_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reports" ADD CONSTRAINT "verification_reports_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;