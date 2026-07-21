-- WL-04: DB-level uniqueness on (source_type, source_external_id) to close
-- the race-duplicate window. Existing duplicates must be reconciled before
-- the index can be created, so this migration first repoints dependent rows
-- (evidence, knowledge_items, knowledge_embeddings, source_documents) from
-- losing duplicate ids onto the oldest ("keeper") row per key, then deletes
-- the losers, then adds the partial unique index.
DO $$
DECLARE
  dup RECORD;
  keeper_id integer;
BEGIN
  FOR dup IN
    SELECT source_type, source_external_id
    FROM source_items
    WHERE source_external_id IS NOT NULL
    GROUP BY source_type, source_external_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM source_items
    WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id
    ORDER BY id ASC
    LIMIT 1;

    UPDATE evidence SET source_item_id = keeper_id
    WHERE source_item_id IN (
      SELECT id FROM source_items
      WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id AND id <> keeper_id
    );

    UPDATE knowledge_items SET source_item_id = keeper_id
    WHERE source_item_id IN (
      SELECT id FROM source_items
      WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id AND id <> keeper_id
    );

    UPDATE knowledge_embeddings SET source_item_id = keeper_id
    WHERE source_item_id IN (
      SELECT id FROM source_items
      WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id AND id <> keeper_id
    );

    UPDATE source_documents SET source_item_id = keeper_id
    WHERE source_item_id IN (
      SELECT id FROM source_items
      WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id AND id <> keeper_id
    );

    DELETE FROM source_items
    WHERE source_type = dup.source_type AND source_external_id = dup.source_external_id AND id <> keeper_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "source_items_type_external_id_unique"
  ON "source_items" ("source_type", "source_external_id")
  WHERE "source_external_id" IS NOT NULL;
