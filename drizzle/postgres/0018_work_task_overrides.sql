-- Critical overrides: task information that newer meeting evidence contradicted.
-- Each entry records the field, what the task said before, what the meeting
-- replaced it with, and the verbatim transcript quote that caused the change,
-- so an override is traceable instead of a silent rewrite. Additive with a
-- default — existing rows start with an empty history.
ALTER TABLE "work_tasks"
ADD COLUMN IF NOT EXISTS "overrides" jsonb DEFAULT '[]'::jsonb NOT NULL;
