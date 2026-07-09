import { NextResponse } from "next/server";
import { getWorkTaskById, updateWorkTask } from "@/services/workTasks";
import type { WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";

const ACTION_TO_STATUS: Record<string, WorkTaskStatus> = {
  start: "now",
  done: "done",
  snooze: "tomorrow",
  skip: "later",
  waiting: "waiting",
  not_mine: "unclear",
};

function noteNotMine(reason: string): string {
  const note = "Not mine: user marked this as not their responsibility.";
  return reason.includes(note) ? reason : `${reason} (${note})`;
}

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
  const action = typeof body?.action === "string" ? body.action : "";
  const nextStatus = ACTION_TO_STATUS[action];

  if (!nextStatus) {
    return NextResponse.json({ error: "Unsupported task action." }, { status: 400 });
  }

  const existing = await getWorkTaskById(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  // A user click is an explicit triage decision — the priority planner must
  // never overwrite it on the next rebuild.
  const patch: WorkTaskPatch = { status: nextStatus, statusManuallySet: true };

  if (action === "not_mine") {
    patch.reason = noteNotMine(existing.reason);
    patch.waitingOn = null;
  }

  if (action === "waiting" && !existing.waitingOn) {
    patch.waitingOn = "Manual follow-up needed";
  }

  const task = await updateWorkTask(taskId, patch);
  return NextResponse.json({ task });
}
