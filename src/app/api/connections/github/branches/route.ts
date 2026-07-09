import { NextResponse } from "next/server";
import { listGitHubBranches } from "@/lib/connectors/github";

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo")?.trim();
  if (!repo) {
    return NextResponse.json({ error: "repo query parameter is required." }, { status: 400 });
  }

  try {
    const branches = await listGitHubBranches(repo);
    return NextResponse.json({ branches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list GitHub branches.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
