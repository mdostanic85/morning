import { NextResponse } from "next/server";
import { parseGitHubRepo } from "@/lib/connectors/github";
import { getConnectionByProvider, upsertConnection } from "@/services/connections";

export async function PATCH(request: Request) {
  const connection = await getConnectionByProvider("github");
  if (!connection || connection.status !== "connected") {
    return NextResponse.json({ error: "Connect GitHub first." }, { status: 400 });
  }

  const body = await request.json();
  const repository =
    typeof body?.repository === "string" ? parseGitHubRepo(body.repository) : null;
  const branch = typeof body?.branch === "string" ? body.branch.trim() : "";
  if (!repository || !branch) {
    return NextResponse.json({ error: "repository and branch are required." }, { status: 400 });
  }

  const updated = await upsertConnection({
    provider: "github",
    authType: connection.authType,
    status: "connected",
    scopes: connection.scopes,
    metadata: {
      ...(connection.metadata ?? {}),
      workRepository: repository,
      workBranch: branch,
    },
  });

  return NextResponse.json({ connection: updated });
}
