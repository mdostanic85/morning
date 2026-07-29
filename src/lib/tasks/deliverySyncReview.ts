import "server-only";
import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { fetchFigmaFrameEvidenceViaApi } from "@/lib/connectors/figma";
import {
  fetchFigmaFrameEvidenceViaMcp,
  type FigmaFrameEvidence,
} from "@/lib/connectors/mcp/adapters/figma";
import { isMcpTransport } from "@/lib/connectors/transport";
import {
  figmaCommentMessage,
  selectFigmaCommentsForFrame,
} from "@/lib/figma/commentThread";
import { scanLocalGitBranches, scanLocalGitRepo } from "@/lib/connectors/localGit";
import { fetchGitHubRepoActivity, parseGitHubWorkContext } from "@/lib/connectors/github";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildDeliverySyncReviewUserPrompt,
  deliverySyncReviewOutputSchema,
} from "@/lib/llm/prompts/deliverySyncReview";
import {
  collectDeliverableTexts,
  extractFigmaUrl,
  extractGitBranch,
  extractJiraKey,
} from "@/lib/tasks/deliverableContext";
import { resolveTaskDeliveryLinks } from "@/lib/tasks/deliveryLinks";
import { getKnowledgeItems } from "@/services/knowledgeItems";
import { getConnectionByProvider } from "@/services/connections";
import { getProjectById } from "@/services/projects";
import { createSyncReviewReport } from "@/services/syncReviewReports";
import { getSourceItems } from "@/services/sourceItems";
import { getWorkTaskById } from "@/services/workTasks";
import type { SyncReviewReport } from "@/domain/syncReviewReport";

export interface RunDeliverySyncReviewResult {
  ok: boolean;
  report?: SyncReviewReport;
  githubBranch?: string | null;
  figmaUrl?: string | null;
  error?: string;
}

function emptyResult(error: string): RunDeliverySyncReviewResult {
  return { ok: false, error };
}

export async function runDeliverySyncReview(input: {
  taskId: number;
  githubBranch?: string;
  figmaFrameUrl?: string;
  referenceLinks?: { label: string; url: string }[];
}): Promise<RunDeliverySyncReviewResult> {
  const task = await getWorkTaskById(input.taskId);
  if (!task) return emptyResult("Task not found.");

  const [sourceItems, knowledgeItems, project] = await Promise.all([
    getSourceItems(),
    getKnowledgeItems(),
    task.projectId != null ? getProjectById(task.projectId) : Promise.resolve(null),
  ]);

  const jiraKey = extractJiraKey(task.title);
  const texts = collectDeliverableTexts({
    title: task.title,
    reason: task.reason,
    nextAction: task.nextAction,
    doneCriteria: task.doneCriteria,
    evidenceQuotes: task.evidence.map((item) => item.quote ?? item.summary),
    referenceLinks: input.referenceLinks,
  });

  // Scans the full body of every cited source, so a frame or PR link that only
  // exists in a Jira comment is still found (evidence quotes are too short to
  // carry it).
  const deliveryLinks = resolveTaskDeliveryLinks({
    task: {
      title: task.title,
      reason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      figmaFrameUrl: task.figmaFrameUrl,
      githubRepo: task.githubRepo,
    },
    evidence: task.evidence.map((item) => ({
      sourceItemId: item.sourceItemId,
      quote: item.quote,
      summary: item.summary,
      url: item.url,
    })),
    sources: sourceItems.map((source) => ({
      id: source.id,
      title: source.title,
      body: source.body,
      url: source.url,
      sourceDate: source.sourceDate,
    })),
  });

  const figmaFrameUrl =
    input.figmaFrameUrl?.trim() ||
    deliveryLinks.figmaFrameUrl ||
    extractFigmaUrl(texts) ||
    null;

  const localRepoPath =
    task.localRepoPath?.trim() || project?.repoPaths[0]?.trim() || null;
  const githubConnection = await getConnectionByProvider("github");
  const githubWorkContext = parseGitHubWorkContext(githubConnection?.metadata);
  const githubRepo =
    task.githubRepo?.trim() ||
    deliveryLinks.githubRepo ||
    project?.githubRepositories[0]?.trim() ||
    githubWorkContext.repository ||
    null;

  let githubBranch =
    input.githubBranch?.trim() ||
    extractGitBranch(texts, jiraKey) ||
    githubWorkContext.branch ||
    null;

  let githubRepoActivity = null;
  let githubFetchError: string | null = null;
  if (githubRepo) {
    try {
      githubRepoActivity = await fetchGitHubRepoActivity(githubRepo);
      if (!githubBranch && githubRepoActivity.openPullRequests.length > 0) {
        // A PR someone linked in the ticket beats guessing from the Jira key.
        const linkedNumber = deliveryLinks.githubPullRequestUrl
          ? Number(deliveryLinks.githubPullRequestUrl.match(/\/pull\/(\d+)/)?.[1])
          : NaN;
        const linkedMatch = Number.isFinite(linkedNumber)
          ? githubRepoActivity.openPullRequests.find((pr) => pr.number === linkedNumber)
          : null;
        const jiraMatch = jiraKey
          ? githubRepoActivity.openPullRequests.find(
              (pr) =>
                pr.headRef.toLowerCase().includes(jiraKey.toLowerCase()) ||
                pr.title.toLowerCase().includes(jiraKey.toLowerCase())
            )
          : null;
        githubBranch =
          linkedMatch?.headRef ??
          jiraMatch?.headRef ??
          githubRepoActivity.openPullRequests[0]?.headRef ??
          githubBranch;
      }
    } catch (err) {
      githubFetchError = err instanceof Error ? err.message : "Could not fetch GitHub activity.";
    }
  }

  let figmaEvidence: FigmaFrameEvidence | null = null;
  let figmaFetchError: string | null = null;

  if (figmaFrameUrl) {
    const parsed = parseFigmaUrl(figmaFrameUrl);
    if (!parsed?.nodeId) {
      return emptyResult(
        "Figma link must point to a specific frame — copy the URL while the frame is selected (node-id required)."
      );
    }

    const figmaConnection = await getConnectionByProvider("figma");
    if (!figmaConnection || figmaConnection.status !== "connected") {
      return emptyResult("Connect Figma in Settings before running Review Status.");
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
    } catch (err) {
      figmaFetchError = err instanceof Error ? err.message : "Could not fetch Figma frame.";
    }
  }

  // Outcomes like "Lucas confirms the updated icons" are answered in the frame's
  // comment thread, not in the layer tree. Those comments are already imported
  // as source items, but they only become task evidence when they also produce
  // an extracted task — a bare "looks good" never does. Read them straight off
  // the reviewed frame so an approval or a fresh change request is never
  // invisible to the outcome check.
  const reviewedFrame = figmaFrameUrl ? parseFigmaUrl(figmaFrameUrl) : null;
  const figmaCommentThread = reviewedFrame
    ? selectFigmaCommentsForFrame(sourceItems, reviewedFrame)
        .map((comment) => ({
          author: comment.author,
          postedAt: comment.sourceDate,
          isReply: Boolean(comment.metadata?.parentId),
          message: figmaCommentMessage(comment.body) ?? comment.body,
        }))
    : [];

  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const evidenceSourceIds = new Set(task.evidence.map((item) => item.sourceItemId));
  const linkedKnowledge = knowledgeItems.filter((item) => {
    if (task.projectId != null && item.projectId === task.projectId) return true;
    return item.sourceItemId != null && evidenceSourceIds.has(item.sourceItemId);
  });

  const repoPaths = [
    ...(localRepoPath ? [localRepoPath] : []),
    ...(project?.repoPaths ?? []),
  ];
  const uniqueRepoPaths = Array.from(new Set(repoPaths.map((path) => path.trim()).filter(Boolean)));

  const gitBranchEvidence =
    githubBranch && uniqueRepoPaths.length > 0
      ? await scanLocalGitBranches(uniqueRepoPaths, githubBranch)
      : [];

  const localGitEvidence =
    !githubBranch && localRepoPath ? await scanLocalGitRepo(localRepoPath) : null;

  if (!githubBranch && !figmaFrameUrl && !githubRepo && !localRepoPath) {
    return emptyResult(
      "No git branch, repo, or Figma frame found. Add links to the task context, evidence, or project integration settings."
    );
  }

  const result = await runLlmJob({
    jobType: "delivery_sync_review",
    userPrompt: buildDeliverySyncReviewUserPrompt({
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
      githubRepo,
      githubBranch,
      githubRepoActivity: githubRepoActivity
        ? {
            repository: githubRepoActivity.repository,
            defaultBranch: githubRepoActivity.defaultBranch,
            openPullRequests: githubRepoActivity.openPullRequests,
            recentCommits: githubRepoActivity.recentCommits,
            fetchError: githubFetchError ?? undefined,
          }
        : null,
      gitBranchEvidence: gitBranchEvidence.map((repo) => ({
        repoPath: repo.repoPath,
        targetBranch: repo.targetBranch,
        baseBranch: repo.baseBranch,
        branchExists: repo.branchExists,
        latestCommits: repo.latestCommits,
        diffSummary: repo.diffSummary,
        uiChangedFiles: repo.uiChangedFiles,
        uiDiffExcerpt: repo.uiDiffExcerpt,
        visualNote: repo.visualNote,
        error: repo.error,
      })),
      localGitEvidence: localGitEvidence
        ? {
            repoPath: localGitEvidence.repoPath,
            currentBranch: localGitEvidence.currentBranch,
            status: localGitEvidence.status,
            changedFiles: localGitEvidence.changedFiles,
            diffSummary: localGitEvidence.diffSummary,
            latestCommits: localGitEvidence.latestCommits,
            error: localGitEvidence.error,
          }
        : null,
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
      figmaCommentThread,
    }),
    schema: deliverySyncReviewOutputSchema,
    imageUrls: figmaEvidence?.screenshotUrl ? [figmaEvidence.screenshotUrl] : undefined,
  });

  if (!result.ok) {
    return emptyResult(`${result.kind}: ${result.error}`);
  }

  const report = await createSyncReviewReport({
    taskId: task.id,
    summary: result.data.summary,
    ok: result.data.ok,
    notOk: result.data.notOk,
    conflicts: result.data.conflicts,
    githubBranch,
    figmaUrl: figmaFrameUrl,
    recommendedNextAction: result.data.recommendedNextAction,
    confidence: result.data.confidence,
  });

  return { ok: true, report, githubBranch, figmaUrl: figmaFrameUrl };
}
