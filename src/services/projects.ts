import "server-only";
import { eq, ne, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { projects as projectsTable, workTasks as workTasksTable } from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning, execute } from "@/db/query";
import type { NewProject, Project, ProjectPatch, ProjectWithCounts } from "@/domain/project";
import type { SourceItem } from "@/domain/sourceItem";
import { projectStatusForJiraKey } from "@/lib/projects/projectForJiraKey";

function toProject(row: typeof projectsTable.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    keywords: row.keywords ?? [],
    people: row.people ?? [],
    jiraKeys: row.jiraKeys ?? [],
    repoPaths: row.repoPaths ?? [],
    githubRepositories: row.githubRepositories ?? [],
    confluenceSpaces: row.confluenceSpaces ?? [],
    confluencePageUrls: row.confluencePageUrls ?? [],
    discordChannels: row.discordChannels ?? [],
    figmaFileKeys: row.figmaFileKeys ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createProject(input: NewProject): Promise<Project> {
  const [row] = await fetchReturning(
    db
      .insert(projectsTable)
      .values({
        name: input.name,
        description: input.description ?? null,
        keywords: input.keywords ?? [],
        people: input.people ?? [],
        jiraKeys: input.jiraKeys ?? [],
        repoPaths: input.repoPaths ?? [],
        githubRepositories: input.githubRepositories ?? [],
        confluenceSpaces: input.confluenceSpaces ?? [],
        confluencePageUrls: input.confluencePageUrls ?? [],
        discordChannels: input.discordChannels ?? [],
        figmaFileKeys: input.figmaFileKeys ?? [],
      })
      .returning()
  );
  return toProject(row);
}

export async function getProjects(): Promise<ProjectWithCounts[]> {
  const rows = await fetchAll(db.select().from(projectsTable).orderBy(asc(projectsTable.id)));
  const openTasks = await fetchAll(db.select().from(workTasksTable).where(ne(workTasksTable.status, "done")));

  const countByProject = new Map<number, number>();
  for (const t of openTasks) {
    if (t.projectId == null) continue;
    countByProject.set(t.projectId, (countByProject.get(t.projectId) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...toProject(row),
    openTaskCount: countByProject.get(row.id) ?? 0,
  }));
}

export function filterActiveProjects<T extends Pick<Project, "status">>(projects: T[]): T[] {
  return projects.filter((project) => project.status === "active");
}

/** Projects the user has not turned off on the Projects page. */
export async function getActiveProjects(): Promise<ProjectWithCounts[]> {
  return filterActiveProjects(await getProjects());
}

function jiraProjectKeyFromIssueKey(issueKey: string): string | null {
  const match = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/);
  return match?.[1] ?? null;
}

/** True when a source belongs to a project the user turned off. */
export function isSourceFromInactiveProject(
  source: Pick<SourceItem, "projectId" | "sourceType" | "sourceExternalId">,
  allProjects: Project[]
): boolean {
  if (source.projectId != null) {
    const project = allProjects.find((entry) => entry.id === source.projectId);
    return project?.status === "inactive";
  }

  if (source.sourceType !== "jira" || !source.sourceExternalId) return false;

  const issueProjectKey = jiraProjectKeyFromIssueKey(source.sourceExternalId);
  if (!issueProjectKey) return false;

  const status = projectStatusForJiraKey(allProjects, issueProjectKey);
  return status === "inactive";
}

export async function getProjectById(id: number): Promise<Project | null> {
  const row = await fetchOne(db.select().from(projectsTable).where(eq(projectsTable.id, id)));
  return row ? toProject(row) : null;
}

export async function updateProject(id: number, patch: ProjectPatch): Promise<Project | null> {
  const [row] = await fetchReturning(
    db.update(projectsTable).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(projectsTable.id, id)).returning()
  );
  return row ? toProject(row) : null;
}

export async function deleteProject(id: number): Promise<void> {
  await execute(db.delete(projectsTable).where(eq(projectsTable.id, id)));
}

export async function setProjectStatus(
  id: number,
  status: Project["status"]
): Promise<Project | null> {
  return updateProject(id, { status });
}
