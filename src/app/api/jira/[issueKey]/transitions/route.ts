import { NextResponse } from "next/server";
import { getJiraIssueTransitions } from "@/lib/connectors/jiraTransitions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ issueKey: string }> }
) {
  const { issueKey } = await context.params;
  const key = issueKey?.trim().toUpperCase();

  if (!key || !/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
    return NextResponse.json({ error: "Valid Jira issue key is required." }, { status: 400 });
  }

  try {
    const snapshot = await getJiraIssueTransitions(key);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load Jira board moves.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
