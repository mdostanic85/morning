import "server-only";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { oauthStates } from "@/db/tables";
import { execute, fetchOne, fetchReturning } from "@/db/query";
import type { ConnectionSecret } from "@/services/connectionSecrets";
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
  provider: string
): provider is "gmail" | "calendar" | "drive" {
  return provider === "gmail" || provider === "calendar" || provider === "drive";
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
  extraAuthParams?: Record<string, string>;
}

/**
 * OAuth state is hashed at rest, scoped to the signed-in app user, and consumed
 * once. It is not a credential and therefore never shares the token table.
 */
interface OAuthStateEntry {
  provider: OAuthProvider;
  userId: number;
  createdAt: string;
  /** When the grant should connect several providers (e.g. combined Google consent). */
  linkedProviders?: OAuthProvider[];
}

function hashState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}

async function readStateEntry(state: string): Promise<OAuthStateEntry | null> {
  const row = await fetchOne(
    db.select().from(oauthStates).where(eq(oauthStates.stateHash, hashState(state)))
  );
  if (!row) return null;
  return {
    provider: row.provider as OAuthProvider,
    userId: row.userId,
    createdAt: row.createdAt,
    linkedProviders: (row.linkedProviders ?? []) as OAuthProvider[],
  };
}

async function writeStateEntry(state: string, entry: OAuthStateEntry): Promise<void> {
  await execute(
    db
      .insert(oauthStates)
      .values({
        stateHash: hashState(state),
        userId: entry.userId,
        provider: entry.provider,
        linkedProviders: entry.linkedProviders ?? [],
        createdAt: entry.createdAt,
      })
  );
}

async function deleteStateEntry(state: string): Promise<void> {
  await execute(
    db.delete(oauthStates).where(eq(oauthStates.stateHash, hashState(state)))
  );
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function googleClientId(): string {
  return env("GOOGLE_INTEGRATIONS_CLIENT_ID") || env("GOOGLE_CLIENT_ID");
}

function googleClientSecret(): string {
  return env("GOOGLE_INTEGRATIONS_CLIENT_SECRET") || env("GOOGLE_CLIENT_SECRET");
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  switch (provider) {
    case "gmail":
      return {
        clientId: googleClientId(),
        clientSecret: googleClientSecret(),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: GMAIL_SCOPES,
        extraAuthParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          enable_granular_consent: "true",
        },
      };
    case "calendar":
      return {
        clientId: googleClientId(),
        clientSecret: googleClientSecret(),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: CALENDAR_SCOPES,
        extraAuthParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          enable_granular_consent: "true",
        },
      };
    case "drive":
      return {
        clientId: googleClientId(),
        clientSecret: googleClientSecret(),
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: DRIVE_SCOPES,
        extraAuthParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          enable_granular_consent: "true",
        },
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
  userId: number,
  linkedProviders?: OAuthProvider[]
): Promise<string> {
  const state = crypto.randomBytes(24).toString("hex");
  await writeStateEntry(state, {
    provider,
    userId,
    createdAt: new Date().toISOString(),
    ...(linkedProviders && linkedProviders.length > 0 ? { linkedProviders } : {}),
  });
  return state;
}

export async function getOAuthStateProvider(
  state: string,
  userId: number
): Promise<OAuthProvider | null> {
  const entry = await readStateEntry(state);
  if (!entry || entry.userId !== userId) return null;
  if (!isStateFresh(entry)) {
    await deleteStateEntry(state);
    return null;
  }
  return entry.provider;
}

/** Providers a still-valid OAuth state should connect together (empty when none). */
export async function getOAuthStateLinkedProviders(
  state: string,
  userId: number
): Promise<OAuthProvider[]> {
  const entry = await readStateEntry(state);
  if (!entry || entry.userId !== userId || !isStateFresh(entry)) return [];
  return entry.linkedProviders ?? [];
}

export async function consumeOAuthState(
  state: string,
  provider: OAuthProvider,
  userId: number
): Promise<boolean> {
  const [row] = await fetchReturning(
    db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.stateHash, hashState(state)),
          eq(oauthStates.userId, userId),
          eq(oauthStates.provider, provider)
        )
      )
      .returning()
  );
  if (!row) return false;
  return isStateFresh({
    provider: row.provider as OAuthProvider,
    userId: row.userId,
    createdAt: row.createdAt,
    linkedProviders: (row.linkedProviders ?? []) as OAuthProvider[],
  });
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
 * Canonical public origin for OAuth redirects. Prefer WORKLIGHT_APP_URL so the
 * redirect_uri stays stable across Vercel aliases (worklight.vercel.app vs
 * *.vercel.app deployment hosts). Auth and token exchange must use the same value.
 */
export function resolveAppOrigin(requestUrl: string): string {
  const configured = process.env.WORKLIGHT_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const origin = new URL(configured).origin;
      if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) {
        throw new Error("WORKLIGHT_APP_URL must use HTTPS in production.");
      }
      return origin;
    } catch {
      throw new Error("WORKLIGHT_APP_URL must be a valid public URL.");
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("WORKLIGHT_APP_URL is required in production.");
  }
  return new URL(requestUrl).origin;
}

/**
 * Resolve which provider an OAuth callback belongs to.
 * Google providers share one redirect URI, so the path may say "gmail" while
 * state says "calendar".
 */
export async function resolveOAuthCallbackProvider(
  urlProvider: OAuthProvider,
  state: string | null,
  userId: number
): Promise<OAuthProvider> {
  if (!state) return urlProvider;
  const stateProvider = await getOAuthStateProvider(state, userId);
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
  userId: number;
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
    state: await createOAuthState(input.provider, input.userId, linkedProviders),
    ...(config.extraAuthParams ?? {}),
  });

  return `${config.authUrl}?${params.toString()}`;
}

export interface OAuthTokenGrant extends ConnectionSecret {
  grantedScopes: string[];
}

export async function exchangeCodeForToken(input: {
  provider: OAuthProvider;
  code: string;
  origin: string;
}): Promise<OAuthTokenGrant> {
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
    scope?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "OAuth token exchange failed.");
  }

  let grantedScopes = body.scope?.split(/\s+/).filter(Boolean) ?? [];
  if (isGoogleOAuthProvider(input.provider) && grantedScopes.length === 0) {
    const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
    tokenInfoUrl.searchParams.set("access_token", body.access_token);
    const tokenInfoResponse = await fetchWithTimeout(tokenInfoUrl.toString(), {
      headers: { Accept: "application/json" },
    });
    if (tokenInfoResponse.ok) {
      const tokenInfo = (await tokenInfoResponse.json()) as { scope?: string };
      grantedScopes = tokenInfo.scope?.split(/\s+/).filter(Boolean) ?? [];
    }
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : undefined,
    grantedScopes,
  };
}

export function scopesGrantedForProvider(
  provider: OAuthProvider,
  grantedScopes: readonly string[]
): string[] {
  const expected = getOAuthConfig(provider)?.scopes ?? [];
  const granted = new Set(grantedScopes);
  return expected.filter((scope) => granted.has(scope));
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  // Google treats an already-invalid token as a successful local disconnect.
  if (!response.ok && response.status !== 400) {
    throw new Error("Google access could not be revoked. Please try again.");
  }
}
