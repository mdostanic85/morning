import { NextResponse } from "next/server";
import { startFigmaValidationRun } from "@/lib/tasks/figmaValidationRun";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const taskId = Number(id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const runId = startFigmaValidationRun(taskId);
  return NextResponse.json({ runId });
}
