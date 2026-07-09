import { NextResponse } from "next/server";
import { transitionJiraIssue } from "@/lib/connectors/jiraTransitions";

export async function POST(
  request: Request,
  context: { params: Promise<{ issueKey: string }> }
) {
  const { issueKey } = await context.params;
  const key = issueKey?.trim().toUpperCase();

  if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return NextResponse.json({ error: "Valid Jira issue key is required." }, { status: 400 });
  }

  const body = await request.json();
  const transitionId =
    typeof body?.transitionId === "string" ? body.transitionId.trim() : "";
  if (!transitionId) {
    return NextResponse.json({ error: "transitionId is required." }, { status: 400 });
  }

  try {
    const result = await transitionJiraIssue(key, transitionId);
    return NextResponse.json({ ok: true, issueKey: key, toStatus: result.toStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not move Jira issue.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
