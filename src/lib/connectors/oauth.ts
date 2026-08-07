import "server-only";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectionSecrets as connectionSecretsTable } from "@/db/tables";
import { execute, fetchOne } from "@/db/query";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox";
import { saveConnectionSecret, type ConnectionSecret } from "@/services/connectionSecrets";
import { fetchWithTimeout } from "@/lib/http";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;
/** Union of read-only Google scopes — authorizes Gmail + Calendar + Drive in one consent. */
export const GOOGLE_COMBINED_SCOPES = [
  ...GMAIL_SCOPES,
  ...CALENDAR_SCOPES,
  ...DRIVE_SCOPES,
] as const;
/** Providers a single combined Google grant connects together. */
export const GOOGLE_LINKED_PROVIDERS = ["gmail", "calendar", "drive"] as const;
export const JIRA_SCOPES = [
  "read:jira-work",
  "write:jira-work",
  "read:jira-user",
  "read:me",
  "offline_access",
] as const;
export const CONFLUENCE_SCOPES = [
  "read:confluence-content.all",
  "read:confluence-space.summary",
  "read:me",
  "offline_access",
] as const;
export const DISCORD_SCOPES = ["identify", "guilds", "bot"] as const;
export const GITHUB_SCOPES = ["read:user", "read:org", "repo"] as const;

export type OAuthProvider =
  | "gmail"
  | "calendar"
  | "drive"
  | "jira"
  | "confluence"
  | "discord"
  | "github";

/** Google APIs share one OAuth client; keep their redirect URI identical. */
export function isGoogleOAuthProvider(
  provider: OAuthProvider
): provider is "gmail" | "calendar" | "drive" {
  return provider === "gmail" || provider === "calendar" || provider === "drive";
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  extraAuthParams?: Record<string, string>;
}

/**
 * CSRF/state tokens for OAuth live in Postgres (one encrypted row per state),
 * not on the local filesystem — hosted deploys have no writable persistent disk.
 */
const OAUTH_STATE_PREFIX = "oauth.state.";

interface OAuthStateEntry {
  provider: OAuthProvider;
  createdAt: string;
  /** When the grant should connect several providers (e.g. combined Google consent). */
  linkedProviders?: OAuthProvider[];
}

function stateProviderKey(state: string): string {
  return `${OAUTH_STATE_PREFIX}${state}`;
}

async function readStateEntry(state: string): Promise<OAuthStateEntry | null> {
  const row = await fetchOne(
    db
      .select()
      .from(connectionSecretsTable)
      .where(eq(connectionSecretsTable.provider, stateProviderKey(state)))
  );
  if (!row) return null;
  try {
    return JSON.parse(decryptSecret(row.ciphertext)) as OAuthStateEntry;
  } catch {
    return null;
  }
}

async function writeStateEntry(state: string, entry: OAuthStateEntry): Promise<void> {
  const ciphertext = encryptSecret(JSON.stringify(entry));
  await execute(
    db
      .insert(connectionSecretsTable)
      .values({ provider: stateProviderKey(state), ciphertext })
      .onConflictDoUpdate({
        target: connectionSecretsTable.provider,
        set: { ciphertext, updatedAt: new Date().toISOString() },
      })
  );
}

async function deleteStateEntry(state: string): Promise<void> {
  await execute(
    db
      .delete(connectionSecretsTable)
      .where(eq(connectionSecretsTable.provider, stateProviderKey(state)))
  );
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  switch (provider) {
    case "gmail":
      return {
        clientId: env("GOOGLE_CLIENT_ID"),
        clientSecret: env("GOOGLE_CLIENT_SECRET"),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: GMAIL_SCOPES,
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      };
    case "calendar":
      return {
        clientId: env("GOOGLE_CLIENT_ID"),
        clientSecret: env("GOOGLE_CLIENT_SECRET"),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: CALENDAR_SCOPES,
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      };
    case "drive":
      return {
        clientId: env("GOOGLE_CLIENT_ID"),
        clientSecret: env("GOOGLE_CLIENT_SECRET"),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: DRIVE_SCOPES,
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      };
    case "jira":
      return {
        clientId: env("ATLASSIAN_CLIENT_ID"),
        clientSecret: env("ATLASSIAN_CLIENT_SECRET"),
        authUrl: "https://auth.atlassian.com/authorize",
        tokenUrl: "https://auth.atlassian.com/oauth/token",
        scopes: JIRA_SCOPES,
        extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
      };
    case "confluence":
      return {
        clientId: env("ATLASSIAN_CLIENT_ID"),
        clientSecret: env("ATLASSIAN_CLIENT_SECRET"),
        authUrl: "https://auth.atlassian.com/authorize",
        tokenUrl: "https://auth.atlassian.com/oauth/token",
        scopes: CONFLUENCE_SCOPES,
        extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
      };
    case "discord":
      return {
        clientId: env("DISCORD_CLIENT_ID"),
        clientSecret: env("DISCORD_CLIENT_SECRET"),
        authUrl: "https://discord.com/oauth2/authorize",
        tokenUrl: "https://discord.com/api/oauth2/token",
        scopes: DISCORD_SCOPES,
      };
    case "github":
      return {
        clientId: env("GITHUB_CLIENT_ID"),
        clientSecret: env("GITHUB_CLIENT_SECRET"),
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        scopes: GITHUB_SCOPES,
      };
  }
}

const STATE_TTL_MS = 10 * 60 * 1000;

function isStateFresh(entry: OAuthStateEntry): boolean {
  return Date.now() - new Date(entry.createdAt).getTime() < STATE_TTL_MS;
}

export async function createOAuthState(
  provider: OAuthProvider,
  linkedProviders?: OAuthProvider[]
): Promise<string> {
  const state = crypto.randomBytes(24).toString("hex");
  await writeStateEntry(state, {
    provider,
    createdAt: new Date().toISOString(),
    ...(linkedProviders && linkedProviders.length > 0 ? { linkedProviders } : {}),
  });
  return state;
}

export async function getOAuthStateProvider(state: string): Promise<OAuthProvider | null> {
  const entry = await readStateEntry(state);
  if (!entry || !isStateFresh(entry)) {
    if (entry) await deleteStateEntry(state);
    return null;
  }
  return entry.provider;
}

/** Providers a still-valid OAuth state should connect together (empty when none). */
export async function getOAuthStateLinkedProviders(state: string): Promise<OAuthProvider[]> {
  const entry = await readStateEntry(state);
  if (!entry || !isStateFresh(entry)) return [];
  return entry.linkedProviders ?? [];
}

export async function consumeOAuthState(state: string, provider: OAuthProvider): Promise<boolean> {
  const entry = await readStateEntry(state);
  await deleteStateEntry(state);
  if (!entry || entry.provider !== provider) return false;
  return isStateFresh(entry);
}

export function buildRedirectUri(origin: string, provider: OAuthProvider): string {
  // Google Cloud OAuth clients typically register a single localhost redirect URI.
  // Route calendar through the already-registered gmail callback; the real provider
  // is recovered from OAuth state in the callback handler.
  if (isGoogleOAuthProvider(provider)) {
    return `${origin}/api/connections/gmail/callback`;
  }
  return `${origin}/api/connections/${provider}/callback`;
}

/**
 * Resolve which provider an OAuth callback belongs to.
 * Google providers share one redirect URI, so the path may say "gmail" while
 * state says "calendar".
 */
export async function resolveOAuthCallbackProvider(
  urlProvider: OAuthProvider,
  state: string | null
): Promise<OAuthProvider> {
  if (!state) return urlProvider;
  const stateProvider = await getOAuthStateProvider(state);
  if (!stateProvider) return urlProvider;
  if (stateProvider === urlProvider) return stateProvider;
  if (isGoogleOAuthProvider(urlProvider) && isGoogleOAuthProvider(stateProvider)) {
    return stateProvider;
  }
  return urlProvider;
}

export async function buildAuthorizationUrl(input: {
  provider: OAuthProvider;
  origin: string;
  /** Google only: request Gmail + Calendar + Drive scopes in a single consent. */
  linkGoogle?: boolean;
}): Promise<string> {
  const config = getOAuthConfig(input.provider);
  if (!config || !config.clientId) {
    throw new Error(`Missing OAuth client config for ${input.provider}.`);
  }

  const linkGoogle = input.linkGoogle === true && isGoogleOAuthProvider(input.provider);
  const scopes = linkGoogle ? GOOGLE_COMBINED_SCOPES : config.scopes;
  const linkedProviders = linkGoogle ? [...GOOGLE_LINKED_PROVIDERS] : undefined;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: buildRedirectUri(input.origin, input.provider),
    response_type: "code",
    scope: scopes.join(" "),
    state: await createOAuthState(input.provider, linkedProviders),
    ...(config.extraAuthParams ?? {}),
  });

  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(input: {
  provider: OAuthProvider;
  code: string;
  origin: string;
}): Promise<ConnectionSecret> {
  const config = getOAuthConfig(input.provider);
  if (!config || !config.clientId || !config.clientSecret) {
    throw new Error(`Missing OAuth client config for ${input.provider}.`);
  }

  const response = await fetchWithTimeout(config.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      redirect_uri: buildRedirectUri(input.origin, input.provider),
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
    throw new Error(body.error_description ?? body.error ?? "OAuth token exchange failed.");
  }

  const secret: ConnectionSecret = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : undefined,
  };
  await saveConnectionSecret(input.provider, secret);
  return secret;
}
