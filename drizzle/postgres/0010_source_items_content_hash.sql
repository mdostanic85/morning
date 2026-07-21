-- WL-03: first-class content_hash + updated_at on the task-path source
-- store, enabling real-change detection independent of the extraction-skip
-- fingerprint (_worklightProcessing, unchanged). Nullable/backfillable —
-- existing rows get updated_at = created_at and a computed content_hash is
-- filled in lazily by the app on next write.
ALTER TABLE "source_items"
ADD COLUMN IF NOT EXISTS "content_hash" text;

ALTER TABLE "source_items"
ADD COLUMN IF NOT EXISTS "updated_at" text;

UPDATE "source_items" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;
