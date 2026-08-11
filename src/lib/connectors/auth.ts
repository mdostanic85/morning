import "server-only";
import { getConnectionSecret, saveConnectionSecret } from "@/services/connectionSecrets";
import { clearConnectionSecret } from "@/services/connectionSecrets";
import { getOAuthConfig, isGoogleOAuthProvider, GOOGLE_LINKED_PROVIDERS, type OAuthProvider } from "./oauth";
import { fetchWithTimeout } from "@/lib/http";
import { requireAppUserId } from "@/lib/auth/appUser";
import { getConnectionByProvider, upsertConnection } from "@/services/connections";

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return Date.now() > new Date(expiresAt).getTime() - 60_000;
}

const refreshes = new Map<string, Promise<string>>();

async function refreshAccessToken(
  provider: OAuthProvider,
  userId: number,
  refreshToken: string,
  previousExpiresAt?: string
): Promise<string> {
  const config = getOAuthConfig(provider);
  if (!config?.clientId || !config.clientSecret) {
    throw new Error(`Missing OAuth client config for ${provider}.`);
  }

  const response = await fetchWithTimeout(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      const connection = await getConnectionByProvider(provider, userId);
      const affected =
        isGoogleOAuthProvider(provider) && connection?.metadata?.linkedVia === "google"
          ? [...GOOGLE_LINKED_PROVIDERS]
          : [provider];
      await Promise.all(
        affected.map(async (linked) => {
          await clearConnectionSecret(linked, userId);
          await upsertConnection(
            {
              provider: linked,
              authType: "oauth",
              status: "error",
              scopes: [],
              metadata: {
                error: "Access expired or was revoked. Connect this account again.",
                lastErrorAt: new Date().toISOString(),
              },
            },
            userId
          );
        })
      );
    }
    throw new Error(body.error_description ?? body.error ?? `${provider} token refresh failed.`);
  }

  await saveConnectionSecret(
    provider,
    {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: body.expires_in
        ? new Date(Date.now() + body.expires_in * 1000).toISOString()
        : previousExpiresAt,
    },
    userId
  );
  return body.access_token;
}

export async function getAccessToken(
  provider: OAuthProvider,
  explicitUserId?: number
): Promise<string> {
  const userId = await requireAppUserId(explicitUserId);
  const secret = await getConnectionSecret(provider, userId);
  if (!secret?.accessToken) throw new Error(`${provider} is not connected.`);

  if (!isExpired(secret.expiresAt) || !secret.refreshToken) return secret.accessToken;

  const key = `${userId}:${provider}`;
  const activeRefresh = refreshes.get(key);
  if (activeRefresh) return activeRefresh;

  const refresh = refreshAccessToken(
    provider,
    userId,
    secret.refreshToken,
    secret.expiresAt
  ).finally(() => refreshes.delete(key));
  refreshes.set(key, refresh);
  return refresh;
}

export async function bearerFetch(
  provider: OAuthProvider,
  url: string,
  init?: RequestInit,
  explicitUserId?: number
): Promise<Response> {
  const token = await getAccessToken(provider, explicitUserId);
  return fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}
