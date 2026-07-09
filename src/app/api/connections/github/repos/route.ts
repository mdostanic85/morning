import { NextResponse } from "next/server";
import { listGitHubRepositories } from "@/lib/connectors/github";

export async function GET() {
  try {
    const repos = await listGitHubRepositories();
    return NextResponse.json({ repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not list GitHub repositories.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
