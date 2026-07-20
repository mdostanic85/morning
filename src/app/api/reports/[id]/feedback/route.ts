import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createReportFeedback, writeAuditLog } from "@/services/hydra";

const feedbackSchema = z.object({
  section: z.string().min(1).max(80),
  rating: z.enum(["useful", "incorrect", "outdated", "missing_source"]),
  note: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const reportId = Number(id);
  const parsed = feedbackSchema.safeParse(await request.json());
  if (!Number.isInteger(reportId) || !parsed.success) {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  const feedback = createReportFeedback({ reportId, ...parsed.data });
  await writeAuditLog({
    action: "report.feedback_added",
    entityType: "report",
    entityId: reportId,
    metadata: { section: parsed.data.section, rating: parsed.data.rating },
  });
  return NextResponse.json({ ok: true, feedback }, { status: 201 });
}
