import "server-only";
import { getConnectionSecret, saveConnectionSecret } from "@/services/connectionSecrets";
import { getOAuthConfig, type OAuthProvider } from "./oauth";
import { fetchWithTimeout } from "@/lib/http";

function isExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  return Date.now() > new Date(expiresAt).getTime() - 60_000;
}

export async function getAccessToken(provider: OAuthProvider): Promise<string> {
  const secret = await getConnectionSecret(provider);
  if (!secret?.accessToken) throw new Error(`${provider} is not connected.`);

  if (!isExpired(secret.expiresAt) || !secret.refreshToken) return secret.accessToken;

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
      refresh_token: secret.refreshToken,
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
    throw new Error(body.error_description ?? body.error ?? `${provider} token refresh failed.`);
  }

  await saveConnectionSecret(provider, {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? secret.refreshToken,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : secret.expiresAt,
  });

  return body.access_token;
}

export async function bearerFetch(
  provider: OAuthProvider,
  url: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken(provider);
  return fetchWithTimeout(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}
