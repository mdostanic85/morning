import "server-only";
import { getConnectionByProvider } from "@/services/connections";
import { getSourceItems } from "@/services/sourceItems";
import { isMcpTransport } from "@/lib/connectors/transport";
import { parseMcpToolPayload } from "@/lib/connectors/mcp/parse";
import type { ProjectDiscoverySignal } from "@/lib/llm/prompts/projectDiscovery";
import type { ConnectionProvider } from "@/lib/connectors/providers";

const RECENT_SOURCE_LIMIT = 40;
const GITHUB_REPO_LIMIT = 30;

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pushSignal(
  signals: ProjectDiscoverySignal[],
  signal: ProjectDiscoverySignal
): void {
  const key = `${signal.source}:${signal.kind}:${signal.label}`;
  if (signals.some((item) => `${item.source}:${item.kind}:${item.label}` === key)) return;
  signals.push(signal);
}

function jiraProjectKeyFromIssueKey(issueKey: string): string | null {
  const match = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/);
  return match?.[1] ?? null;
}

async function gatherJiraSignals(signals: ProjectDiscoverySignal[]): Promise<void> {
  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected") return;

  if (isMcpTransport(connection)) {
    try {
      const { withMcpClient, callMcpTool } = await import("@/lib/connectors/mcp/client");
      const APP_ORIGIN = process.env.WORKLIGHT_APP_URL?.trim() || "http://localhost:3000";
      await withMcpClient("atlassian", APP_ORIGIN, async (client) => {
        const resourcesRaw = parseMcpToolPayload(
          await callMcpTool(client, "getAccessibleAtlassianResources", {})
        );
        const resources = Array.isArray(resourcesRaw) ? resourcesRaw : [];
        const cloud = resources[0] as { id?: string; cloudId?: string } | undefined;
        const cloudId = cloud?.id ?? cloud?.cloudId;
        if (!cloudId) return;

        const projectsRaw = parseMcpToolPayload(
          await callMcpTool(client, "getVisibleJiraProjects", { cloudId })
        );
        const record =
          projectsRaw && typeof projectsRaw === "object" && !Array.isArray(projectsRaw)
            ? (projectsRaw as { values?: unknown[]; projects?: unknown[] })
            : null;
        const list = Array.isArray(projectsRaw)
          ? projectsRaw
          : Array.isArray(record?.values)
            ? record.values
            : Array.isArray(record?.projects)
              ? record.projects
              : [];

        for (const entry of list) {
          const project = entry as { key?: string; name?: string };
          if (project.key) {
            pushSignal(signals, {
              source: "jira",
              kind: "project",
              label: project.key,
              detail: project.name,
            });
          }
        }

        const issuesRaw = parseMcpToolPayload(
          await callMcpTool(client, "searchJiraIssuesUsingJql", {
            cloudId,
            jql: "(assignee = currentUser() OR reporter = currentUser()) AND statusCategory != Done ORDER BY updated DESC",
            maxResults: 15,
          })
        );
        const issuesRecord =
          issuesRaw && typeof issuesRaw === "object" && !Array.isArray(issuesRaw)
            ? (issuesRaw as { issues?: unknown[] })
            : null;
        const issues = Array.isArray(issuesRaw)
          ? issuesRaw
          : Array.isArray(issuesRecord?.issues)
            ? issuesRecord.issues
            : [];
        for (const issue of issues) {
          const row = issue as { key?: string; fields?: { summary?: string } };
          if (!row.key) continue;
          pushSignal(signals, {
            source: "jira",
            kind: "issue",
            label: row.key,
            detail: row.fields?.summary,
          });
        }
      });
    } catch {
      // Fall through to source-item signals.
    }
  } else {
    try {
      const { fetchAssignedJiraIssues } = await import("@/lib/connectors/jira");
      const issues = await fetchAssignedJiraIssues({ maxResults: 15 });
      for (const issue of issues) {
        const key =
          typeof issue.metadata?.key === "string"
            ? issue.metadata.key
            : issue.sourceExternalId;
        pushSignal(signals, {
          source: "jira",
          kind: "issue",
          label: key,
          detail: issue.title,
        });
      }
    } catch {
      // Ignore — source items may still help.
    }
  }
}

async function gatherConfluenceSignals(signals: ProjectDiscoverySignal[]): Promise<void> {
  const connection = await getConnectionByProvider("confluence");
  if (connection?.status !== "connected") return;

  if (isMcpTransport(connection)) {
    try {
      const { withMcpClient, callMcpTool } = await import("@/lib/connectors/mcp/client");
      const APP_ORIGIN = process.env.WORKLIGHT_APP_URL?.trim() || "http://localhost:3000";
      await withMcpClient("atlassian", APP_ORIGIN, async (client) => {
        const resourcesRaw = await callMcpTool(client, "getAccessibleAtlassianResources", {});
        const resources = Array.isArray(resourcesRaw) ? resourcesRaw : [];
        const cloud = resources[0] as { id?: string } | undefined;
        if (!cloud?.id) return;

        const spacesRaw = await callMcpTool(client, "getConfluenceSpaces", { cloudId: cloud.id });
        const payload = spacesRaw as { results?: unknown[] } | unknown[];
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray((payload as { results?: unknown[] }).results)
            ? (payload as { results: unknown[] }).results
            : [];
        for (const entry of list) {
          const space = entry as { key?: string; name?: string };
          if (space.key) {
            pushSignal(signals, {
              source: "confluence",
              kind: "space",
              label: space.key,
              detail: space.name,
            });
          }
        }
      });
    } catch {
      // Ignore.
    }
  }
}

async function gatherGitHubSignals(signals: ProjectDiscoverySignal[]): Promise<void> {
  const connection = await getConnectionByProvider("github");
  if (connection?.status !== "connected") return;

  try {
    const { getConnectionSecret } = await import("@/services/connectionSecrets");
    const { fetchWithTimeout } = await import("@/lib/http");
    const secret = await getConnectionSecret("github");
    const token = secret?.pat ?? secret?.accessToken;
    if (!token) return;

    const response = await fetchWithTimeout(
      `https://api.github.com/user/repos?per_page=${GITHUB_REPO_LIMIT}&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!response.ok) return;
    const repos = (await response.json()) as { full_name?: string; description?: string }[];
    for (const repo of repos) {
      if (!repo.full_name) continue;
      pushSignal(signals, {
        source: "github",
        kind: "repository",
        label: repo.full_name,
        detail: repo.description ?? undefined,
      });
    }
  } catch {
    // Ignore.
  }
}

export async function gatherProjectSignals(
  connectedProviders: ConnectionProvider[]
): Promise<ProjectDiscoverySignal[]> {
  const signals: ProjectDiscoverySignal[] = [];

  const sourceItems = await getSourceItems();
  for (const item of sourceItems.slice(0, RECENT_SOURCE_LIMIT)) {
    if (item.sourceType === "calendar") continue;
    pushSignal(signals, {
      source: item.sourceType,
      kind: "imported_source",
      label: item.title,
      detail: item.body.slice(0, 280),
    });

    if (item.sourceType === "jira") {
      const key =
        typeof item.metadata?.key === "string"
          ? item.metadata.key
          : item.sourceExternalId ?? "";
      const projectKey = jiraProjectKeyFromIssueKey(key);
      if (projectKey) {
        pushSignal(signals, {
          source: "jira",
          kind: "project_key",
          label: projectKey,
          detail: item.title,
        });
      }
    }

    if (item.sourceType === "confluence") {
      const spaceKey =
        typeof item.metadata?.spaceKey === "string" ? item.metadata.spaceKey : null;
      if (spaceKey) {
        pushSignal(signals, {
          source: "confluence",
          kind: "space",
          label: spaceKey,
          detail: item.title,
        });
      }
    }
  }

  if (connectedProviders.includes("jira")) await gatherJiraSignals(signals);
  if (connectedProviders.includes("confluence")) await gatherConfluenceSignals(signals);
  if (connectedProviders.includes("github")) await gatherGitHubSignals(signals);

  return signals;
}
