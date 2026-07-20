import "server-only";
import { bearerFetch } from "./auth";
import { getDefaultAtlassianResource } from "./atlassian";
import { cleanJiraText } from "@/lib/connectors/jiraText";
import type { ConnectorSourceCandidate } from "./types";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";
import { buildJiraUpdatedClause } from "@/lib/imports/providerCursorUtils";

const JIRA_PAGE_SIZE = 50;

/** Issues assigned to the current user in any column/status. */
export const DEFAULT_JIRA_JQL = "assignee = currentUser() ORDER BY updated DESC";

function escapeJqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** All issues where you are the assignee — Done included (queue still skips Done). */
export function buildAssigneeJiraJql(): string {
  return DEFAULT_JIRA_JQL;
}

/** Open assignee issues only — used for pending/status snapshots. */
export function buildOpenAssigneeJiraJql(): string {
  return "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";
}

/**
 * Issues that mention you in text/comments but are not assigned to you.
 * Requires a display name for JQL text search.
 */
export function buildMentionedJiraJql(displayName?: string | null): string | null {
  const name = displayName?.trim();
  if (!name) return null;
  const safe = escapeJqlString(name);
  return (
    `(assignee != currentUser() OR assignee is EMPTY)` +
    ` AND (text ~ "${safe}" OR comment ~ "${safe}")` +
    ` AND updated >= -21d ORDER BY updated DESC`
  );
}

/** @deprecated Prefer buildAssigneeJiraJql / buildMentionedJiraJql. */
export function buildPersonalJiraJql(_displayName?: string | null): string {
  return buildAssigneeJiraJql();
}

interface JiraIssue {
  key: string;
  self: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string; statusCategory?: { key?: string; name?: string } };
    priority?: { name?: string };
    assignee?: { displayName?: string; emailAddress?: string };
    reporter?: { displayName?: string; emailAddress?: string };
    duedate?: string | null;
    updated?: string;
    comment?: { comments?: { author?: { displayName?: string }; body?: unknown; created?: string }[] };
  };
}

interface JiraSearchResponse {
  issues?: JiraIssue[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  errorMessages?: string[];
}

function stringifyAdf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(stringifyAdf).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const node = value as { text?: unknown; content?: unknown };
    return [typeof node.text === "string" ? node.text : "", stringifyAdf(node.content)]
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

const RECENTLY_DONE_JQL =
  "statusCategory = Done AND updated >= -2d ORDER BY updated DESC";

export async function fetchRecentlyDoneJiraIssues(input?: {
  projectJiraKeys?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const resource = await getDefaultAtlassianResource("jira");
  const keyClause =
    input?.projectJiraKeys && input.projectJiraKeys.length > 0
      ? `project in (${input.projectJiraKeys.map((key) => `"${key}"`).join(", ")}) AND `
      : "";
  const jql = `${keyClause}${RECENTLY_DONE_JQL}`;
  const response = await bearerFetch(
    "jira",
    `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql,
        maxResults: input?.maxResults ?? 25,
        fields: ["summary", "status", "assignee", "reporter", "updated"],
      }),
    }
  );
  const body = (await response.json()) as JiraSearchResponse;
  if (!response.ok) {
    throw new Error(body.errorMessages?.join("; ") || "Jira done-issue search failed.");
  }

  return (body.issues ?? []).map((issue) => {
    const url = `${resource.url}/browse/${issue.key}`;
    const status = issue.fields.status?.name ?? "Done";
    return {
      sourceType: "jira",
      sourceExternalId: issue.key,
      title: `${issue.key}: ${issue.fields.summary ?? "Untitled issue"}`,
      author: issue.fields.reporter?.displayName ?? null,
      sourceDate: issue.fields.updated ?? new Date().toISOString(),
      url,
      body: [
        `Key: ${issue.key}`,
        `URL: ${url}`,
        `Status: ${status}`,
        `Assignee: ${issue.fields.assignee?.displayName ?? "unknown"}`,
        `Reporter: ${issue.fields.reporter?.displayName ?? "unknown"}`,
      ].join("\n"),
      metadata: {
        cloudId: resource.id,
        siteName: resource.name,
        key: issue.key,
        status,
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        updated: issue.fields.updated ?? null,
      },
    };
  });
}

export async function fetchAssignedJiraIssues(input?: {
  jql?: string;
  projectJiraKeys?: string[];
  maxResults?: number;
  updatedSinceIso?: string;
  shouldCancel?: ShouldCancelSync;
}): Promise<ConnectorSourceCandidate[]> {
  const resource = await getDefaultAtlassianResource("jira");
  const baseJql = input?.jql?.trim() || DEFAULT_JIRA_JQL;
  const keyClause =
    input?.projectJiraKeys && input.projectJiraKeys.length > 0
      ? ` AND project in (${input.projectJiraKeys.map((key) => `"${key}"`).join(", ")})`
      : "";
  const updatedClause = input?.updatedSinceIso
    ? ` AND ${buildJiraUpdatedClause(input.updatedSinceIso)}`
    : "";
  const jql = (keyClause || updatedClause)
    ? baseJql.replace(" ORDER BY", `${keyClause}${updatedClause} ORDER BY`)
    : baseJql;

  const maxResults = input?.maxResults ?? JIRA_PAGE_SIZE;
  const issues: JiraIssue[] = [];
  let startAt = 0;

  while (issues.length < maxResults) {
    if (input?.shouldCancel && (await input.shouldCancel())) break;

    const response = await bearerFetch(
      "jira",
      `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql,
          startAt,
          maxResults: Math.min(JIRA_PAGE_SIZE, maxResults - issues.length),
          fields: [
            "summary",
            "description",
            "status",
            "priority",
            "assignee",
            "reporter",
            "duedate",
            "updated",
            "comment",
          ],
        }),
      }
    );
    const body = (await response.json()) as JiraSearchResponse;
    if (!response.ok) {
      throw new Error(body.errorMessages?.join("; ") || "Jira issue search failed.");
    }

    const batch = body.issues ?? [];
    issues.push(...batch);
    const total = body.total ?? issues.length;
    startAt += batch.length;
    if (batch.length === 0 || startAt >= total) break;
  }

  return issues.map((issue) => {
    const comments = issue.fields.comment?.comments ?? [];
    const url = `${resource.url}/browse/${issue.key}`;
    const commentUpdatedAts = comments
      .map((comment) => comment.created)
      .filter((value): value is string => Boolean(value));
    return {
      sourceType: "jira",
      sourceExternalId: issue.key,
      title: `${issue.key}: ${issue.fields.summary ?? "Untitled issue"}`,
      author: issue.fields.reporter?.displayName ?? null,
      sourceDate: issue.fields.updated ?? new Date().toISOString(),
      url,
      body: [
        `Key: ${issue.key}`,
        `URL: ${url}`,
        `Status: ${issue.fields.status?.name ?? "unknown"}`,
        `Priority: ${issue.fields.priority?.name ?? "unknown"}`,
        `Assignee: ${issue.fields.assignee?.displayName ?? "unknown"}`,
        `Reporter: ${issue.fields.reporter?.displayName ?? "unknown"}`,
        `Due date: ${issue.fields.duedate ?? "none"}`,
        "",
        "Description:",
        cleanJiraText(stringifyAdf(issue.fields.description)) || "(empty)",
        "",
        "Comments:",
        comments
          .map(
            (comment) =>
              `- ${comment.author?.displayName ?? "unknown"} (${comment.created ?? "unknown"}): ${stringifyAdf(comment.body)}`
          )
          .join("\n") || "(none)",
      ].join("\n"),
      metadata: {
        cloudId: resource.id,
        siteName: resource.name,
        key: issue.key,
        status: issue.fields.status?.name ?? null,
        statusCategoryKey: issue.fields.status?.statusCategory?.key ?? null,
        priority: issue.fields.priority?.name ?? null,
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        dueDate: issue.fields.duedate ?? null,
        updated: issue.fields.updated ?? null,
        commentUpdatedAts,
        involvement: "assignee",
      },
    };
  });
}
