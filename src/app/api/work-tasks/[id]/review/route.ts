import { NextResponse } from "next/server";
import { approveWorkTask, deleteWorkTask, getWorkTaskById } from "@/services/workTasks";

/**
 * Reviews one extracted task: "approve" moves it into the Today queue,
 * "reject" deletes it (with its evidence) entirely.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const body = await request.json();
  const action = typeof body?.action === "string" ? body.action : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Action must be 'approve' or 'reject'." }, { status: 400 });
  }

  const existing = await getWorkTaskById(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (action === "reject") {
    await deleteWorkTask(taskId);
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  const task = await approveWorkTask(taskId);
  return NextResponse.json({ ok: true, action: "approved", task });
}
