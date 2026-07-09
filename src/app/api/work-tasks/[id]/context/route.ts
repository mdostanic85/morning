import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseGitHubRepo } from "@/lib/connectors/github";
import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { getWorkTaskById, updateWorkTask } from "@/services/workTasks";

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid task id." }, { status: 400 });
  }

  const task = await getWorkTaskById(taskId);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const body = await request.json();
  const figmaFrameUrl = cleanString(body?.figmaFrameUrl);
  const localRepoPath = cleanString(body?.localRepoPath);
  const githubRepoInput = cleanString(body?.githubRepo);
  const githubRepo = githubRepoInput ? parseGitHubRepo(githubRepoInput) : null;

  if (figmaFrameUrl && !parseFigmaUrl(figmaFrameUrl)) {
    return NextResponse.json(
      { error: "Figma link must be a valid figma.com design URL." },
      { status: 400 }
    );
  }
  if (githubRepoInput && !githubRepo) {
    return NextResponse.json(
      { error: "GitHub repository must look like owner/repo or a github.com URL." },
      { status: 400 }
    );
  }
  if (localRepoPath) {
    const resolved = path.resolve(localRepoPath);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Local repo path does not exist." }, { status: 400 });
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Local repo path must be a directory." }, { status: 400 });
    }
  }

  const updated = await updateWorkTask(taskId, {
    figmaFrameUrl,
    localRepoPath: localRepoPath ? path.resolve(localRepoPath) : null,
    githubRepo,
  });

  return NextResponse.json({ task: updated });
}
