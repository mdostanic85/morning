import "server-only";

import { fetchFigmaFilesViaApi } from "@/lib/connectors/figma";
import { figmaDesignUrl, normalizeFigmaNodeId, parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { fetchFigmaFilesViaMcp } from "@/lib/connectors/mcp/adapters/figma";
import { isMcpTransport } from "@/lib/connectors/transport";
import {
  buildFigmaFrameDiscoveryUserPrompt,
  figmaFrameDiscoveryOutputSchema,
} from "@/lib/llm/prompts/figmaFrameDiscovery";
import { runLlmJob } from "@/lib/llm/router";
import { localDateString } from "@/lib/dates";
import { selectDeliveryAudits } from "@/lib/tasks/deliveryAuditSelection";
import {
  resolveTaskDeliveryLinks,
  type ResolvedDeliveryLinks,
} from "@/lib/tasks/deliveryLinks";
import { runDeliverySyncReview } from "@/lib/tasks/deliverySyncReview";
import { getConnectionByProvider } from "@/services/connections";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import {
  getTodayQueue,
  getWorkTasks,
  updateWorkTask,
  type WorkTaskWithEvidence,
} from "@/services/workTasks";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import type { SourceItem } from "@/domain/sourceItem";

const MAX_TASKS_PER_SYNC = 5;
/** Extra audits per sync for tasks outside today's queue that gained evidence. */
const MAX_LINKED_AUDITS = 5;
const MAX_FIGMA_FILES_PER_TASK = 5;
const MAX_OUTLINE_CHARS = 24_000;

export interface FigmaTaskAuditBatchResult {
  attempted: number;
  completed: number;
  skipped: number;
  errors: string[];
}

function stringMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fileKeyFromSource(source: SourceItem): string | null {
  return (
    stringMetadata(source.metadata?.fileKey) ||
    (source.url ? parseFigmaUrl(source.url)?.fileKey ?? null : null)
  );
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function taskRequirementEvidence(
  task: WorkTaskWithEvidence,
  sourceById: Map<number, SourceItem>
) {
  return task.evidence.map((item) => {
    const source = sourceById.get(item.sourceItemId);
    return {
      sourceTitle: source?.title ?? "Task evidence",
      sourceType: source?.sourceType ?? "unknown",
      sourceDate: item.sourceDate,
      quote: item.quote,
      summary: item.summary,
      url: item.url ?? source?.url ?? null,
    };
  });
}

function deliveryLinksForTask(
  task: WorkTaskWithEvidence,
  sourceById: Map<number, SourceItem>
): ResolvedDeliveryLinks {
  return resolveTaskDeliveryLinks({
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
    sources: task.evidence.flatMap((item) => {
      const source = sourceById.get(item.sourceItemId);
      return source
        ? [
            {
              id: source.id,
              title: source.title,
              body: source.body,
              url: source.url,
              sourceDate: source.sourceDate,
            },
          ]
        : [];
    }),
  });
}

function candidateFromStoredSource(source: SourceItem): ConnectorSourceCandidate | null {
  const fileKey = fileKeyFromSource(source);
  if (!fileKey || !source.body.trim()) return null;
  return {
    sourceType: "figma",
    sourceExternalId: source.sourceExternalId ?? `${fileKey}:structure`,
    title: source.title,
    sourceDate: source.sourceDate,
    url: source.url ?? figmaDesignUrl(fileKey),
    body: source.body,
    metadata: { ...(source.metadata ?? {}), fileKey },
  };
}

async function loadCandidateOutlines(
  fileKeys: string[],
  figmaSources: SourceItem[],
  useMcp: boolean
): Promise<ConnectorSourceCandidate[]> {
  const live = useMcp
    ? await fetchFigmaFilesViaMcp({ figmaFileKeys: fileKeys })
    : await fetchFigmaFilesViaApi({ figmaFileKeys: fileKeys });
  const byFileKey = new Map<string, ConnectorSourceCandidate>();
  for (const candidate of live) {
    const key = stringMetadata(candidate.metadata?.fileKey);
    if (key) byFileKey.set(key, candidate);
  }
  for (const source of figmaSources) {
    const candidate = candidateFromStoredSource(source);
    const key = candidate ? stringMetadata(candidate.metadata?.fileKey) : null;
    if (candidate && key && !byFileKey.has(key)) byFileKey.set(key, candidate);
  }
  return Array.from(byFileKey.values()).slice(0, MAX_FIGMA_FILES_PER_TASK);
}

async function discoverFrameUrl(input: {
  task: WorkTaskWithEvidence;
  sourceById: Map<number, SourceItem>;
  candidates: ConnectorSourceCandidate[];
}): Promise<{ url: string | null; error?: string }> {
  if (input.candidates.length === 0) return { url: null };

  const files = input.candidates.flatMap((candidate) => {
    const fileKey = stringMetadata(candidate.metadata?.fileKey);
    if (!fileKey) return [];
    return [{
      fileKey,
      title: candidate.title,
      url: candidate.url ?? figmaDesignUrl(fileKey),
      outline: candidate.body.slice(0, MAX_OUTLINE_CHARS),
    }];
  });
  if (files.length === 0) return { url: null };

  const result = await runLlmJob({
    jobType: "figma_frame_discovery",
    userPrompt: buildFigmaFrameDiscoveryUserPrompt({
      today: localDateString(),
      task: {
        title: input.task.title,
        reason: input.task.reason,
        nextAction: input.task.nextAction,
        doneCriteria: input.task.doneCriteria,
        evidence: taskRequirementEvidence(input.task, input.sourceById),
      },
      files,
    }),
    schema: figmaFrameDiscoveryOutputSchema,
  });
  if (!result.ok) return { url: null, error: `${result.kind}: ${result.error}` };
  if (!result.data.matched || !result.data.fileKey || !result.data.nodeId) {
    return { url: null };
  }

  const file = files.find((candidate) => candidate.fileKey === result.data.fileKey);
  const nodeId = normalizeFigmaNodeId(result.data.nodeId);
  if (
    !file ||
    (!file.outline.includes(result.data.nodeId) && !file.outline.includes(nodeId))
  ) {
    return { url: null, error: "OpenAI selected a Figma node that was not present in the candidate outline." };
  }
  return { url: figmaDesignUrl(file.fileKey, nodeId) };
}

async function auditTask(input: {
  task: WorkTaskWithEvidence;
  sourceItems: SourceItem[];
  sourceById: Map<number, SourceItem>;
  projectFigmaFileKeys: string[];
  useMcp: boolean;
}): Promise<{ status: "completed" | "skipped" | "failed"; error?: string }> {
  const links = deliveryLinksForTask(input.task, input.sourceById);
  const explicitUrl = links.figmaFrameUrl;
  const explicitParsed = explicitUrl ? parseFigmaUrl(explicitUrl) : null;
  let frameUrl = explicitParsed?.nodeId ? explicitUrl : null;

  // A PR or repo found in the ticket/comments is the only GitHub pointer many
  // design tasks ever get — persist it so the review can read branch activity.
  if (links.githubRepo && links.githubRepo !== input.task.githubRepo) {
    await updateWorkTask(input.task.id, { githubRepo: links.githubRepo });
  }

  if (!frameUrl) {
    const evidenceSourceIds = new Set(input.task.evidence.map((item) => item.sourceItemId));
    const relevantFigmaSources = input.sourceItems.filter(
      (source) =>
        source.sourceType === "figma" &&
        (evidenceSourceIds.has(source.id) ||
          (input.task.projectId != null && source.projectId === input.task.projectId) ||
          (explicitParsed != null && fileKeyFromSource(source) === explicitParsed.fileKey))
    );
    const fileKeys = unique([
      explicitParsed?.fileKey,
      ...input.projectFigmaFileKeys,
      ...relevantFigmaSources.map(fileKeyFromSource),
    ]).slice(0, MAX_FIGMA_FILES_PER_TASK);
    if (fileKeys.length === 0) return { status: "skipped" };

    const candidates = await loadCandidateOutlines(
      fileKeys,
      relevantFigmaSources,
      input.useMcp
    );
    const discovery = await discoverFrameUrl({
      task: input.task,
      sourceById: input.sourceById,
      candidates,
    });
    if (discovery.error) return { status: "failed", error: discovery.error };
    frameUrl = discovery.url;
  }

  if (!frameUrl) return { status: "skipped" };
  if (input.task.figmaFrameUrl !== frameUrl) {
    await updateWorkTask(input.task.id, { figmaFrameUrl: frameUrl });
  }
  const review = await runDeliverySyncReview({
    taskId: input.task.id,
    figmaFrameUrl: frameUrl,
  });
  if (!review.ok) return { status: "failed", error: review.error ?? "Figma audit failed." };
  return { status: "completed" };
}

/** Newest evidence timestamp on a task, or null when it cites nothing dated. */
function newestEvidenceDate(task: WorkTaskWithEvidence): string | null {
  const dated = task.evidence
    .map((item) => ({ raw: item.sourceDate, time: Date.parse(item.sourceDate) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);
  return dated[0]?.raw ?? null;
}

function auditsWithFreshDeliveryEvidence(input: {
  tasks: WorkTaskWithEvidence[];
  alreadyQueued: Set<number>;
  sourceById: Map<number, SourceItem>;
}): WorkTaskWithEvidence[] {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const selected = selectDeliveryAudits(
    input.tasks.map((task) => ({
      taskId: task.id,
      status: task.status,
      frameUrl: deliveryLinksForTask(task, input.sourceById).figmaFrameUrl,
      newestEvidenceAt: newestEvidenceDate(task),
      lastReviewedAt: task.latestSyncReviewReport?.createdAt ?? null,
    })),
    { skipTaskIds: input.alreadyQueued, limit: MAX_LINKED_AUDITS }
  );
  return selected.flatMap((taskId) => {
    const task = taskById.get(taskId);
    return task ? [task] : [];
  });
}

export async function runTodayFigmaTaskAudits(): Promise<FigmaTaskAuditBatchResult> {
  const figmaConnection = await getConnectionByProvider("figma");
  if (!figmaConnection || figmaConnection.status !== "connected") {
    return { attempted: 0, completed: 0, skipped: 0, errors: [] };
  }

  const [queue, allTasks, sourceItems, projects] = await Promise.all([
    getTodayQueue(),
    getWorkTasks(),
    getSourceItems(),
    getProjects(),
  ]);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const queueTasks = [...queue.now, ...queue.next].slice(0, MAX_TASKS_PER_SYNC);
  const tasks = [
    ...queueTasks,
    ...auditsWithFreshDeliveryEvidence({
      tasks: allTasks,
      alreadyQueued: new Set(queueTasks.map((task) => task.id)),
      sourceById,
    }),
  ];
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const outcomes = await Promise.all(
    tasks.map((task) =>
      auditTask({
        task,
        sourceItems,
        sourceById,
        projectFigmaFileKeys:
          task.projectId != null ? projectById.get(task.projectId)?.figmaFileKeys ?? [] : [],
        useMcp: isMcpTransport(figmaConnection),
      }).catch((error: unknown) => ({
        status: "failed" as const,
        error: error instanceof Error ? error.message : "Unknown Figma audit error.",
      }))
    )
  );

  return {
    attempted: tasks.length,
    completed: outcomes.filter((outcome) => outcome.status === "completed").length,
    skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
    errors: outcomes.flatMap((outcome, index) =>
      outcome.status === "failed"
        ? [`${tasks[index]?.title ?? `Task ${index + 1}`}: ${outcome.error ?? "Figma audit failed."}`]
        : []
    ),
  };
}
