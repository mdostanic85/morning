CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'Personal workspace' NOT NULL,
	`timezone` text DEFAULT 'Europe/Belgrade' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer,
	`project_id` integer,
	`name` text NOT NULL,
	`template` text DEFAULT 'hydra_asc' NOT NULL,
	`prompt_version` text DEFAULT 'hydra-report-v1' NOT NULL,
	`schema_version` text DEFAULT 'hydra-report-v1' NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`delivery_settings` text DEFAULT '{"inApp":true,"email":false,"push":false}' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_task_id` integer NOT NULL,
	`type` text NOT NULL,
	`cron` text NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	`timezone` text DEFAULT 'Europe/Belgrade' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`report_task_id`) REFERENCES `report_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_task_id` integer NOT NULL,
	`provider` text NOT NULL,
	`cursor` text,
	`last_successful_sync_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`report_task_id`) REFERENCES `report_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_item_id` integer NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`version` text,
	`content_hash` text NOT NULL,
	`source_updated_at` text,
	`fetched_at` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `report_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_task_id` integer NOT NULL,
	`run_type` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`source_health` text DEFAULT '[]' NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`timings` text DEFAULT '{}' NOT NULL,
	`config_snapshot` text DEFAULT '{}' NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`model_provider` text,
	`model_name` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`estimated_cost` real,
	`error` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`report_task_id`) REFERENCES `report_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_runs_idempotency_key_unique` ON `report_runs` (`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `hydra_evidence_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`source_item_id` integer,
	`source` text NOT NULL,
	`source_type` text NOT NULL,
	`external_id` text NOT NULL,
	`version` text,
	`occurred_at` text NOT NULL,
	`source_updated_at` text,
	`fetched_at` text NOT NULL,
	`author` text,
	`participants` text DEFAULT '[]' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`content_hash` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`score_reasons` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `report_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`from_evidence_id` integer NOT NULL,
	`to_evidence_id` integer NOT NULL,
	`relation` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `report_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_evidence_id`) REFERENCES `hydra_evidence_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_evidence_id`) REFERENCES `hydra_evidence_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`schema_version` text NOT NULL,
	`structured_json` text NOT NULL,
	`rendered_text` text NOT NULL,
	`citation_coverage` real NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `report_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_run_id_unique` ON `reports` (`run_id`);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_response` text,
	`last_attempt_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `report_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` integer NOT NULL,
	`section` text NOT NULL,
	`rating` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer,
	`actor` text DEFAULT 'local-user' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
