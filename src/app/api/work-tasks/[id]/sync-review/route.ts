import { NextResponse } from "next/server";
import { runDeliverySyncReview } from "@/lib/tasks/deliverySyncReview";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const githubBranch = typeof body?.githubBranch === "string" ? body.githubBranch : undefined;
  const figmaFrameUrl = typeof body?.figmaFrameUrl === "string" ? body.figmaFrameUrl : undefined;
  const referenceLinks = Array.isArray(body?.referenceLinks)
    ? body.referenceLinks
        .filter(
          (item: unknown): item is { label: string; url: string } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { label?: unknown }).label === "string" &&
            typeof (item as { url?: unknown }).url === "string"
        )
        .map((item: { label: string; url: string }) => ({ label: item.label, url: item.url }))
    : undefined;

  const result = await runDeliverySyncReview({
    taskId,
    githubBranch,
    figmaFrameUrl,
    referenceLinks,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Sync review failed." }, { status: 400 });
  }

  return NextResponse.json({
    report: result.report,
    githubBranch: result.githubBranch ?? null,
    figmaUrl: result.figmaUrl ?? null,
  });
}
