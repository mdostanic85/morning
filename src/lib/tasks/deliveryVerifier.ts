import "server-only";
import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { fetchFigmaFrameEvidenceViaApi } from "@/lib/connectors/figma";
import { fetchGitHubRepoActivity } from "@/lib/connectors/github";
import {
  fetchFigmaFrameEvidenceViaMcp,
  type FigmaFrameEvidence,
} from "@/lib/connectors/mcp/adapters/figma";
import { isMcpTransport } from "@/lib/connectors/transport";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildDeliveryVerifierUserPrompt,
  deliveryVerificationOutputSchema,
} from "@/lib/llm/prompts/deliveryVerifier";
import { getKnowledgeItems } from "@/services/knowledgeItems";
import { getConnectionByProvider } from "@/services/connections";
import { getProjectById } from "@/services/projects";
import { createVerificationReport } from "@/services/verificationReports";
import { getSourceItems } from "@/services/sourceItems";
import { getWorkTaskById } from "@/services/workTasks";
import { scanLocalGitRepos, type LocalGitEvidence } from "@/lib/connectors/localGit";
import type { VerificationReport } from "@/domain/verificationReport";

export interface VerifyTaskDeliveryResult {
  ok: boolean;
  report?: VerificationReport;
  gitEvidence?: LocalGitEvidence[];
  figmaEvidence?: FigmaFrameEvidence | null;
  error?: string;
}

function emptyResult(error: string): VerifyTaskDeliveryResult {
  return { ok: false, error };
}

export async function verifyTaskDelivery(input: {
  taskId: number;
  deliveryNotes: string;
  figmaFrameUrl?: string;
}): Promise<VerifyTaskDeliveryResult> {
  const task = await getWorkTaskById(input.taskId);
  if (!task) {
    return emptyResult("Task not found.");
  }

  const figmaFrameUrl = (input.figmaFrameUrl?.trim() || task.figmaFrameUrl?.trim()) ?? "";
  let figmaEvidence: FigmaFrameEvidence | null = task.workContext?.figma?.evidence ?? null;
  let figmaFetchError: string | null = task.workContext?.figma?.error ?? null;

  if (figmaFrameUrl) {
    const parsed = parseFigmaUrl(figmaFrameUrl);
    if (!parsed?.nodeId) {
      return emptyResult(
        "Figma link must point to a specific frame — copy the URL while the frame is selected (it must include node-id)."
      );
    }

    const figmaConnection = await getConnectionByProvider("figma");
    if (!figmaConnection || figmaConnection.status !== "connected") {
      return emptyResult("Connect Figma in Settings before verifying against a frame.");
    }

    try {
      if (isMcpTransport(figmaConnection)) {
        figmaEvidence = await fetchFigmaFrameEvidenceViaMcp({
          fileKey: parsed.fileKey,
          nodeId: parsed.nodeId,
          frameUrl: figmaFrameUrl,
        });
      } else {
        figmaEvidence = await fetchFigmaFrameEvidenceViaApi({
          fileKey: parsed.fileKey,
          nodeId: parsed.nodeId,
          frameUrl: figmaFrameUrl,
        });
      }
      figmaFetchError = null;
    } catch (err) {
      figmaFetchError = err instanceof Error ? err.message : "Could not fetch Figma frame.";
    }
  }

  const [sourceItems, knowledgeItems, project] = await Promise.all([
    getSourceItems(),
    getKnowledgeItems(),
    task.projectId != null ? getProjectById(task.projectId) : Promise.resolve(null),
  ]);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const evidenceSourceIds = new Set(task.evidence.map((item) => item.sourceItemId));
  const linkedKnowledge = knowledgeItems.filter((item) => {
    if (task.projectId != null && item.projectId === task.projectId) return true;
    return item.sourceItemId != null && evidenceSourceIds.has(item.sourceItemId);
  });

  const repoPaths = task.localRepoPath?.trim()
    ? [task.localRepoPath.trim()]
    : (project?.repoPaths ?? []);
  const gitEvidence = repoPaths.length ? await scanLocalGitRepos(repoPaths) : [];

  let githubEvidence = task.workContext?.github?.evidence ?? null;
  let githubFetchError: string | null = task.workContext?.github?.error ?? null;
  if (task.githubRepo?.trim()) {
    try {
      githubEvidence = await fetchGitHubRepoActivity(task.githubRepo);
      githubFetchError = null;
    } catch (err) {
      githubFetchError = err instanceof Error ? err.message : "Could not fetch GitHub repository.";
    }
  }

  const result = await runLlmJob({
    jobType: "delivery_verification",
    userPrompt: buildDeliveryVerifierUserPrompt({
      taskTitle: task.title,
      taskReason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      taskEvidence: task.evidence.map((item) => ({
        quote: item.quote,
        summary: item.summary,
        sourceTitle: sourceById.get(item.sourceItemId)?.title ?? null,
        sourceDate: item.sourceDate,
      })),
      linkedKnowledge: linkedKnowledge.map((item) => ({
        type: item.type,
        title: item.title,
        content: item.content,
        confidence: item.confidence,
      })),
      gitEvidence: gitEvidence.map((repo) => ({
        repoPath: repo.repoPath,
        currentBranch: repo.currentBranch,
        status: repo.status,
        changedFiles: repo.changedFiles,
        diffSummary: repo.diffSummary,
        latestCommits: repo.latestCommits,
        error: repo.error,
      })),
      figmaEvidence: figmaFrameUrl
        ? {
            frameUrl: figmaFrameUrl,
            fileKey: figmaEvidence?.fileKey ?? parseFigmaUrl(figmaFrameUrl)?.fileKey ?? "",
            nodeId: figmaEvidence?.nodeId ?? parseFigmaUrl(figmaFrameUrl)?.nodeId ?? "",
            metadata: figmaEvidence?.metadata ?? "",
            designContext: figmaEvidence?.designContext ?? "",
            screenshotNote: figmaEvidence?.screenshotNote ?? null,
            fetchError: figmaFetchError ?? undefined,
          }
        : null,
      githubEvidence: task.githubRepo?.trim()
        ? {
            repository: githubEvidence?.repository ?? task.githubRepo,
            openPullRequests: githubEvidence?.openPullRequests ?? [],
            recentCommits: githubEvidence?.recentCommits ?? [],
            error: githubFetchError ?? undefined,
          }
        : null,
      workContextSummary: task.workContext?.summary ?? null,
      deliveryNotes: input.deliveryNotes,
    }),
    schema: deliveryVerificationOutputSchema,
  });

  if (!result.ok) {
    return { ...emptyResult(`${result.kind}: ${result.error}`), gitEvidence, figmaEvidence };
  }

  const report = await createVerificationReport({
    taskId: task.id,
    verdict: result.data.verdict,
    matches: result.data.matches,
    missing: result.data.missing,
    risks: result.data.risks,
    recommendedNextAction: result.data.recommendedNextAction,
    confidence: result.data.confidence,
  });

  return { ok: true, report, gitEvidence, figmaEvidence };
}
