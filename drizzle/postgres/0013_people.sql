-- WL-10: durable person entities. Additive tables only. `merged_into_id`
-- is set exclusively by an explicit confirmed merge (services/people.ts
-- mergePersonInto) — resolution never auto-merges two distinct-looking
-- people (see personIdentity.ts).
CREATE TABLE IF NOT EXISTS "people" (
  "id" serial PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "merged_into_id" integer REFERENCES "people"("id"),
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS "person_aliases" (
  "id" serial PRIMARY KEY NOT NULL,
  "person_id" integer NOT NULL REFERENCES "people"("id"),
  "alias" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "person_aliases_person_id_idx" ON "person_aliases" ("person_id");
