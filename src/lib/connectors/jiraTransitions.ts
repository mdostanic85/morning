import "server-only";
import { bearerFetch, getAccessToken } from "@/lib/connectors/auth";
import { getDefaultAtlassianResource, type AtlassianResource } from "@/lib/connectors/atlassian";
import { isMcpTransport } from "@/lib/connectors/transport";
import { readMcpOAuthState } from "@/lib/connectors/mcp/oauthProvider";
import { getConnectionByProvider } from "@/services/connections";
import { fetchWithTimeout } from "@/lib/http";

export interface JiraTransitionOption {
  id: string;
  name: string;
  toStatus: string;
}

export interface JiraIssueStatusSnapshot {
  key: string;
  status: string;
  transitions: JiraTransitionOption[];
}

async function getAtlassianBearerToken(): Promise<string> {
  const jiraConnection = await getConnectionByProvider("jira");
  if (jiraConnection?.status === "connected" && !isMcpTransport(jiraConnection)) {
    return getAccessToken("jira");
  }

  const mcpToken = (await readMcpOAuthState("atlassian")).tokens?.access_token;
  if (mcpToken) return mcpToken;

  throw new Error("Jira is not connected. Connect Atlassian in Settings.");
}

async function getJiraCloudResource(): Promise<AtlassianResource> {
  const jiraConnection = await getConnectionByProvider("jira");
  if (jiraConnection?.status === "connected" && !isMcpTransport(jiraConnection)) {
    return getDefaultAtlassianResource("jira");
  }

  const token = await getAtlassianBearerToken();
  const response = await fetchWithTimeout(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  const resources = (await response.json()) as AtlassianResource[] | { error?: string };
  if (!response.ok || !Array.isArray(resources) || resources.length === 0) {
    throw new Error("Could not list Atlassian sites for Jira.");
  }
  return resources[0];
}

async function jiraApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const jiraConnection = await getConnectionByProvider("jira");
  if (jiraConnection?.status === "connected" && !isMcpTransport(jiraConnection)) {
    return bearerFetch("jira", path, init);
  }

  const token = await getAtlassianBearerToken();
  return fetchWithTimeout(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

function parseTransitions(body: {
  transitions?: { id?: string; name?: string; to?: { name?: string } }[];
}): JiraTransitionOption[] {
  return (body.transitions ?? [])
    .map((transition) => {
      const id = transition.id ? String(transition.id) : "";
      const name = transition.name ?? "Move";
      const toStatus = transition.to?.name ?? name;
      if (!id) return null;
      return { id, name, toStatus };
    })
    .filter((item): item is JiraTransitionOption => item != null);
}

export async function getJiraIssueTransitions(issueKey: string): Promise<JiraIssueStatusSnapshot> {
  const resource = await getJiraCloudResource();
  const issueResponse = await jiraApiFetch(
    `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status`
  );
  const issueBody = (await issueResponse.json()) as {
    key?: string;
    fields?: { status?: { name?: string } };
    errorMessages?: string[];
  };
  if (!issueResponse.ok) {
    throw new Error(issueBody.errorMessages?.join("; ") || "Could not load Jira issue.");
  }

  const transitionsResponse = await jiraApiFetch(
    `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
  );
  const transitionsBody = (await transitionsResponse.json()) as {
    transitions?: { id?: string; name?: string; to?: { name?: string } }[];
    errorMessages?: string[];
  };
  if (!transitionsResponse.ok) {
    throw new Error(
      transitionsBody.errorMessages?.join("; ") ||
        "Could not load Jira transitions. Reconnect Jira with write access if you need to move issues."
    );
  }

  return {
    key: issueKey,
    status: issueBody.fields?.status?.name ?? "Unknown",
    transitions: parseTransitions(transitionsBody),
  };
}

export async function transitionJiraIssue(
  issueKey: string,
  transitionId: string
): Promise<{ toStatus: string }> {
  const resource = await getJiraCloudResource();
  const snapshot = await getJiraIssueTransitions(issueKey);
  const transition = snapshot.transitions.find((item) => item.id === transitionId);
  if (!transition) {
    throw new Error("That Jira move is no longer available. Refresh and try again.");
  }

  const response = await jiraApiFetch(
    `https://api.atlassian.com/ex/jira/${resource.id}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    }
  );

  if (!response.ok) {
    const body = (await response.json()) as { errorMessages?: string[] };
    throw new Error(
      body.errorMessages?.join("; ") ||
        "Jira rejected the move. Reconnect with write:jira-work scope if needed."
    );
  }

  return { toStatus: transition.toStatus };
}
