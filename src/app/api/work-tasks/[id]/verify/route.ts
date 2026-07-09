import { NextResponse } from "next/server";
import { verifyTaskDelivery } from "@/lib/tasks/deliveryVerifier";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const body = await request.json();
  const deliveryNotes = typeof body?.deliveryNotes === "string" ? body.deliveryNotes : "";
  const figmaFrameUrl = typeof body?.figmaFrameUrl === "string" ? body.figmaFrameUrl : "";

  const result = await verifyTaskDelivery({ taskId, deliveryNotes, figmaFrameUrl });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Could not verify delivery." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    report: result.report,
    gitEvidence: result.gitEvidence ?? [],
    figmaEvidence: result.figmaEvidence ?? null,
  });
}
