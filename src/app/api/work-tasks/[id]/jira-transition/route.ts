import { NextResponse } from "next/server";
import { extractJiraKey } from "@/lib/tasks/deliverableContext";
import { transitionJiraIssue } from "@/lib/connectors/jiraTransitions";
import { getWorkTaskById } from "@/services/workTasks";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const taskId = Number(params.id);

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return NextResponse.json({ error: "Valid task id is required." }, { status: 400 });
  }

  const task = await getWorkTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const issueKey = extractJiraKey(task.title);
  if (!issueKey) {
    return NextResponse.json({ error: "This task is not linked to a Jira issue." }, { status: 400 });
  }

  const body = await request.json();
  const transitionId =
    typeof body?.transitionId === "string" ? body.transitionId.trim() : "";
  if (!transitionId) {
    return NextResponse.json({ error: "transitionId is required." }, { status: 400 });
  }

  try {
    const result = await transitionJiraIssue(issueKey, transitionId);
    return NextResponse.json({ ok: true, issueKey, toStatus: result.toStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not move Jira issue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
