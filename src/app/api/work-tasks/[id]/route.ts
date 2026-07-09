import { NextResponse } from "next/server";
import { deleteWorkTask, getWorkTaskById } from "@/services/workTasks";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const existing = await getWorkTaskById(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  await deleteWorkTask(taskId);
  return NextResponse.json({ ok: true });
}
