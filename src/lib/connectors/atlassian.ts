import "server-only";
import { bearerFetch } from "./auth";
import { getConnectionSecret } from "@/services/connectionSecrets";
import { fetchWithTimeout } from "@/lib/http";

export type AtlassianProvider = "jira" | "confluence";

export interface AtlassianResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl?: string;
}

export async function getAtlassianResources(provider: AtlassianProvider) {
  const response = await bearerFetch(
    provider,
    "https://api.atlassian.com/oauth/token/accessible-resources"
  );
  const resources = (await response.json()) as AtlassianResource[] | { error?: string };
  if (!response.ok || !Array.isArray(resources)) {
    throw new Error("Could not list Atlassian sites.");
  }
  return resources;
}

export async function getDefaultAtlassianResource(provider: AtlassianProvider) {
  const resources = await getAtlassianResources(provider);
  const resource = resources[0];
  if (!resource) throw new Error("No Atlassian sites are available for this connection.");
  return resource;
}

/**
 * Everything a Jira/Confluence request needs, independent of how the connection
 * was authorized. OAuth proxies through api.atlassian.com under a cloud id;
 * an API token talks to the site host directly. Both accept the same REST
 * paths appended to `baseUrl`, so callers stay auth-agnostic.
 */
export interface AtlassianContext {
  baseUrl: string;
  /** Site origin used to build human-facing browse/wiki links. */
  siteUrl: string;
  siteName: string;
  cloudId: string | null;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface AtlassianTokenCredentials {
  email: string;
  apiToken: string;
  siteUrl: string;
}

/** Accepts `team.atlassian.net` or a full URL; returns a bare origin. */
export function normalizeAtlassianSiteUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Atlassian site URL is required.");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let origin: string;
  try {
    origin = new URL(withScheme).origin;
  } catch {
    throw new Error(`"${value}" is not a valid Atlassian site URL.`);
  }
  if (!origin.startsWith("https://")) {
    throw new Error("Atlassian site URL must use https.");
  }
  return origin;
}

function basicAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

export async function getAtlassianTokenCredentials(
  provider: AtlassianProvider
): Promise<AtlassianTokenCredentials | null> {
  const secret = await getConnectionSecret(provider);
  const email = secret?.atlassianEmail?.trim();
  const apiToken = secret?.atlassianApiToken?.trim();
  const siteUrl = secret?.atlassianSiteUrl?.trim();
  if (!email || !apiToken || !siteUrl) return null;
  return { email, apiToken, siteUrl: normalizeAtlassianSiteUrl(siteUrl) };
}

export function atlassianTokenFetch(credentials: AtlassianTokenCredentials) {
  return (url: string, init?: RequestInit) =>
    fetchWithTimeout(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: basicAuthHeader(credentials.email, credentials.apiToken),
        Accept: "application/json",
      },
    });
}

// The cloud id only decorates source metadata, so a failed lookup must not
// fail the sync. Cached per site because it never changes.
const cloudIdBySite = new Map<string, string | null>();

async function resolveCloudId(siteUrl: string): Promise<string | null> {
  const cached = cloudIdBySite.get(siteUrl);
  if (cached !== undefined) return cached;
  let cloudId: string | null = null;
  try {
    const response = await fetchWithTimeout(`${siteUrl}/_edge/tenant_info`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as { cloudId?: unknown };
      cloudId = typeof body.cloudId === "string" ? body.cloudId : null;
    }
  } catch {
    cloudId = null;
  }
  cloudIdBySite.set(siteUrl, cloudId);
  return cloudId;
}

export async function getAtlassianContext(
  provider: AtlassianProvider
): Promise<AtlassianContext> {
  const credentials = await getAtlassianTokenCredentials(provider);
  if (credentials) {
    return {
      baseUrl: credentials.siteUrl,
      siteUrl: credentials.siteUrl,
      siteName: new URL(credentials.siteUrl).hostname,
      cloudId: await resolveCloudId(credentials.siteUrl),
      fetch: atlassianTokenFetch(credentials),
    };
  }

  const resource = await getDefaultAtlassianResource(provider);
  return {
    baseUrl: `https://api.atlassian.com/ex/${provider}/${resource.id}`,
    siteUrl: resource.url,
    siteName: resource.name,
    cloudId: resource.id,
    fetch: (url, init) => bearerFetch(provider, url, init),
  };
}

interface AtlassianIdentity {
  displayName: string | null;
  emailAddress: string | null;
}

function identityFrom(body: unknown): AtlassianIdentity {
  const record = (body ?? {}) as { displayName?: unknown; emailAddress?: unknown };
  return {
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    emailAddress: typeof record.emailAddress === "string" ? record.emailAddress : null,
  };
}

/**
 * Verifies credentials before they are stored, so a typo surfaces in the
 * Settings form instead of as a failed provider halfway through a sync.
 */
export async function testAtlassianTokenCredentials(
  credentials: AtlassianTokenCredentials
): Promise<AtlassianIdentity> {
  const request = atlassianTokenFetch(credentials);
  const response = await request(`${credentials.siteUrl}/rest/api/3/myself`);
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Atlassian rejected these credentials. Check the email and API token, and that the account can sign in to this site."
    );
  }
  if (response.status === 404) {
    throw new Error(`No Jira site responded at ${credentials.siteUrl}.`);
  }
  if (!response.ok) {
    throw new Error(`Atlassian returned ${response.status} for ${credentials.siteUrl}.`);
  }
  return identityFrom(await response.json());
}
