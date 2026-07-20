import { NextResponse } from "next/server";
import { getSyncMyDayStatus } from "@/lib/imports/syncMyDayOrchestrator";
import type { SyncWhatsNew } from "@/lib/imports/syncWhatsNew";

const TERMINAL_STATUSES = new Set([
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const syncRunId = Number(id);
  if (!Number.isFinite(syncRunId)) {
    return NextResponse.json({ error: "Invalid sync run id." }, { status: 400 });
  }

  const status = await getSyncMyDayStatus(syncRunId);
  if (!status) {
    return NextResponse.json({ error: "Sync run not found." }, { status: 404 });
  }

  const providerRuns = status.providerRuns;
  const completedProviders = providerRuns.filter((entry) => entry.status === "completed").length;
  const failedProviders = providerRuns.filter((entry) => entry.status === "failed").length;
  const runningProviders = providerRuns.filter((entry) => entry.status === "running").length;

  let whatsNew: SyncWhatsNew | null = null;
  if (status.syncRun.whatsNew) {
    try {
      whatsNew = JSON.parse(status.syncRun.whatsNew) as SyncWhatsNew;
    } catch {
      whatsNew = null;
    }
  }

  return NextResponse.json({
    ok: true,
    syncRun: status.syncRun,
    providerRuns,
    whatsNew,
    progress: {
      total: providerRuns.length,
      completed: completedProviders,
      failed: failedProviders,
      running: runningProviders,
      isTerminal: TERMINAL_STATUSES.has(status.syncRun.status),
    },
  });
}
