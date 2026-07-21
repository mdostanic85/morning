-- WL-09: persisted LLM telemetry (job type, provider, model, tokens, cost,
-- latency, status) for every runLlmJob/runEmbeddingJob call. Previously only
-- logged to console.info. Additive, no backfill required.
CREATE TABLE IF NOT EXISTS "llm_telemetry" (
  "id" serial PRIMARY KEY NOT NULL,
  "job_type" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text,
  "input_hash" text NOT NULL,
  "ok" boolean NOT NULL,
  "error_kind" text,
  "fallback" boolean DEFAULT false NOT NULL,
  "duration_ms" integer NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "total_tokens" integer,
  "estimated_cost_usd" double precision,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "llm_telemetry_job_type_idx" ON "llm_telemetry" ("job_type");
CREATE INDEX IF NOT EXISTS "llm_telemetry_created_at_idx" ON "llm_telemetry" ("created_at");
