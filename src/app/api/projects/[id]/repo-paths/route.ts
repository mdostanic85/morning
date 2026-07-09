import { NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/services/projects";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const projectId = Number(params.id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "Valid project id is required." }, { status: 400 });
  }

  const body = await request.json();
  const rawRepoPaths: unknown = body?.repoPaths;
  const repoPaths: string[] | null = Array.isArray(rawRepoPaths)
    ? rawRepoPaths.filter((item): item is string => typeof item === "string")
    : null;

  if (!repoPaths) {
    return NextResponse.json({ error: "repoPaths must be an array of strings." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const cleanRepoPaths = Array.from(
    new Set(repoPaths.map((repoPath: string) => repoPath.trim()).filter(Boolean))
  );
  const updated = await updateProject(projectId, { repoPaths: cleanRepoPaths });

  return NextResponse.json({ project: updated });
}
