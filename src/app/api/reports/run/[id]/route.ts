import { NextRequest, NextResponse } from "next/server";
import {
  getDeliveriesForReport,
  getEvidenceRelationsForRun,
  getHydraEvidence,
  getHydraReportByRunId,
  getHydraRun,
  getReportFeedback,
  updateHydraRun,
  writeAuditLog,
} from "@/services/hydra";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) return NextResponse.json({ error: "Invalid run id." }, { status: 400 });
  const run = await getHydraRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const report = await getHydraReportByRunId(runId);
  return NextResponse.json({
    ok: true,
    run,
    report,
    evidence: await getHydraEvidence(runId),
    relations: await getEvidenceRelationsForRun(runId),
    deliveries: report ? await getDeliveriesForReport(report.id) : [],
    feedback: report ? await getReportFeedback(report.id) : [],
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const runId = Number(id);
  const run = await getHydraRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (["completed", "partial", "failed"].includes(run.status)) {
    return NextResponse.json({ error: "A terminal run cannot be cancelled." }, { status: 409 });
  }
  const cancelled = await updateHydraRun(runId, {
    status: "cancelled",
    completedAt: new Date().toISOString(),
  });
  await writeAuditLog({
    action: "report_run.cancelled",
    entityType: "report_run",
    entityId: runId,
  });
  return NextResponse.json({ ok: true, run: cancelled });
}
