import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildProjectDiscoveryUserPrompt,
  projectDiscoveryOutputSchema,
  type ExistingProjectSnapshot,
} from "@/lib/llm/prompts/projectDiscovery";
import { gatherProjectSignals } from "./signals";
import { syncJiraProjectsFromMcp, type JiraProjectSyncResult } from "./jiraSync";
import { createProject, getProjects, updateProject } from "@/services/projects";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import type { Project } from "@/domain/project";

const MIN_DISCOVERY_CONFIDENCE = 0.7;

export interface ProjectDiscoveryResult {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  signalCount: number;
  errors: string[];
  projects: Project[];
  jiraSync?: JiraProjectSyncResult;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeArrays(...lists: string[][]): string[] {
  return unique(lists.flat());
}

function toSnapshot(project: Project): ExistingProjectSnapshot {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    keywords: project.keywords,
    people: project.people,
    jiraKeys: project.jiraKeys,
    confluenceSpaces: project.confluenceSpaces,
    githubRepositories: project.githubRepositories,
  };
}

function findExistingByName(projects: Project[], name: string): Project | null {
  const normalized = name.trim().toLowerCase();
  return projects.find((project) => project.name.trim().toLowerCase() === normalized) ?? null;
}

export async function discoverProjectsFromSignals(
  connectedProviders: ConnectionProvider[]
): Promise<ProjectDiscoveryResult> {
  const result: ProjectDiscoveryResult = {
    ok: true,
    created: 0,
    updated: 0,
    skipped: 0,
    signalCount: 0,
    errors: [],
    projects: [],
  };

  const signals = await gatherProjectSignals(connectedProviders);
  result.signalCount = signals.length;

  if (connectedProviders.includes("jira")) {
    try {
      result.jiraSync = await syncJiraProjectsFromMcp();
      result.created += result.jiraSync.created;
      result.updated += result.jiraSync.updated;
    } catch (err) {
      result.ok = false;
      result.errors.push(
        `Jira MCP sync: ${err instanceof Error ? err.message : "failed"}`
      );
    }
  }

  // Jira boards come from MCP — never let the LLM invent projects from Jira
  // signals. Other strong signals (notably Confluence spaces) may still enrich
  // those durable Jira-created projects with their integration hints.
  const llmSignals = signals.filter(
    (signal) => signal.source !== "jira"
  );

  if (llmSignals.length === 0) {
    result.projects = await getProjects();
    return result;
  }

  const existingProjects = await getProjects();
  const llmResult = await runLlmJob({
    jobType: "project_discovery",
    userPrompt: buildProjectDiscoveryUserPrompt({
      signals: llmSignals,
      existingProjects: existingProjects.map(toSnapshot),
      connectedProviders,
    }),
    schema: projectDiscoveryOutputSchema,
  });

  if (!llmResult.ok) {
    result.ok = false;
    result.errors.push(`${llmResult.kind}: ${llmResult.error}`);
    result.projects = existingProjects;
    return result;
  }

  let projects: Project[] = existingProjects.map(
    ({ openTaskCount: _open, ...project }) => project
  );

  for (const discovered of llmResult.data.projects) {
    if (discovered.confidence < MIN_DISCOVERY_CONFIDENCE || discovered.evidence.length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      if (discovered.action === "update") {
        const target =
          projects.find((project) => project.id === discovered.existingProjectId) ??
          findExistingByName(projects, discovered.name);
        if (!target) {
          result.skipped += 1;
          continue;
        }

        const updated =
          (await updateProject(target.id, {
            name: discovered.name,
            description: discovered.description || target.description,
            keywords: mergeArrays(target.keywords, discovered.keywords),
            people: mergeArrays(target.people, discovered.people),
            jiraKeys: mergeArrays(target.jiraKeys, discovered.jiraKeys),
            confluenceSpaces: mergeArrays(target.confluenceSpaces, discovered.confluenceSpaces),
            githubRepositories: mergeArrays(
              target.githubRepositories,
              discovered.githubRepositories
            ),
          })) ?? target;

        projects = projects.map((project) => (project.id === updated.id ? updated : project));
        result.updated += 1;
        continue;
      }

      const duplicate = findExistingByName(projects, discovered.name);
      if (duplicate) {
        const updated =
          (await updateProject(duplicate.id, {
            description: discovered.description || duplicate.description,
            keywords: mergeArrays(duplicate.keywords, discovered.keywords),
            people: mergeArrays(duplicate.people, discovered.people),
            jiraKeys: mergeArrays(duplicate.jiraKeys, discovered.jiraKeys),
            confluenceSpaces: mergeArrays(duplicate.confluenceSpaces, discovered.confluenceSpaces),
            githubRepositories: mergeArrays(
              duplicate.githubRepositories,
              discovered.githubRepositories
            ),
          })) ?? duplicate;
        projects = projects.map((project) => (project.id === updated.id ? updated : project));
        result.updated += 1;
        continue;
      }

      const created = await createProject({
        name: discovered.name,
        description: discovered.description || null,
        keywords: discovered.keywords,
        people: discovered.people,
        jiraKeys: discovered.jiraKeys,
        confluenceSpaces: discovered.confluenceSpaces,
        githubRepositories: discovered.githubRepositories,
      });
      projects.push(created);
      result.created += 1;
    } catch (err) {
      result.ok = false;
      result.errors.push(
        `${discovered.name}: ${err instanceof Error ? err.message : "could not save project"}`
      );
    }
  }

  result.projects = await getProjects();
  return result;
}
