import { NextResponse } from "next/server";
import { PROJECT_STATUSES } from "@/db/schema";
import { getProjectById, setProjectStatus } from "@/services/projects";
import type { ProjectStatus } from "@/domain/project";

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

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
  const status: unknown = body?.status;

  if (!isProjectStatus(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${PROJECT_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const updated = await setProjectStatus(projectId, status);

  return NextResponse.json({ project: updated });
}
