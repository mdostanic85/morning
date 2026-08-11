ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_clerk_user_id_unique" ON "user_profiles" USING btree ("clerk_user_id");
--> statement-breakpoint
INSERT INTO "user_profiles" ("email", "name")
SELECT 'legacy-owner@local.invalid', 'Legacy owner'
WHERE NOT EXISTS (SELECT 1 FROM "user_profiles")
  AND (EXISTS (SELECT 1 FROM "connections") OR EXISTS (SELECT 1 FROM "connection_secrets"));
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
UPDATE "connections"
SET "user_id" = (SELECT "id" FROM "user_profiles" ORDER BY "id" LIMIT 1)
WHERE "user_id" IS NULL;
--> statement-breakpoint
WITH duplicates AS (
  SELECT duplicate."id" AS duplicate_id, keeper."id" AS keeper_id
  FROM "connections" duplicate
  JOIN "connections" keeper
    ON duplicate."user_id" = keeper."user_id"
   AND duplicate."provider" = keeper."provider"
   AND duplicate."id" < keeper."id"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "connections" newer
    WHERE newer."user_id" = keeper."user_id"
      AND newer."provider" = keeper."provider"
      AND newer."id" > keeper."id"
  )
)
DELETE FROM "connection_cursors" old_cursor
USING duplicates, "connection_cursors" kept_cursor
WHERE old_cursor."connection_id" = duplicates.duplicate_id
  AND kept_cursor."connection_id" = duplicates.keeper_id
  AND old_cursor."provider" = kept_cursor."provider"
  AND old_cursor."scope_type" = kept_cursor."scope_type"
  AND old_cursor."scope_key" = kept_cursor."scope_key"
  AND old_cursor."cursor_type" = kept_cursor."cursor_type";
--> statement-breakpoint
WITH duplicates AS (
  SELECT duplicate."id" AS duplicate_id, keeper."id" AS keeper_id
  FROM "connections" duplicate
  JOIN "connections" keeper
    ON duplicate."user_id" = keeper."user_id"
   AND duplicate."provider" = keeper."provider"
   AND duplicate."id" < keeper."id"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "connections" newer
    WHERE newer."user_id" = keeper."user_id"
      AND newer."provider" = keeper."provider"
      AND newer."id" > keeper."id"
  )
)
UPDATE "connection_cursors" cursor_row
SET "connection_id" = duplicates.keeper_id
FROM duplicates
WHERE cursor_row."connection_id" = duplicates.duplicate_id;
--> statement-breakpoint
DELETE FROM "connections" older
USING "connections" newer
WHERE older."user_id" = newer."user_id"
  AND older."provider" = newer."provider"
  AND older."id" < newer."id";
--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connections_user_provider_unique" ON "connections" USING btree ("user_id", "provider");
--> statement-breakpoint
ALTER TABLE "connection_secrets" DROP CONSTRAINT IF EXISTS "connection_secrets_provider_unique";
--> statement-breakpoint
ALTER TABLE "connection_secrets" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
UPDATE "connection_secrets"
SET "user_id" = (SELECT "id" FROM "user_profiles" ORDER BY "id" LIMIT 1)
WHERE "user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "connection_secrets" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "connection_secrets" ADD CONSTRAINT "connection_secrets_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "connection_secrets_user_provider_unique" ON "connection_secrets" USING btree ("user_id", "provider");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
  "state_hash" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "provider" text NOT NULL,
  "linked_providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "oauth_states_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action
);
