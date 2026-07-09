import { NextResponse } from "next/server";
import { extractJiraKey } from "@/lib/tasks/deliverableContext";
import { getJiraIssueTransitions } from "@/lib/connectors/jiraTransitions";
import { getWorkTaskById } from "@/services/workTasks";

export async function GET(
  _request: Request,
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

  try {
    const snapshot = await getJiraIssueTransitions(issueKey);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load Jira board moves.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
