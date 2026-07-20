CREATE TABLE "connection_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"provider" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"cursor_type" text NOT NULL,
	"cursor_value_type" text DEFAULT 'updated_since' NOT NULL,
	"cursor_value" text,
	"last_seen_updated_at" text,
	"overlap_duration_ms" integer DEFAULT 86400000 NOT NULL,
	"last_successful_sync_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection_cursors" ADD CONSTRAINT "connection_cursors_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_cursors_scope_unique" ON "connection_cursors" USING btree ("connection_id","provider","scope_type","scope_key","cursor_type");
