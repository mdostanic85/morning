import "server-only";
import { getAtlassianContext } from "./atlassian";
import { cleanJiraText } from "@/lib/connectors/jiraText";
import type { ConnectorSourceCandidate } from "./types";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";
import { buildJiraUpdatedClause } from "@/lib/imports/providerCursorUtils";
import { assignmentEvidenceFromJiraChangelog } from "./jiraAssignmentEvidence";

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
    created?: string;
    updated?: string;
    labels?: string[];
    comment?: { comments?: { author?: { displayName?: string }; body?: unknown; created?: string }[] };
  };
  changelog?: {
    histories?: {
      created?: string;
      items?: {
        field?: string;
        fromString?: string | null;
        toString?: string | null;
      }[];
    }[];
  };
}

interface JiraSearchResponse {
  issues?: JiraIssue[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  errorMessages?: string[];
}

/**
 * ADF node types that live inside a line of prose. Their text must stay on that
 * line: "@Milos can you check the contract?" only reads as an address to Milos
 * while the mention and the question share a sentence.
 */
const ADF_INLINE_TYPES = new Set([
  "text",
  "mention",
  "emoji",
  "inlineCard",
  "status",
  "date",
  "hardBreak",
]);

function adfNodeType(value: unknown): string {
  if (typeof value !== "object" || value == null) return "";
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" ? type : "";
}

/** The display name carried by an ADF mention node, e.g. "@Milos Dostanic". */
function adfMentionText(value: unknown): string | null {
  if (adfNodeType(value) !== "mention") return null;
  const attrs = (value as { attrs?: { text?: unknown } }).attrs;
  const text = typeof attrs?.text === "string" ? attrs.text.trim() : "";
  return text || null;
}

function stringifyAdf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    // Inline runs are concatenated; block nodes stay on separate lines.
    const separator = value.every((entry) => ADF_INLINE_TYPES.has(adfNodeType(entry))) ? "" : "\n";
    return value.map(stringifyAdf).filter(Boolean).join(separator);
  }
  if (typeof value === "object") {
    // Mentions keep their name in `attrs.text` and have no `text` of their own,
    // so without this branch every @mention silently vanished from the body —
    // and with it the only proof that an issue was pointed at the user.
    const mention = adfMentionText(value);
    if (mention) return mention;

    const node = value as { text?: unknown; content?: unknown };
    return [typeof node.text === "string" ? node.text : "", stringifyAdf(node.content)]
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

/** Every @mention in an ADF tree, in document order, without the "@" prefix. */
function collectAdfMentions(value: unknown): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    const mention = adfMentionText(node);
    if (mention) found.push(mention.replace(/^@/, "").trim());
    walk((node as { content?: unknown }).content);
  };

  walk(value);
  return Array.from(new Set(found.filter(Boolean)));
}

const RECENTLY_DONE_JQL =
  "statusCategory = Done AND updated >= -2d ORDER BY updated DESC";

export async function fetchRecentlyDoneJiraIssues(input?: {
  projectJiraKeys?: string[];
  maxResults?: number;
}): Promise<ConnectorSourceCandidate[]> {
  const context = await getAtlassianContext("jira");
  const keyClause =
    input?.projectJiraKeys && input.projectJiraKeys.length > 0
      ? `project in (${input.projectJiraKeys.map((key) => `"${key}"`).join(", ")}) AND `
      : "";
  const jql = `${keyClause}${RECENTLY_DONE_JQL}`;
  const response = await context.fetch(`${context.baseUrl}/rest/api/3/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jql,
      maxResults: input?.maxResults ?? 25,
      fields: ["summary", "status", "assignee", "reporter", "updated"],
    }),
  });
  const body = (await response.json()) as JiraSearchResponse;
  if (!response.ok) {
    throw new Error(body.errorMessages?.join("; ") || "Jira done-issue search failed.");
  }

  return (body.issues ?? []).map((issue) => {
    const url = `${context.siteUrl}/browse/${issue.key}`;
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
        cloudId: context.cloudId,
        siteName: context.siteName,
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
  const context = await getAtlassianContext("jira");
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

    const response = await context.fetch(`${context.baseUrl}/rest/api/3/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jql,
        startAt,
        maxResults: Math.min(JIRA_PAGE_SIZE, maxResults - issues.length),
        expand: ["changelog"],
        fields: [
          "summary",
          "description",
          "status",
          "priority",
          "assignee",
          "reporter",
          "duedate",
          "created",
          "updated",
          "labels",
          "comment",
        ],
      }),
    });
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
    const url = `${context.siteUrl}/browse/${issue.key}`;
    const commentUpdatedAts = comments
      .map((comment) => comment.created)
      .filter((value): value is string => Boolean(value));
    const assignmentEvidence = assignmentEvidenceFromJiraChangelog(
      issue.changelog,
      issue.fields.assignee?.displayName
    );
    const labels = (issue.fields.labels ?? []).filter(
      (label): label is string => typeof label === "string" && label.trim().length > 0
    );
    // Mentions are collected structurally rather than regexed out of the body,
    // so an issue that names the user in a comment can be recognised as pointed
    // at them even when someone else is the assignee.
    const mentions = Array.from(
      new Set([
        ...collectAdfMentions(issue.fields.description),
        ...comments.flatMap((comment) => collectAdfMentions(comment.body)),
      ])
    );
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
        `Labels: ${labels.length > 0 ? labels.join(", ") : "none"}`,
        `Mentions: ${mentions.length > 0 ? mentions.join(", ") : "none"}`,
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
        cloudId: context.cloudId,
        siteName: context.siteName,
        key: issue.key,
        status: issue.fields.status?.name ?? null,
        statusCategoryKey: issue.fields.status?.statusCategory?.key ?? null,
        priority: issue.fields.priority?.name ?? null,
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        dueDate: issue.fields.duedate ?? null,
        // `created` is what separates a genuinely new assignment from a
        // comment that merely bumped `updated` on work already owned.
        created: issue.fields.created ?? null,
        updated: issue.fields.updated ?? null,
        ...(assignmentEvidence ?? {}),
        commentUpdatedAts,
        labels,
        mentions,
        involvement: "assignee",
      },
    };
  });
}
