ALTER TABLE "work_tasks"
ADD COLUMN IF NOT EXISTS "meeting_context" jsonb DEFAULT '[]'::jsonb NOT NULL;
