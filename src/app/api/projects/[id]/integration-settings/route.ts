import { NextResponse } from "next/server";
import { getProjectById, updateProject } from "@/services/projects";

function cleanList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const projectId = Number(params.id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "Valid project id is required." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const body = await request.json();
  const jiraKeys = cleanList(body?.jiraKeys);
  const githubRepositories = cleanList(body?.githubRepositories);
  const confluenceSpaces = cleanList(body?.confluenceSpaces);
  const confluencePageUrls = cleanList(body?.confluencePageUrls);
  const discordChannels = cleanList(body?.discordChannels);
  const figmaFileKeys = cleanList(body?.figmaFileKeys);

  if (
    !jiraKeys ||
    !githubRepositories ||
    !confluenceSpaces ||
    !confluencePageUrls ||
    !discordChannels ||
    !figmaFileKeys
  ) {
    return NextResponse.json({ error: "All integration settings must be string arrays." }, { status: 400 });
  }

  const updated = await updateProject(projectId, {
    jiraKeys,
    githubRepositories,
    confluenceSpaces,
    confluencePageUrls,
    discordChannels,
    figmaFileKeys,
  });

  return NextResponse.json({ project: updated });
}
