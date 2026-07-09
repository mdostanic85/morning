import { NextResponse } from "next/server";
import { getProjectById } from "@/services/projects";
import { updateWorkTask } from "@/services/workTasks";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const body = await request.json();
  const projectId = body?.projectId;

  if (projectId !== null && (!Number.isInteger(projectId) || projectId <= 0)) {
    return NextResponse.json(
      { error: "Project id must be a positive integer or null." },
      { status: 400 }
    );
  }

  if (projectId !== null) {
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
  }

  const task = await updateWorkTask(taskId, { projectId });

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  return NextResponse.json({ task });
}
