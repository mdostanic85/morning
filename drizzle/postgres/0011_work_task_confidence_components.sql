-- WL-05: stores the deterministic component breakdown (assignment/identity/
-- project/authority/freshness/corroboration/conflict + the LLM's
-- extractionConfidence) that produced work_tasks.confidence, so confidence
-- is explainable per-component instead of an opaque scalar. Additive,
-- nullable — existing rows keep confidence with no breakdown until the
-- task's next extraction/merge pass.
ALTER TABLE "work_tasks"
ADD COLUMN IF NOT EXISTS "confidence_components" jsonb;
