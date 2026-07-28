import "server-only";
import { getConnectionByProvider } from "@/services/connections";
import { isMcpTransport } from "@/lib/connectors/transport";
import {
  createProject,
  deleteProject,
  getProjects,
  updateProject,
} from "@/services/projects";
import type { Project } from "@/domain/project";
import {
  fetchAssignedJiraProjectKeysViaMcp,
  fetchVisibleJiraProjectsViaMcp,
  type JiraProjectSnapshot,
} from "@/lib/connectors/mcp/adapters/atlassian";
import { projectForJiraKey } from "./projectForJiraKey";

const STALE_LLM_DESCRIPTION_PREFIX = "Multiple issues in Jira point to a project with the key";

export interface JiraProjectSyncResult {
  created: number;
  updated: number;
  removed: number;
  hydraUmbrella: boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isActiveHydraBoard(name: string): boolean {
  return /^hydra\s[-–]/i.test(name.trim());
}

function findByJiraKey(projects: Project[], key: string): Project | null {
  return projectForJiraKey(projects, key) as Project | null;
}

function findHydraUmbrella(projects: Project[]): Project | null {
  const normalized = "hydra";
  return (
    projects.find(
      (project) =>
        project.name.trim().toLowerCase() === normalized &&
        project.jiraKeys.length > 1
    ) ?? null
  );
}

function shouldSyncJiraProject(
  project: JiraProjectSnapshot,
  assignedKeys: Set<string>
): boolean {
  if (assignedKeys.has(project.key)) return true;
  if (isActiveHydraBoard(project.name)) return true;
  return false;
}

async function removeStaleLlmProjects(projects: Project[]): Promise<number> {
  let removed = 0;
  for (const project of projects) {
    if (
      project.description?.startsWith(STALE_LLM_DESCRIPTION_PREFIX) &&
      project.jiraKeys.length === 1
    ) {
      await deleteProject(project.id);
      removed += 1;
    }
  }
  return removed;
}

export async function syncJiraProjectsFromMcp(): Promise<JiraProjectSyncResult> {
  const result: JiraProjectSyncResult = {
    created: 0,
    updated: 0,
    removed: 0,
    hydraUmbrella: false,
  };

  const connection = await getConnectionByProvider("jira");
  if (connection?.status !== "connected" || !isMcpTransport(connection)) {
    return result;
  }

  const [visibleProjects, assignedKeys] = await Promise.all([
    fetchVisibleJiraProjectsViaMcp(),
    fetchAssignedJiraProjectKeysViaMcp(),
  ]);

  let projects: Project[] = (await getProjects()).map(
    ({ openTaskCount: _open, ...project }) => project
  );
  result.removed = await removeStaleLlmProjects(projects);
  if (result.removed > 0) {
    projects = (await getProjects()).map(({ openTaskCount: _open, ...project }) => project);
  }

  const toSync = visibleProjects.filter((project) =>
    shouldSyncJiraProject(project, assignedKeys)
  );

  for (const jiraProject of toSync) {
    const existing = findByJiraKey(projects, jiraProject.key);
    const description = `Jira project ${jiraProject.key} on ${jiraProject.siteName ?? "Atlassian"}.`;

    if (existing) {
      const mergedKeys = unique([...existing.jiraKeys, jiraProject.key]);
      const mergedKeywords = unique([...existing.keywords, jiraProject.key, "jira"]);
      const nextDescription = existing.description?.startsWith(STALE_LLM_DESCRIPTION_PREFIX)
        ? description
        : existing.description ?? description;
      const changed =
        existing.name !== jiraProject.name ||
        mergedKeys.length !== existing.jiraKeys.length ||
        mergedKeywords.length !== existing.keywords.length ||
        nextDescription !== existing.description;

      if (!changed) continue;

      const updated =
        (await updateProject(existing.id, {
          name: jiraProject.name,
          description: nextDescription,
          jiraKeys: mergedKeys,
          keywords: mergedKeywords,
        })) ?? existing;
      projects = projects.map((project) => (project.id === updated.id ? updated : project));
      result.updated += 1;
      continue;
    }

    const created = await createProject({
      name: jiraProject.name,
      description,
      jiraKeys: [jiraProject.key],
      keywords: [jiraProject.key, "jira"],
    });
    projects.push(created);
    result.created += 1;
  }

  const hydraBoards = visibleProjects.filter((project) => isActiveHydraBoard(project.name));
  const hydraKeys = unique(hydraBoards.map((project) => project.key));
  if (hydraKeys.length >= 2) {
    const umbrella = findHydraUmbrella(projects);
    const description =
      "Umbrella for hydra product boards in Jira (Content, Umbrella App, Data Hub, etc.).";

    if (umbrella) {
      const mergedKeys = unique([...umbrella.jiraKeys, ...hydraKeys]);
      const mergedKeywords = unique([...umbrella.keywords, "hydra", "jira"]);
      const changed =
        mergedKeys.length !== umbrella.jiraKeys.length ||
        mergedKeywords.length !== umbrella.keywords.length;

      if (changed) {
        await updateProject(umbrella.id, {
          jiraKeys: mergedKeys,
          keywords: mergedKeywords,
          description: umbrella.description ?? description,
        });
        result.updated += 1;
      }
    } else {
      await createProject({
        name: "Hydra",
        description,
        jiraKeys: hydraKeys,
        keywords: ["hydra", "jira"],
      });
      result.created += 1;
    }
    result.hydraUmbrella = true;
  }

  return result;
}
