ALTER TABLE "work_tasks" ADD COLUMN "ownership_decision" text;--> statement-breakpoint
CREATE TABLE "task_criterion_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"criterion_item_id" text NOT NULL,
	"evidence_id" integer NOT NULL,
	"created_at" text NOT NULL
);--> statement-breakpoint
CREATE TABLE "task_conflict_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"conflict_key" text NOT NULL,
	"summary" text NOT NULL,
	"decision" text NOT NULL,
	"evidence_source_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "task_criterion_evidence" ADD CONSTRAINT "task_criterion_evidence_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_criterion_evidence" ADD CONSTRAINT "task_criterion_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_conflict_decisions" ADD CONSTRAINT "task_conflict_decisions_task_id_work_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_criterion_evidence_unique" ON "task_criterion_evidence" USING btree ("task_id","criterion_item_id","evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_conflict_decisions_unique" ON "task_conflict_decisions" USING btree ("task_id","conflict_key");--> statement-breakpoint
UPDATE "work_tasks"
SET "ownership_decision" = 'rejected_not_mine'
WHERE "reason" LIKE '%Not mine: user marked this as not their responsibility.%'
  AND "ownership_decision" IS NULL;
