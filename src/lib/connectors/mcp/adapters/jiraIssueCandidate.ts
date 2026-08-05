/**
 * Pure shaping of a Jira issue payload into a connector source candidate.
 *
 * Split from the authenticated MCP fetch so the body layout — in particular
 * that comments actually land in it — can be unit-tested against a recorded
 * API payload without a token. The comment section is load-bearing: links to
 * the real deliverable (a pinned Figma frame, a PR) are usually left in a
 * comment rather than in the description.
 */

import { cleanJiraText } from "@/lib/connectors/jiraText";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import { assignmentEvidenceFromJiraChangelog } from "@/lib/connectors/jiraAssignmentEvidence";

// Local rather than imported from `../parse`, which is server-only: this module
// must stay importable from a plain unit test.
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface JiraCloudRef {
  id: string;
  name?: string;
  url?: string;
}

export function textFromUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join("\n");
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.content)) return textFromUnknown(record.content);
  return JSON.stringify(record, null, 2);
}

export function jiraIssueToCandidate(
  issue: Record<string, unknown>,
  cloud: JiraCloudRef
): ConnectorSourceCandidate | null {
  const key = String(issue.key ?? issue.issueKey ?? "");
  if (!key) return null;
  const fields = asRecord(issue.fields) ?? issue;
  const summary = String(fields.summary ?? issue.summary ?? "Untitled issue");
  const status = asRecord(fields.status);
  const priority = asRecord(fields.priority);
  const assignee = asRecord(fields.assignee);
  const reporter = asRecord(fields.reporter);
  const currentAssignee =
    typeof assignee?.displayName === "string" ? assignee.displayName : null;
  const assignmentEvidence = assignmentEvidenceFromJiraChangelog(
    issue.changelog,
    currentAssignee
  );
  const siteUrl = cloud.url ?? "https://atlassian.net";
  const url = `${siteUrl}/browse/${key}`;
  // Some tools return comments under `fields.comment.comments`, others hoist
  // them to the top level of the issue — accept both.
  const comments = [
    ...asArray(asRecord(fields.comment)?.comments),
    ...asArray(issue.comments),
  ]
    .map(asRecord)
    .filter((item): item is Record<string, unknown> => !!item);
  const byCommentId = new Map(
    comments.map((comment) => [String(comment.id ?? Math.random()), comment])
  );

  return {
    sourceType: "jira",
    sourceExternalId: key,
    title: `${key}: ${summary}`,
    author: typeof reporter?.displayName === "string" ? reporter.displayName : null,
    sourceDate:
      typeof fields.updated === "string" ? fields.updated : new Date().toISOString(),
    url,
    body: [
      `Key: ${key}`,
      `URL: ${url}`,
      `Status: ${typeof status?.name === "string" ? status.name : "unknown"}`,
      `Priority: ${typeof priority?.name === "string" ? priority.name : "unknown"}`,
      `Assignee: ${currentAssignee ?? "unknown"}`,
      `Reporter: ${typeof reporter?.displayName === "string" ? reporter.displayName : "unknown"}`,
      `Due date: ${typeof fields.duedate === "string" ? fields.duedate : "none"}`,
      "",
      "Description:",
      cleanJiraText(textFromUnknown(fields.description)) || "(empty)",
      "",
      "Comments:",
      Array.from(byCommentId.values())
        .map((comment) => {
          const author = asRecord(comment.author);
          const who =
            typeof author?.displayName === "string" ? author.displayName : "unknown";
          const when = typeof comment.created === "string" ? comment.created : "unknown";
          // Cleaned like the description: smart-link and mention markup would
          // otherwise land verbatim. Markdown links survive, so a Figma or PR
          // URL left in a comment stays extractable.
          return `- ${who} (${when}): ${cleanJiraText(textFromUnknown(comment.body))}`;
        })
        .join("\n") || "(none)",
    ].join("\n"),
    metadata: {
      cloudId: cloud.id,
      siteName: cloud.name ?? null,
      key,
      status: typeof status?.name === "string" ? status.name : "unknown",
      statusCategoryKey:
        typeof asRecord(status?.statusCategory)?.key === "string"
          ? (asRecord(status?.statusCategory)?.key as string)
          : null,
      priority: typeof priority?.name === "string" ? priority.name : null,
      assignee: currentAssignee,
      // `created` is what separates a genuinely new assignment from a comment
      // that merely bumped `updated` on work already owned.
      created: typeof fields.created === "string" ? fields.created : null,
      updated: typeof fields.updated === "string" ? fields.updated : null,
      ...(assignmentEvidence ?? {}),
      transport: "mcp",
      involvement: "assignee",
    },
  };
}
