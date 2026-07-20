import { NextResponse } from "next/server";
import { getRun, cancelRun } from "@/lib/tasks/figmaValidationRun";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> }
) {
  const { runId } = await context.params;
  const run = getRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }

  return NextResponse.json(run);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> }
) {
  const { runId } = await context.params;
  const cancelled = cancelRun(runId);

  if (!cancelled) {
    const run = getRun(runId);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json({ ok: false, reason: "Run is not in progress." });
  }

  return NextResponse.json({ ok: true });
}
