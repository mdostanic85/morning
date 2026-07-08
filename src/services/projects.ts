import "server-only";
import { eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { projects as projectsTable, workTasks as workTasksTable } from "@/db/schema";
import type { NewProject, Project, ProjectPatch, ProjectWithCounts } from "@/domain/project";

function toProject(row: typeof projectsTable.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keywords: row.keywords ?? [],
    people: row.people ?? [],
    jiraKeys: row.jiraKeys ?? [],
    repoPaths: row.repoPaths ?? [],
    figmaFileKeys: row.figmaFileKeys ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createProject(input: NewProject): Promise<Project> {
  const [row] = db
    .insert(projectsTable)
    .values({
      name: input.name,
      description: input.description ?? null,
      keywords: input.keywords ?? [],
      people: input.people ?? [],
      jiraKeys: input.jiraKeys ?? [],
      repoPaths: input.repoPaths ?? [],
      figmaFileKeys: input.figmaFileKeys ?? [],
    })
    .returning()
    .all();
  return toProject(row);
}

export async function getProjects(): Promise<ProjectWithCounts[]> {
  const rows = db.select().from(projectsTable).all();
  const openTasks = db
    .select()
    .from(workTasksTable)
    .where(ne(workTasksTable.status, "done"))
    .all();

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

export async function getProjectById(id: number): Promise<Project | null> {
  const row = db.select().from(projectsTable).where(eq(projectsTable.id, id)).get();
  return row ? toProject(row) : null;
}

export async function updateProject(id: number, patch: ProjectPatch): Promise<Project | null> {
  const [row] = db
    .update(projectsTable)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(projectsTable.id, id))
    .returning()
    .all();
  return row ? toProject(row) : null;
}

export async function deleteProject(id: number): Promise<void> {
  db.delete(projectsTable).where(eq(projectsTable.id, id)).run();
}
