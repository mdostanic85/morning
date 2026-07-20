import "server-only";
import { jiraBodyExcerpt, parseJiraBodyFields } from "@/lib/connectors/jiraText";
import { buildOpenAssigneeJiraJql } from "@/lib/connectors/jira";
import { getConnectionByProvider } from "@/services/connections";
import { getActiveProjects } from "@/services/projects";
import { isMcpTransport } from "@/lib/connectors/transport";

export interface JiraPendingSnapshot {
  key: string;
  title: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  dueDate: string | null;
  url: string | null;
  updatedAt: string;
  excerpt: string;
}

export async function fetchJiraPendingSnapshot(maxResults = 20): Promise<JiraPendingSnapshot[]> {
  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected") return [];

  const activeProjects = await getActiveProjects();
  const projectJiraKeys = Array.from(
    new Set(activeProjects.flatMap((project) => project.jiraKeys).filter(Boolean))
  );
  try {
    const jql = buildOpenAssigneeJiraJql();

    if (isMcpTransport(connection)) {
      const { fetchJiraIssuesViaMcp } = await import("@/lib/connectors/mcp/adapters/atlassian");
      const issues = await fetchJiraIssuesViaMcp({
        jql,
        projectJiraKeys: projectJiraKeys.length > 0 ? projectJiraKeys : undefined,
        maxResults,
      });
      return issues.map((issue) => {
        const parsed = parseJiraBodyFields(issue.body);
        return {
          key: issue.sourceExternalId,
          title: issue.title.replace(/^[^:]+:\s*/, ""),
          status:
            typeof issue.metadata?.status === "string" ? issue.metadata.status : parsed.status ?? "unknown",
          priority:
            typeof issue.metadata?.priority === "string" ? issue.metadata.priority : parsed.priority,
          assignee: parsed.assignee,
          dueDate: parsed.dueDate,
          url: issue.url ?? null,
          updatedAt: issue.sourceDate,
          excerpt: jiraBodyExcerpt(issue.body),
        };
      });
    }

    const { fetchAssignedJiraIssues } = await import("@/lib/connectors/jira");
    const issues = await fetchAssignedJiraIssues({
      jql,
      projectJiraKeys: projectJiraKeys.length > 0 ? projectJiraKeys : undefined,
      maxResults,
    });
    return issues.map((issue) => {
      const parsed = parseJiraBodyFields(issue.body);
      return {
        key: issue.sourceExternalId,
        title: issue.title.replace(/^[^:]+:\s*/, ""),
        status:
          typeof issue.metadata?.status === "string" ? issue.metadata.status : parsed.status ?? "unknown",
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

export function jiraPendingFromSourceItems(
  items: {
    sourceType: string;
    sourceExternalId: string | null;
    title: string;
    body: string;
    sourceDate: string;
    url: string | null;
    metadata: Record<string, unknown> | null;
  }[],
  projectJiraKeys: string[] = []
): JiraPendingSnapshot[] {
  const allowedKeys =
    projectJiraKeys.length > 0 ? new Set(projectJiraKeys.map((key) => key.trim())) : null;

  return items
    .filter((item) => item.sourceType === "jira")
    .filter((item) => {
      if (!allowedKeys) return true;
      const match = (item.sourceExternalId ?? "").match(/^([A-Z][A-Z0-9]+)-\d+$/);
      return match?.[1] ? allowedKeys.has(match[1]) : false;
    })
    .slice(0, 20)
    .map((item) => {
      const parsed = parseJiraBodyFields(item.body);
      return {
        key: item.sourceExternalId ?? item.title,
        title: item.title.replace(/^[^:]+:\s*/, ""),
        status:
          typeof item.metadata?.status === "string"
            ? item.metadata.status
            : parsed.status ?? "open",
        priority:
          typeof item.metadata?.priority === "string"
            ? item.metadata.priority
            : parsed.priority,
        assignee: parsed.assignee,
        dueDate: parsed.dueDate,
        url: item.url,
        updatedAt: item.sourceDate,
        excerpt: jiraBodyExcerpt(item.body),
      };
    });
}
