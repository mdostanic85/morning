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
import { collectDeliverableTexts, extractFigmaUrl } from "@/lib/tasks/deliverableContext";
import { runDeliverySyncReview } from "@/lib/tasks/deliverySyncReview";
import { getConnectionByProvider } from "@/services/connections";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getTodayQueue, updateWorkTask, type WorkTaskWithEvidence } from "@/services/workTasks";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import type { SourceItem } from "@/domain/sourceItem";

const MAX_TASKS_PER_SYNC = 5;
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

function explicitFigmaUrl(
  task: WorkTaskWithEvidence,
  sourceById: Map<number, SourceItem>
): string | null {
  if (task.figmaFrameUrl?.trim()) return task.figmaFrameUrl.trim();
  const evidence = task.evidence.map((item) => {
    const source = sourceById.get(item.sourceItemId);
    return [item.quote ?? item.summary, item.url, source?.url].filter(Boolean).join(" ");
  });
  return extractFigmaUrl(
    collectDeliverableTexts({
      title: task.title,
      reason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      evidenceQuotes: evidence,
    })
  );
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
  const explicitUrl = explicitFigmaUrl(input.task, input.sourceById);
  const explicitParsed = explicitUrl ? parseFigmaUrl(explicitUrl) : null;
  let frameUrl = explicitParsed?.nodeId ? explicitUrl : null;

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

export async function runTodayFigmaTaskAudits(): Promise<FigmaTaskAuditBatchResult> {
  const figmaConnection = await getConnectionByProvider("figma");
  if (!figmaConnection || figmaConnection.status !== "connected") {
    return { attempted: 0, completed: 0, skipped: 0, errors: [] };
  }

  const [queue, sourceItems, projects] = await Promise.all([
    getTodayQueue(),
    getSourceItems(),
    getProjects(),
  ]);
  const tasks = [...queue.now, ...queue.next].slice(0, MAX_TASKS_PER_SYNC);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
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
