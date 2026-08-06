import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectionSecrets as connectionSecretsTable } from "@/db/tables";
import { execute, fetchOne } from "@/db/query";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";

// Connector credentials live in PostgreSQL, encrypted with
// SECRETS_ENCRYPTION_KEY. They used to sit in data/connection-secrets.json,
// which silently loses every token on a hosted deploy: the filesystem is
// read-only and each invocation starts from the deployment image. Run
// `npm run db:migrate:connection-secrets` once to carry an existing local file
// over.

export interface ConnectionSecret {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  apiKey?: string;
  pat?: string;
  botToken?: string;
}

export async function getConnectionSecret(provider: string): Promise<ConnectionSecret | null> {
  const row = await fetchOne(
    db
      .select()
      .from(connectionSecretsTable)
      .where(eq(connectionSecretsTable.provider, provider))
  );
  if (!row) return null;

  return JSON.parse(decryptSecret(row.ciphertext)) as ConnectionSecret;
}

export async function saveConnectionSecret(provider: string, secret: ConnectionSecret) {
  // Callers patch individual fields — a token refresh sends only the new access
  // token and expiry, and must not drop the refresh token stored alongside it.
  const merged = { ...((await getConnectionSecret(provider)) ?? {}), ...secret };
  const ciphertext = encryptSecret(JSON.stringify(merged));

  await execute(
    db
      .insert(connectionSecretsTable)
      .values({ provider, ciphertext })
      .onConflictDoUpdate({
        target: connectionSecretsTable.provider,
        set: { ciphertext, updatedAt: new Date().toISOString() },
      })
  );
}

export async function clearConnectionSecret(provider: string) {
  await execute(
    db.delete(connectionSecretsTable).where(eq(connectionSecretsTable.provider, provider))
  );
}
