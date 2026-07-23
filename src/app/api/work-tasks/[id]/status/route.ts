import { NextResponse } from "next/server";
import { getWorkTaskById, updateWorkTask } from "@/services/workTasks";
import { getUserProfile } from "@/services/userProfile";
import { NOT_MINE_NOTE } from "@/lib/filters/ownerFilter";
import type { WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";

const ACTION_TO_STATUS: Record<string, WorkTaskStatus> = {
  start: "now",
  // "This is mine" — confirmed ownership queues the task as up-next.
  mine: "next",
  done: "done",
  snooze: "tomorrow",
  skip: "later",
  waiting: "waiting",
  not_mine: "unclear",
};

function noteNotMine(reason: string): string {
  return reason.includes(NOT_MINE_NOTE) ? reason : `${reason} (${NOT_MINE_NOTE})`;
}

/** Undo a prior "Not mine" note when the user reclaims the task. */
function stripNotMine(reason: string): string {
  return reason
    .split(`(${NOT_MINE_NOTE})`)
    .join("")
    .split(NOT_MINE_NOTE)
    .join("")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

  if (action === "mine") {
    // Confirming ownership sets the user as owner so the classifier reads it
    // as "mine" everywhere, clears any waiting/blocked state, and undoes a
    // prior "Not mine" decision.
    const profile = await getUserProfile();
    const myName = profile?.name?.trim() || null;
    if (myName) patch.owner = myName;
    patch.waitingOn = null;
    patch.reason = stripNotMine(existing.reason);
  }

  if (action === "waiting" && !existing.waitingOn) {
    patch.waitingOn = "Manual follow-up needed";
  }

  const task = await updateWorkTask(taskId, patch);
  return NextResponse.json({ task });
}
