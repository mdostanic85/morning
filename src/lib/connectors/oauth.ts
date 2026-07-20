import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { saveConnectionSecret, type ConnectionSecret } from "@/services/connectionSecrets";
import { fetchWithTimeout } from "@/lib/http";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"] as const;
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

const statePath = path.join(process.cwd(), "data", "oauth-states.json");

function readStateFile(): Record<string, { provider: OAuthProvider; createdAt: string }> {
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeStateFile(states: Record<string, { provider: OAuthProvider; createdAt: string }>) {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(states, null, 2), { mode: 0o600 });
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

function pruneExpiredStates(
  states: Record<string, { provider: OAuthProvider; createdAt: string }>
): Record<string, { provider: OAuthProvider; createdAt: string }> {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(states).filter(
      ([, entry]) => now - new Date(entry.createdAt).getTime() < STATE_TTL_MS
    )
  );
}

export function createOAuthState(provider: OAuthProvider): string {
  const state = crypto.randomBytes(24).toString("hex");
  const states = pruneExpiredStates(readStateFile());
  states[state] = { provider, createdAt: new Date().toISOString() };
  writeStateFile(states);
  return state;
}

export function getOAuthStateProvider(state: string): OAuthProvider | null {
  const states = readStateFile();
  const entry = states[state];
  if (!entry) return null;
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  if (ageMs >= STATE_TTL_MS) return null;
  return entry.provider;
}

export function consumeOAuthState(state: string, provider: OAuthProvider): boolean {
  const states = readStateFile();
  const entry = states[state];
  delete states[state];
  writeStateFile(pruneExpiredStates(states));
  if (!entry || entry.provider !== provider) return false;
  const ageMs = Date.now() - new Date(entry.createdAt).getTime();
  return ageMs < STATE_TTL_MS;
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
export function resolveOAuthCallbackProvider(
  urlProvider: OAuthProvider,
  state: string | null
): OAuthProvider {
  if (!state) return urlProvider;
  const stateProvider = getOAuthStateProvider(state);
  if (!stateProvider) return urlProvider;
  if (stateProvider === urlProvider) return stateProvider;
  if (isGoogleOAuthProvider(urlProvider) && isGoogleOAuthProvider(stateProvider)) {
    return stateProvider;
  }
  return urlProvider;
}

export function buildAuthorizationUrl(input: {
  provider: OAuthProvider;
  origin: string;
}): string {
  const config = getOAuthConfig(input.provider);
  if (!config || !config.clientId) {
    throw new Error(`Missing OAuth client config for ${input.provider}.`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: buildRedirectUri(input.origin, input.provider),
    response_type: "code",
    scope: config.scopes.join(" "),
    state: createOAuthState(input.provider),
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
