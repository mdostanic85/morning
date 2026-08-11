import "server-only";
import { getAtlassianContext } from "./atlassian";
import type { ConnectorSourceCandidate } from "./types";

interface ConfluenceContentResponse {
  results?: ConfluencePage[];
  message?: string;
}

interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  status: string;
  _links?: { webui?: string };
  space?: { key?: string; name?: string };
  version?: { when?: string; by?: { displayName?: string } };
  body?: { storage?: { value?: string } };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function pageToCandidate(
  page: ConfluencePage,
  siteUrl: string,
  cloudId: string | null
): ConnectorSourceCandidate {
  const url = page._links?.webui ? `${siteUrl}/wiki${page._links.webui}` : siteUrl;
  return {
    sourceType: "confluence",
    sourceExternalId: page.id,
    title: page.title,
    author: page.version?.by?.displayName ?? null,
    sourceDate: page.version?.when ?? new Date().toISOString(),
    url,
    body: [
      `Space: ${page.space?.key ?? "unknown"}`,
      `URL: ${url}`,
      "",
      stripHtml(page.body?.storage?.value ?? ""),
    ].join("\n"),
    metadata: {
      cloudId,
      spaceKey: page.space?.key ?? null,
      status: page.status,
      pageId: page.id,
    },
  };
}

async function fetchPageById(pageId: string): Promise<ConnectorSourceCandidate> {
  const context = await getAtlassianContext("confluence");
  const url = new URL(`${context.baseUrl}/wiki/rest/api/content/${pageId}`);
  url.searchParams.set("expand", "body.storage,version,space");
  const response = await context.fetch(url.toString());
  const page = (await response.json()) as ConfluencePage & { message?: string };
  if (!response.ok) throw new Error(page.message ?? `Could not import Confluence page ${pageId}.`);
  return pageToCandidate(page, context.siteUrl, context.cloudId);
}

function pageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/) ?? url.match(/[?&]pageId=(\d+)/);
  return match?.[1] ?? null;
}

function confluenceDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function isUpdatedSince(sourceDate: string, sinceIso: string | undefined): boolean {
  if (!sinceIso) return true;
  return Date.parse(sourceDate) >= Date.parse(sinceIso);
}

export async function fetchConfluencePageIfUpdated(
  pageId: string,
  updatedSinceIso?: string
): Promise<ConnectorSourceCandidate[]> {
  const page = await fetchPageById(pageId);
  if (!isUpdatedSince(page.sourceDate, updatedSinceIso)) return [];
  return [page];
}

export async function fetchConfluenceSpacePages(input: {
  spaceKey: string;
  updatedSinceIso?: string;
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const context = await getAtlassianContext("confluence");
  const candidates: ConnectorSourceCandidate[] = [];
  let start = 0;
  const limit = 25;
  const maxResults = input.maxResults ?? 50;

  while (candidates.length < maxResults) {
    const url = new URL(`${context.baseUrl}/wiki/rest/api/content/search`);
    const cql = input.updatedSinceIso
      ? `space = "${input.spaceKey}" AND type = page AND lastModified >= "${confluenceDateFromIso(input.updatedSinceIso)}"`
      : `space = "${input.spaceKey}" AND type = page`;
    url.searchParams.set("cql", cql);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(start));
    url.searchParams.set("expand", "body.storage,version,space");

    const response = await context.fetch(url.toString());
    const body = (await response.json()) as ConfluenceContentResponse & { size?: number };
    if (!response.ok) throw new Error(body.message ?? `Could not import space ${input.spaceKey}.`);
    const batch = body.results ?? [];
    candidates.push(
      ...batch.map((page) => pageToCandidate(page, context.siteUrl, context.cloudId))
    );
    if (batch.length < limit) break;
    start += batch.length;
  }

  return candidates.slice(0, maxResults);
}

export async function fetchConfluencePages(input: {
  spaceKeys?: string[];
  pageUrls?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const candidates: ConnectorSourceCandidate[] = [];
  const pageIds = (input.pageUrls ?? []).map(pageIdFromUrl).filter((id): id is string => id != null);
  for (const pageId of pageIds) {
    candidates.push(await fetchPageById(pageId));
  }

  if (!input.spaceKeys || input.spaceKeys.length === 0) return candidates;

  const context = await getAtlassianContext("confluence");
  for (const spaceKey of input.spaceKeys) {
    const url = new URL(`${context.baseUrl}/wiki/rest/api/content`);
    url.searchParams.set("type", "page");
    url.searchParams.set("status", "current");
    url.searchParams.set("spaceKey", spaceKey);
    url.searchParams.set("limit", String(input.maxResults ?? 20));
    url.searchParams.set("expand", "body.storage,version,space");

    const response = await context.fetch(url.toString());
    const body = (await response.json()) as ConfluenceContentResponse;
    if (!response.ok) throw new Error(body.message ?? `Could not import space ${spaceKey}.`);
    candidates.push(
      ...(body.results ?? []).map((page) => pageToCandidate(page, context.siteUrl, context.cloudId))
    );
  }

  return candidates;
}
