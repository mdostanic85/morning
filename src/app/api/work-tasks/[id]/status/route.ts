import { NextResponse } from "next/server";
import { getWorkTaskById, updateWorkTask } from "@/services/workTasks";
import { getUserProfile } from "@/services/userProfile";
import type { ConflictResolutionDecision, WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";
import { CONFLICT_RESOLUTION_DECISIONS } from "@/domain/workTask";
import { upsertTaskConflictDecision } from "@/services/taskConflictDecisions";

const ACTION_TO_STATUS: Record<string, WorkTaskStatus> = {
  start: "now",
  // Legacy "This is mine" control — kept for current UI; also sets durable ownership.
  mine: "next",
  done: "done",
  snooze: "tomorrow",
  skip: "later",
  waiting: "waiting",
};

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

  const existing = await getWorkTaskById(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (action === "confirm_mine" || action === "mine") {
    const profile = await getUserProfile();
    const myName = profile?.name?.trim() || null;
    const task = await updateWorkTask(taskId, {
      ownershipDecision: "confirmed_mine",
      statusManuallySet: true,
      status: action === "mine" || existing.status === "unclear" ? "next" : existing.status,
      waitingOn: null,
      ...(myName ? { owner: myName } : {}),
    });
    return NextResponse.json({ task });
  }

  if (action === "not_mine") {
    const task = await updateWorkTask(taskId, {
      ownershipDecision: "rejected_not_mine",
      statusManuallySet: true,
      waitingOn: null,
    });
    return NextResponse.json({ task });
  }

  if (action === "undo_ownership") {
    const task = await updateWorkTask(taskId, {
      ownershipDecision: null,
      status: "unclear",
      statusManuallySet: false,
    });
    return NextResponse.json({ task });
  }

  if (action === "resolve_conflict") {
    const decision = body?.decision;
    const summary = typeof body?.summary === "string" ? body.summary.trim() : "";
    const evidenceSourceItemIds = Array.isArray(body?.evidenceSourceItemIds)
      ? body.evidenceSourceItemIds.filter((value: unknown) => Number.isInteger(value))
      : [];

    if (
      !summary ||
      !CONFLICT_RESOLUTION_DECISIONS.includes(decision as ConflictResolutionDecision)
    ) {
      return NextResponse.json({ error: "Unsupported conflict decision." }, { status: 400 });
    }

    const stored = await upsertTaskConflictDecision({
      taskId,
      summary,
      decision: decision as ConflictResolutionDecision,
      evidenceSourceItemIds,
    });

    let taskPatch: WorkTaskPatch | null = null;
    if (decision === "mark_done_locally") {
      taskPatch = { status: "done", statusManuallySet: true };
    }

    const task = taskPatch ? await updateWorkTask(taskId, taskPatch) : existing;
    return NextResponse.json({ task, conflictDecision: stored });
  }

  const nextStatus = ACTION_TO_STATUS[action];
  if (!nextStatus) {
    return NextResponse.json({ error: "Unsupported task action." }, { status: 400 });
  }

  // A user click is an explicit triage decision — the priority planner must
  // never overwrite it on the next rebuild.
  const patch: WorkTaskPatch = { status: nextStatus, statusManuallySet: true };

  if (action === "waiting" && !existing.waitingOn) {
    patch.waitingOn = "Manual follow-up needed";
  }

  const task = await updateWorkTask(taskId, patch);
  return NextResponse.json({ task });
}
