ALTER TABLE "work_tasks"
ADD COLUMN IF NOT EXISTS "canonical_key" text;

CREATE TABLE IF NOT EXISTS "daily_briefs" (
  "id" serial PRIMARY KEY NOT NULL,
  "today" text NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "input_hash" text NOT NULL,
  "structured_json" jsonb NOT NULL,
  "model_provider" text,
  "model_name" text,
  "prompt_version" text,
  "validation_ok" boolean DEFAULT true NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_briefs_today_unique" ON "daily_briefs" ("today");
