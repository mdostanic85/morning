ALTER TABLE `projects` ADD `github_repositories` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `confluence_spaces` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `confluence_page_urls` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `discord_channels` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `daily_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`what_worked_on` text DEFAULT '[]' NOT NULL,
	`completed` text DEFAULT '[]' NOT NULL,
	`still_open` text DEFAULT '[]' NOT NULL,
	`waiting_on` text DEFAULT '[]' NOT NULL,
	`first_tomorrow` text,
	`risks` text DEFAULT '[]' NOT NULL,
	`summary` text NOT NULL,
	`confidence` real,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
