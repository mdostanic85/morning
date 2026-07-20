import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { getUserProfile } from "@/services/userProfile";
import { createSyncRun, finalizeSyncRun } from "@/services/syncRuns";

/**
 * Enqueue Sync My Day — processing runs in the Inngest background workflow.
 */
export async function POST() {
  const profile = await getUserProfile();
  const syncRun = await createSyncRun({
    userId: profile?.id ?? null,
    trigger: "manual",
    mode: "full",
  });

  try {
    const { ids } = await inngest.send({
      name: "worklight/sync.requested",
      data: { syncRunId: syncRun.id },
    });

    return NextResponse.json({
      ok: true,
      syncRunId: syncRun.id,
      syncStatus: syncRun.status,
      eventIds: ids,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue sync.";
    await finalizeSyncRun({
      id: syncRun.id,
      status: "failed",
      errorSummary: message,
    });
    return NextResponse.json(
      { ok: false, syncRunId: syncRun.id, syncStatus: "failed", error: message },
      { status: 500 }
    );
  }
}
