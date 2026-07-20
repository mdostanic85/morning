import { NextResponse } from "next/server";
import { getSyncRunById, requestSyncRunCancel } from "@/services/syncRuns";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const syncRunId = Number(id);
  if (!Number.isFinite(syncRunId)) {
    return NextResponse.json({ error: "Invalid sync run id." }, { status: 400 });
  }

  const existing = await getSyncRunById(syncRunId);
  if (!existing) {
    return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
  }

  const syncRun = await requestSyncRunCancel(syncRunId);
  if (!syncRun) {
    return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    syncRun,
    syncStatus: syncRun.status,
  });
}
