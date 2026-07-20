CREATE TABLE IF NOT EXISTS "task_progress_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL,
  "plan_version" text NOT NULL,
  "item_id" text NOT NULL,
  "item_type" text NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "completed_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "task_progress_state_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "work_tasks"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "task_progress_state_unique" UNIQUE("task_id","plan_version","item_id","item_type")
);
