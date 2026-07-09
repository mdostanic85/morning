import "server-only";
import { bearerFetch } from "./auth";
import { getDefaultAtlassianResource } from "./atlassian";
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

function pageToCandidate(page: ConfluencePage, siteUrl: string, cloudId: string): ConnectorSourceCandidate {
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
  const resource = await getDefaultAtlassianResource("confluence");
  const url = new URL(
    `https://api.atlassian.com/ex/confluence/${resource.id}/wiki/rest/api/content/${pageId}`
  );
  url.searchParams.set("expand", "body.storage,version,space");
  const response = await bearerFetch("confluence", url.toString());
  const page = (await response.json()) as ConfluencePage & { message?: string };
  if (!response.ok) throw new Error(page.message ?? `Could not import Confluence page ${pageId}.`);
  return pageToCandidate(page, resource.url, resource.id);
}

function pageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/) ?? url.match(/[?&]pageId=(\d+)/);
  return match?.[1] ?? null;
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

  const resource = await getDefaultAtlassianResource("confluence");
  for (const spaceKey of input.spaceKeys) {
    const url = new URL(
      `https://api.atlassian.com/ex/confluence/${resource.id}/wiki/rest/api/content`
    );
    url.searchParams.set("type", "page");
    url.searchParams.set("status", "current");
    url.searchParams.set("spaceKey", spaceKey);
    url.searchParams.set("limit", String(input.maxResults ?? 20));
    url.searchParams.set("expand", "body.storage,version,space");

    const response = await bearerFetch("confluence", url.toString());
    const body = (await response.json()) as ConfluenceContentResponse;
    if (!response.ok) throw new Error(body.message ?? `Could not import space ${spaceKey}.`);
    candidates.push(
      ...(body.results ?? []).map((page) => pageToCandidate(page, resource.url, resource.id))
    );
  }

  return candidates;
}
