CREATE TABLE `connection_cursors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`connection_id` integer NOT NULL,
	`provider` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_key` text DEFAULT '' NOT NULL,
	`cursor_type` text NOT NULL,
	`cursor_value_type` text DEFAULT 'updated_since' NOT NULL,
	`cursor_value` text,
	`last_seen_updated_at` text,
	`overlap_duration_ms` integer DEFAULT 86400000 NOT NULL,
	`last_successful_sync_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_cursors_scope_unique` ON `connection_cursors` (`connection_id`,`provider`,`scope_type`,`scope_key`,`cursor_type`);
