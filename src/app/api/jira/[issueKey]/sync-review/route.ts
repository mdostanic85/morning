import { NextResponse } from "next/server";
import { runDeliverySyncReview } from "@/lib/tasks/deliverySyncReview";
import { getWorkTaskByJiraKey } from "@/services/workTasks";

export async function POST(
  request: Request,
  context: { params: Promise<{ issueKey: string }> }
) {
  const { issueKey } = await context.params;
  const key = issueKey?.trim().toUpperCase();

  if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return NextResponse.json({ error: "Valid Jira issue key is required." }, { status: 400 });
  }

  const task = await getWorkTaskByJiraKey(key);
  if (!task) {
    return NextResponse.json(
      {
        error:
          "No local task found for this Jira issue. Sync my day first, or set work links below.",
      },
      { status: 400 }
    );
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
    taskId: task.id,
    githubBranch,
    figmaFrameUrl,
    referenceLinks,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Review Status failed." }, { status: 400 });
  }

  return NextResponse.json({
    report: result.report,
    githubBranch: result.githubBranch ?? null,
    figmaUrl: result.figmaUrl ?? null,
    taskId: task.id,
  });
}
