import { NextResponse } from "next/server";
import { ensureWorkTaskForJiraIssue } from "@/services/workTasks";

export async function POST(
  request: Request,
  context: { params: Promise<{ issueKey: string }> }
) {
  const { issueKey } = await context.params;
  const key = issueKey?.trim().toUpperCase();

  if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return NextResponse.json({ error: "Valid Jira issue key is required." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const nextAction = typeof body?.nextAction === "string" ? body.nextAction.trim() : "";
  const doneCriteria = Array.isArray(body?.doneCriteria)
    ? body.doneCriteria.filter(
        (item: unknown): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];

  if (!title || !reason || !nextAction || doneCriteria.length === 0) {
    return NextResponse.json(
      { error: "Title, reason, next action, and done criteria are required." },
      { status: 400 }
    );
  }

  try {
    const task = await ensureWorkTaskForJiraIssue(key, {
      title,
      reason,
      nextAction,
      doneCriteria,
    });
    return NextResponse.json({ taskId: task.id, task });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not link Jira issue to local task." },
      { status: 400 }
    );
  }
}
