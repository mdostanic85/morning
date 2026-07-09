import { NextResponse } from "next/server";
import { ingestManualTranscript } from "@/services/sourceItems";
import { getProjects } from "@/services/projects";
import { extractTasksFromSourceItem } from "@/lib/tasks/extractor";
import { matchAndAssignSourceItemToProject } from "@/lib/tasks/projectMatcher";
import { extractKnowledgeFromSourceItem } from "@/lib/knowledge/extractor";
import { indexSourceItem } from "@/lib/knowledge/embeddings";

export async function POST(request: Request) {
  const body = await request.json();
  const { title, body: rawBody } = body ?? {};

  if (typeof rawBody !== "string" || rawBody.trim().length === 0) {
    return NextResponse.json({ error: "Transcript content is required." }, { status: 400 });
  }

  const result = await ingestManualTranscript({
    title: typeof title === "string" ? title : "",
    body: rawBody,
  });

  if (result.deduped) {
    return NextResponse.json({
      ...result,
      extraction: {
        status: "skipped",
        reason: "duplicate_source",
      },
    });
  }

  const projects = await getProjects();
  const projectMatch = await matchAndAssignSourceItemToProject({
    sourceItem: result.sourceItem,
    projects,
  });
  const sourceItem = projectMatch.sourceItem;
  const project = sourceItem.projectId
    ? projects.find((candidate) => candidate.id === sourceItem.projectId)
    : null;
  let sourceIndexingError: string | null = null;

  try {
    await indexSourceItem(sourceItem);
  } catch (err) {
    sourceIndexingError = err instanceof Error ? err.message : "Source indexing failed.";
  }

  const extraction = await extractTasksFromSourceItem({
    sourceItem,
    project: project
      ? {
          name: project.name,
          description: project.description,
          keywords: project.keywords,
          people: project.people,
        }
      : null,
    currentUserName: null,
  });

  const knowledgeExtraction = await extractKnowledgeFromSourceItem({
    sourceItem,
    project: project
      ? {
          name: project.name,
          description: project.description,
          keywords: project.keywords,
          people: project.people,
        }
      : null,
  });

  return NextResponse.json({
    sourceItem,
    deduped: result.deduped,
    projectMatch: {
      status: projectMatch.match.projectId ? "matched" : "unassigned",
      projectId: projectMatch.match.projectId,
      projectName: project ? project.name : null,
      confidence: projectMatch.match.confidence,
      matchedSignals: projectMatch.match.matchedSignals,
      reason: projectMatch.match.reason,
      error: projectMatch.match.error,
    },
    sourceIndexing: sourceIndexingError
      ? {
          status: "failed",
          error: sourceIndexingError,
        }
      : {
          status: "completed",
        },
    extraction: extraction.ok
      ? {
          status: "completed",
          tasks: extraction.tasks.length,
          evidence: extraction.evidence.length,
        }
      : {
          status: "failed",
          error: extraction.error ?? "Extraction failed.",
        },
    knowledgeExtraction: knowledgeExtraction.ok
      ? {
          status: "completed",
          items: knowledgeExtraction.items.map((entry) => ({
            id: entry.item.id,
            type: entry.item.type,
            title: entry.item.title,
            content: entry.item.content,
            confidence: entry.item.confidence,
            evidenceQuotes: entry.evidenceQuotes,
            isUnclear: entry.isUnclear,
          })),
        }
      : {
          status: "failed",
          error: knowledgeExtraction.error ?? "Knowledge extraction failed.",
        },
  });
}
