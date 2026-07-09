ALTER TABLE `work_tasks` ADD `status_manually_set` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `work_tasks` ADD `review_status` text DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `review_status` text DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE `knowledge_items` ADD `evidence_quotes` text DEFAULT '[]' NOT NULL;
