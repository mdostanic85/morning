-- WL-01: extraction/knowledge/embedding failures previously never touched
-- itemsFailed and were invisible to any completion gate. Track them as a
-- distinct counter on sync_provider_runs so a provider that persisted every
-- item but failed to interpret some of them is visible and does not record
-- "completed".
ALTER TABLE "sync_provider_runs"
ADD COLUMN IF NOT EXISTS "items_extraction_failed" integer DEFAULT 0 NOT NULL;
