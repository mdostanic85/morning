import "server-only";
import { fetchRecentlyDoneJiraIssues } from "@/lib/connectors/jira";
import { isJiraDoneStatus } from "@/lib/connectors/jiraStatus";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import {
  getSourceItemByExternalId,
  updateSourceItem,
} from "@/services/sourceItems";
import { getActiveProjects } from "@/services/projects";

export interface JiraDoneNotification {
  key: string;
  title: string;
  status: string;
  url: string | null;
  projectName: string | null;
}

function issueTitle(candidate: ConnectorSourceCandidate): string {
  return candidate.title.replace(/^[^:]+:\s*/, "").trim() || candidate.title;
}

function projectNameForKey(
  issueKey: string,
  projects: Awaited<ReturnType<typeof getActiveProjects>>
): string | null {
  const projectKey = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/)?.[1];
  if (!projectKey) return null;
  return projects.find((project) => project.jiraKeys.includes(projectKey))?.name ?? null;
}

async function markSourceItemDone(candidate: ConnectorSourceCandidate): Promise<void> {
  const existing = await getSourceItemByExternalId({
    sourceType: "jira",
    sourceExternalId: candidate.sourceExternalId,
  });
  if (!existing) return;

  const status =
    typeof candidate.metadata?.status === "string" ? candidate.metadata.status : "Done";

  await updateSourceItem(existing.id, {
    body: candidate.body,
    sourceDate: candidate.sourceDate,
    metadata: {
      ...(existing.metadata ?? {}),
      ...(candidate.metadata ?? {}),
      status,
      lastKnownStatus: status,
    },
  });
}

export async function detectJiraDoneNotifications(): Promise<JiraDoneNotification[]> {
  const projects = await getActiveProjects();
  const projectJiraKeys = [...new Set(projects.flatMap((project) => project.jiraKeys))];
  if (projectJiraKeys.length === 0) return [];

  let doneIssues: ConnectorSourceCandidate[];
  try {
    doneIssues = await fetchRecentlyDoneJiraIssues({ projectJiraKeys });
  } catch {
    return [];
  }

  const notifications: JiraDoneNotification[] = [];

  for (const issue of doneIssues) {
    const status =
      typeof issue.metadata?.status === "string" ? issue.metadata.status : "Done";
    if (!isJiraDoneStatus(status)) continue;

    const existing = await getSourceItemByExternalId({
      sourceType: "jira",
      sourceExternalId: issue.sourceExternalId,
    });

    if (!existing) continue;

    const previousStatus =
      typeof existing.metadata?.lastKnownStatus === "string"
        ? existing.metadata.lastKnownStatus
        : typeof existing.metadata?.status === "string"
          ? existing.metadata.status
          : null;

    const newlyDone = !isJiraDoneStatus(previousStatus);
    await markSourceItemDone(issue);

    if (!newlyDone) continue;

    notifications.push({
      key: issue.sourceExternalId,
      title: issueTitle(issue),
      status,
      url: issue.url ?? null,
      projectName: projectNameForKey(issue.sourceExternalId, projects),
    });
  }

  return notifications;
}
