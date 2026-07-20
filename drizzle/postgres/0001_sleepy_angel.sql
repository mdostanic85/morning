CREATE TABLE "sync_provider_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_run_id" integer NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_unchanged" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"trigger" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" text NOT NULL,
	"completed_at" text,
	"cancel_requested_at" text,
	"error_summary" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_provider_runs" ADD CONSTRAINT "sync_provider_runs_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;