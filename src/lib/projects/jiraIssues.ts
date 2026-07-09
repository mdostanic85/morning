import "server-only";
import { jiraBodyExcerpt, parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { getConnectionByProvider } from "@/services/connections";
import { isMcpTransport } from "@/lib/connectors/transport";
import {
  fetchJiraIssuesForProjectKeys,
  fetchJiraIssuesViaMcp,
} from "@/lib/connectors/mcp/adapters/atlassian";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";

export async function fetchJiraIssuesForProject(
  jiraKeys: string[]
): Promise<JiraPendingSnapshot[]> {
  if (jiraKeys.length === 0) return [];

  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected" || !isMcpTransport(connection)) {
    return [];
  }

  try {
    const issues = await fetchJiraIssuesForProjectKeys(jiraKeys, 40);
    return issues.map((issue) => {
      const parsed = parseJiraBodyFields(issue.body);
      return {
        key: issue.sourceExternalId,
        title: issue.title.replace(/^[^:]+:\s*/, ""),
        status:
          typeof issue.metadata?.status === "string" ? issue.metadata.status : parsed.status ?? "open",
        priority:
          typeof issue.metadata?.priority === "string" ? issue.metadata.priority : parsed.priority,
        assignee: parsed.assignee,
        dueDate: parsed.dueDate,
        url: issue.url ?? null,
        updatedAt: issue.sourceDate,
        excerpt: jiraBodyExcerpt(issue.body),
      };
    });
  } catch {
    return [];
  }
}

function projectKeyFromIssueKey(issueKey: string): string | null {
  const match = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/);
  return match?.[1] ?? null;
}

/** One MCP round-trip — counts open assigned issues per Jira project key. */
export async function countJiraIssuesByProjectKey(): Promise<Map<string, number>> {
  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected" || !isMcpTransport(connection)) {
    return new Map();
  }

  try {
    const issues = await fetchJiraIssuesViaMcp({ maxResults: 100 });
    const counts = new Map<string, number>();
    for (const issue of issues) {
      const projectKey = projectKeyFromIssueKey(issue.sourceExternalId);
      if (!projectKey) continue;
      counts.set(projectKey, (counts.get(projectKey) ?? 0) + 1);
    }
    return counts;
  } catch {
    return new Map();
  }
}

export function countIssuesForProjectKeys(
  jiraKeys: string[],
  countsByKey: Map<string, number>
): number {
  const keys = new Set(jiraKeys);
  let total = 0;
  for (const [key, count] of countsByKey) {
    if (keys.has(key)) total += count;
  }
  return total;
}
