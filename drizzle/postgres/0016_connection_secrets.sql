-- Connector credentials move off the local filesystem
-- (data/connection-secrets.json) and into the database, because a hosted
-- deploy has no writable, persistent disk. `ciphertext` holds an AES-256-GCM
-- payload sealed with SECRETS_ENCRYPTION_KEY — never a raw token.
CREATE TABLE IF NOT EXISTS "connection_secrets" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "ciphertext" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "connection_secrets_provider_unique" UNIQUE ("provider")
);
