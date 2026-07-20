import { NextRequest, NextResponse } from "next/server";
import { executeHydraRun } from "@/lib/hydra/orchestrator";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
  const result = await executeHydraRun(runId);
  return NextResponse.json({ ok: result.run?.status !== "failed", ...result });
}
