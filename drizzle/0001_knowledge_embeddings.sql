CREATE TABLE `knowledge_embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_type` text NOT NULL,
	`source_item_id` integer,
	`knowledge_item_id` integer,
	`project_id` integer,
	`chunk_index` integer NOT NULL,
	`chunk_text` text NOT NULL,
	`embedding` text NOT NULL,
	`model` text NOT NULL,
	`source_date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
