CREATE TABLE `sync_review_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`summary` text NOT NULL,
	`ok` text DEFAULT '[]' NOT NULL,
	`not_ok` text DEFAULT '[]' NOT NULL,
	`conflicts` text DEFAULT '[]' NOT NULL,
	`github_branch` text,
	`figma_url` text,
	`recommended_next_action` text NOT NULL,
	`confidence` real,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `work_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
