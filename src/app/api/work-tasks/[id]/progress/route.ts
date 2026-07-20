import { NextResponse } from "next/server";
import { TASK_PROGRESS_ITEM_TYPES } from "@/db/schema";
import { getWorkTaskById } from "@/services/workTasks";
import { upsertTaskProgress } from "@/services/taskProgress";

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
  const planVersion = typeof body?.planVersion === "string" ? body.planVersion.trim() : "";
  const itemId = typeof body?.itemId === "string" ? body.itemId.trim() : "";
  const itemType = typeof body?.itemType === "string" ? body.itemType : "";
  const completed = Boolean(body?.completed);

  if (!planVersion || !itemId) {
    return NextResponse.json({ error: "planVersion and itemId are required." }, { status: 400 });
  }

  if (!TASK_PROGRESS_ITEM_TYPES.includes(itemType as (typeof TASK_PROGRESS_ITEM_TYPES)[number])) {
    return NextResponse.json({ error: "Unsupported item type." }, { status: 400 });
  }

  const existing = await getWorkTaskById(taskId);
  if (!existing) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const progress = await upsertTaskProgress(taskId, {
    planVersion,
    itemId,
    itemType: itemType as (typeof TASK_PROGRESS_ITEM_TYPES)[number],
    completed,
  });

  return NextResponse.json({ progress });
}
