import "server-only";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { DEFAULT_JIRA_JQL } from "@/lib/connectors/jira";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import { callMcpTool, withMcpClient } from "../client";
import { asArray, asRecord, parseMcpToolPayload } from "../parse";
import { jiraIssueToCandidate, textFromUnknown } from "./jiraIssueCandidate";

const APP_ORIGIN = process.env.WORKLIGHT_APP_URL?.trim() || "http://localhost:3000";

/** Every field `jiraIssueToCandidate` reads. Keep in sync with the REST transport. */
const JIRA_ISSUE_FIELDS = [
  "summary",
  "description",
  "status",
  "priority",
  "assignee",
  "reporter",
  "duedate",
  "updated",
  "comment",
];

export interface JiraProjectSnapshot {
  key: string;
  name: string;
  id: string;
  siteName: string | null;
}

interface AtlassianResource {
  id: string;
  name?: string;
  url?: string;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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

function parseToolPayload(result: unknown): unknown {
  return parseMcpToolPayload(result);
}

async function getDefaultCloud(client: Client): Promise<AtlassianResource> {
  const raw = await callMcpTool(client, "getAccessibleAtlassianResources", {});
  const payload = parseToolPayload(raw);
  const resources = asArray(payload).map(asRecord).filter((item): item is Record<string, unknown> => !!item);
  if (resources.length === 0) {
    const nested = asRecord(payload);
    const nestedResources = asArray(nested?.resources ?? nested?.sites)
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => !!item);
    if (nestedResources.length > 0) {
      const first = nestedResources[0];
      return {
        id: String(first.id ?? first.cloudId ?? ""),
        name: typeof first.name === "string" ? first.name : undefined,
        url: typeof first.url === "string" ? first.url : undefined,
      };
    }
    throw new Error("No accessible Atlassian Cloud sites found for this account.");
  }
  const first = resources[0];
  return {
    id: String(first.id ?? first.cloudId ?? ""),
    name: typeof first.name === "string" ? first.name : undefined,
    url: typeof first.url === "string" ? first.url : undefined,
  };
}

function confluencePageToCandidate(
  page: Record<string, unknown>,
  cloud: AtlassianResource
): ConnectorSourceCandidate | null {
  const id = String(page.id ?? page.pageId ?? "");
  const title = String(page.title ?? "Untitled page");
  if (!id) return null;
  const space = asRecord(page.space);
  const version = asRecord(page.version);
  const versionBy = asRecord(version?.by);
  const body = asRecord(page.body);
  const storage = asRecord(body?.storage);
  const siteUrl = cloud.url ?? "https://atlassian.net";
  const links = asRecord(page._links);
  const url =
    typeof links?.webui === "string"
      ? `${siteUrl}/wiki${links.webui}`
      : typeof page.url === "string"
        ? page.url
        : siteUrl;

  return {
    sourceType: "confluence",
    sourceExternalId: id,
    title,
    author: typeof versionBy?.displayName === "string" ? versionBy.displayName : null,
    sourceDate:
      typeof version?.when === "string" ? version.when : new Date().toISOString(),
    url,
    body: [
      `Space: ${typeof space?.key === "string" ? space.key : "unknown"}`,
      `URL: ${url}`,
      "",
      stripHtml(
        typeof storage?.value === "string"
          ? storage.value
          : textFromUnknown(page.body ?? page.content)
      ),
    ].join("\n"),
    metadata: {
      cloudId: cloud.id,
      spaceKey: typeof space?.key === "string" ? space.key : null,
      pageId: id,
      transport: "mcp",
    },
  };
}

export async function fetchJiraIssuesViaMcp(input?: {
  jql?: string;
  projectJiraKeys?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  return withMcpClient("atlassian", APP_ORIGIN, async (client) => {
    const cloud = await getDefaultCloud(client);
    const baseJql = input?.jql?.trim() || DEFAULT_JIRA_JQL;
    const keyClause =
      input?.projectJiraKeys && input.projectJiraKeys.length > 0
        ? ` AND project in (${input.projectJiraKeys.map((key) => `"${key}"`).join(", ")})`
        : "";
    const jql = keyClause ? baseJql.replace(" ORDER BY", `${keyClause} ORDER BY`) : baseJql;

    const raw = await callMcpTool(client, "searchJiraIssuesUsingJql", {
      cloudId: cloud.id,
      jql,
      maxResults: input?.maxResults ?? 50,
      // Must be explicit: the tool's default field set omits `comment` and
      // `duedate`, so without this every issue imported as
      // "Comments: (none) / Due date: none" and any link a teammate left in a
      // comment never entered the app. Mirrors the REST transport's field list.
      fields: JIRA_ISSUE_FIELDS,
      responseContentFormat: "markdown",
    });
    const payload = parseToolPayload(raw);
    const record = asRecord(payload);
    const issues = asArray(record?.issues ?? record?.values ?? payload)
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => !!item);

    return issues
      .map((issue) => jiraIssueToCandidate(issue, cloud))
      .filter((item): item is ConnectorSourceCandidate => item != null);
  });
}

export async function fetchConfluencePagesViaMcp(input: {
  spaceKeys?: string[];
  pageUrls?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  return withMcpClient("atlassian", APP_ORIGIN, async (client) => {
    const cloud = await getDefaultCloud(client);
    const candidates: ConnectorSourceCandidate[] = [];
    const pageIds = (input.pageUrls ?? [])
      .map((url) => url.match(/\/pages\/(\d+)/)?.[1] ?? url.match(/[?&]pageId=(\d+)/)?.[1] ?? null)
      .filter((id): id is string => id != null);

    for (const pageId of pageIds) {
      const raw = await callMcpTool(client, "getConfluencePage", {
        cloudId: cloud.id,
        pageId,
      });
      const payload = parseToolPayload(raw);
      const page = asRecord(payload) ?? asRecord(asRecord(payload)?.page);
      if (page) {
        const candidate = confluencePageToCandidate(page, cloud);
        if (candidate) candidates.push(candidate);
      }
    }

    const spaceKeys = unique(input.spaceKeys ?? []);
    if (spaceKeys.length === 0) return candidates;

    const spacesRaw = await callMcpTool(client, "getConfluenceSpaces", { cloudId: cloud.id });
    const spacesPayload = parseToolPayload(spacesRaw);
    const spacesRecord = asRecord(spacesPayload);
    const spaces = asArray(spacesRecord?.results ?? spacesRecord?.spaces ?? spacesPayload)
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => !!item);

    for (const spaceKey of spaceKeys) {
      const space = spaces.find(
        (item) => item.key === spaceKey || item.spaceKey === spaceKey
      );
      const spaceId = space ? String(space.id ?? space.spaceId ?? "") : "";
      const raw = spaceId
        ? await callMcpTool(client, "getPagesInConfluenceSpace", {
            cloudId: cloud.id,
            spaceId,
            limit: input.maxResults ?? 20,
          })
        : await callMcpTool(client, "searchConfluenceUsingCql", {
            cloudId: cloud.id,
            cql: `space = "${spaceKey}" AND type = page ORDER BY lastmodified DESC`,
            limit: input.maxResults ?? 20,
          });
      const payload = parseToolPayload(raw);
      const record = asRecord(payload);
      const pages = asArray(record?.results ?? record?.pages ?? payload)
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => !!item);
      for (const page of pages) {
        const candidate = confluencePageToCandidate(page, cloud);
        if (candidate) candidates.push(candidate);
      }
    }

    return candidates;
  });
}

export async function fetchVisibleJiraProjectsViaMcp(): Promise<JiraProjectSnapshot[]> {
  return withMcpClient("atlassian", APP_ORIGIN, async (client) => {
    const cloud = await getDefaultCloud(client);
    const raw = await callMcpTool(client, "getVisibleJiraProjects", { cloudId: cloud.id });
    const payload = parseToolPayload(raw);
    const record = asRecord(payload);
    const values = asArray(record?.values ?? record?.projects ?? payload)
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => !!item);

    return values
      .map((project) => {
        const key = typeof project.key === "string" ? project.key : "";
        if (!key) return null;
        return {
          key,
          name: typeof project.name === "string" ? project.name : key,
          id: String(project.id ?? ""),
          siteName: cloud.name ?? null,
        };
      })
      .filter((item): item is JiraProjectSnapshot => item != null);
  });
}

export async function fetchAssignedJiraProjectKeysViaMcp(): Promise<Set<string>> {
  const issues = await fetchJiraIssuesViaMcp({ maxResults: 50 });
  const keys = new Set<string>();
  for (const issue of issues) {
    const key =
      typeof issue.metadata?.key === "string"
        ? issue.metadata.key
        : issue.sourceExternalId;
    const match = key.match(/^([A-Z][A-Z0-9]+)-\d+$/);
    if (match?.[1]) keys.add(match[1]);
  }
  return keys;
}

export async function fetchJiraIssuesForProjectKeys(
  jiraKeys: string[],
  maxResults = 30
): Promise<ConnectorSourceCandidate[]> {
  if (jiraKeys.length === 0) return [];
  return fetchJiraIssuesViaMcp({ projectJiraKeys: jiraKeys, maxResults });
}

/** Depth-1 read-only fetch for a single issue key (linked evidence). */
export async function fetchJiraIssueByKeyViaMcp(
  issueKey: string
): Promise<ConnectorSourceCandidate | null> {
  const key = issueKey.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) return null;
  const issues = await fetchJiraIssuesViaMcp({
    jql: `key = ${key}`,
    maxResults: 1,
  });
  return issues[0] ?? null;
}
