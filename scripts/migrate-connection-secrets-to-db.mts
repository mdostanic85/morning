import fs from "node:fs";
import path from "node:path";
import { resetDatabaseConfigCache } from "../src/lib/env/database";

// One-time move of data/connection-secrets.json into the encrypted
// `connection_secrets` table. Safe to re-run: each provider is upserted, and
// the source file is left untouched so a failed run loses nothing.
//
//   npm run db:migrate:connection-secrets
//
// Target a different database (for example Neon) by exporting DATABASE_URL for
// the command:
//
//   DATABASE_URL="postgresql://…" npm run db:migrate:connection-secrets

type ConnectionSecretFile = Record<string, Record<string, unknown>>;

const secretsPath = path.join(process.cwd(), "data", "connection-secrets.json");

function readLegacyFile(): ConnectionSecretFile {
  if (!fs.existsSync(secretsPath)) return {};
  return JSON.parse(fs.readFileSync(secretsPath, "utf-8")) as ConnectionSecretFile;
}

async function main() {
  const legacy = readLegacyFile();
  const providers = Object.keys(legacy);

  if (providers.length === 0) {
    console.log(`No connector secrets found at ${secretsPath}. Nothing to migrate.`);
    return;
  }

  resetDatabaseConfigCache();

  const { encryptSecret } = await import("../src/lib/crypto/secretBox");
  const { db } = await import("../src/db/connection");
  const { connectionSecrets } = await import("../src/db/schema");

  // Encrypt everything before the first write so a missing or malformed
  // SECRETS_ENCRYPTION_KEY fails the run instead of half-migrating it.
  const rows = providers.map((provider) => ({
    provider,
    ciphertext: encryptSecret(JSON.stringify(legacy[provider])),
  }));

  for (const row of rows) {
    await db
      .insert(connectionSecrets)
      .values(row)
      .onConflictDoUpdate({
        target: connectionSecrets.provider,
        set: { ciphertext: row.ciphertext, updatedAt: new Date().toISOString() },
      });
    console.log(`migrated: ${row.provider}`);
  }

  console.log(
    `\n${rows.length} provider secret(s) migrated. ` +
      `Verify each connection in Settings, then delete ${secretsPath}.`
  );

  const { getPostgresClient } = await import("../src/db/connection.postgres");
  await getPostgresClient().end({ timeout: 5 });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
