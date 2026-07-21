-- WL-08: user-authored, per-scope extraction steering rules ("ignore GitHub
-- CI noise"). Additive table only.
CREATE TABLE IF NOT EXISTS "ingestion_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_type" text,
  "project_id" integer REFERENCES "projects"("id"),
  "rule" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
