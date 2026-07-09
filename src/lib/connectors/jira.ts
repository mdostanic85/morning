import "server-only";
import { bearerFetch } from "./auth";
import { getDefaultAtlassianResource } from "./atlassian";
import { cleanJiraText } from "@/lib/connectors/jiraText";
import type { ConnectorSourceCandidate } from "./types";

export const DEFAULT_JIRA_JQL =
  "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

interface JiraIssue {
  key: string;
  self: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name?: string };
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

export async function fetchAssignedJiraIssues(input?: {
  jql?: string;
  projectJiraKeys?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const resource = await getDefaultAtlassianResource("jira");
  const baseJql = input?.jql?.trim() || DEFAULT_JIRA_JQL;
  const keyClause =
    input?.projectJiraKeys && input.projectJiraKeys.length > 0
      ? ` AND project in (${input.projectJiraKeys.map((key) => `"${key}"`).join(", ")})`
      : "";
  const jql = keyClause ? baseJql.replace(" ORDER BY", `${keyClause} ORDER BY`) : baseJql;
  const response = await bearerFetch(
    "jira",
    `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql,
        maxResults: input?.maxResults ?? 25,
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

  return (body.issues ?? []).map((issue) => {
    const comments = issue.fields.comment?.comments ?? [];
    const url = `${resource.url}/browse/${issue.key}`;
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
        priority: issue.fields.priority?.name ?? null,
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        dueDate: issue.fields.duedate ?? null,
        updated: issue.fields.updated ?? null,
      },
    };
  });
}
