import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectionSecrets as connectionSecretsTable } from "@/db/tables";
import { execute, fetchOne } from "@/db/query";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";
import { requireAppUserId } from "@/lib/auth/appUser";

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
  /** Serialized OAuth state used by hosted MCP connectors. */
  mcpOAuth?: Record<string, unknown>;
  // Atlassian API token (Basic auth). The Rovo MCP domain allowlist and OAuth
  // 3LO app registration both need an org admin; a personal API token does not,
  // so this is the only Atlassian path a plain member can set up alone.
  atlassianEmail?: string;
  atlassianApiToken?: string;
  /** Site origin, e.g. https://your-team.atlassian.net. */
  atlassianSiteUrl?: string;
}

export async function getConnectionSecret(
  provider: string,
  explicitUserId?: number
): Promise<ConnectionSecret | null> {
  const userId = await requireAppUserId(explicitUserId);
  const row = await fetchOne(
    db
      .select()
      .from(connectionSecretsTable)
      .where(
        and(
          eq(connectionSecretsTable.userId, userId),
          eq(connectionSecretsTable.provider, provider)
        )
      )
  );
  if (!row) return null;

  return JSON.parse(decryptSecret(row.ciphertext)) as ConnectionSecret;
}

export async function saveConnectionSecret(
  provider: string,
  secret: ConnectionSecret,
  explicitUserId?: number
) {
  const userId = await requireAppUserId(explicitUserId);
  // Callers patch individual fields — a token refresh sends only the new access
  // token and expiry, and must not drop the refresh token stored alongside it.
  const merged = { ...((await getConnectionSecret(provider, userId)) ?? {}), ...secret };
  const ciphertext = encryptSecret(JSON.stringify(merged));

  await execute(
    db
      .insert(connectionSecretsTable)
      .values({ userId, provider, ciphertext })
      .onConflictDoUpdate({
        target: [connectionSecretsTable.userId, connectionSecretsTable.provider],
        set: { ciphertext, updatedAt: new Date().toISOString() },
      })
  );
}

export async function clearConnectionSecret(provider: string, explicitUserId?: number) {
  const userId = await requireAppUserId(explicitUserId);
  await execute(
    db
      .delete(connectionSecretsTable)
      .where(
        and(
          eq(connectionSecretsTable.userId, userId),
          eq(connectionSecretsTable.provider, provider)
        )
      )
  );
}
