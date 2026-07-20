CREATE TABLE `sync_provider_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_run_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`items_fetched` integer DEFAULT 0 NOT NULL,
	`items_created` integer DEFAULT 0 NOT NULL,
	`items_updated` integer DEFAULT 0 NOT NULL,
	`items_unchanged` integer DEFAULT 0 NOT NULL,
	`items_failed` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	FOREIGN KEY (`sync_run_id`) REFERENCES `sync_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`trigger` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`cancel_requested_at` text,
	`error_summary` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
