import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildPriorityPlannerUserPrompt,
  priorityPlanningOutputSchema,
  type PriorityPlannerInput,
  type PriorityPlannerProjectContext,
  type PriorityPlannerRecentSource,
  type TaskForPlanning,
} from "@/lib/llm/prompts/priorityPlanner";
import {
  buildPlannerSummaryFromRanking,
  buildQueueDecisionsFromRanking,
  rankWorkTask,
  rankWorkTasks,
  type WorkTaskForRanking,
} from "@/lib/tasks/priorityRank";
import { filterActiveProjects, getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getUserProfile } from "@/services/userProfile";
import type { AttendanceContext } from "@/lib/tasks/sourceAuthority";
import {
  applyPlannerDecisions,
  getTodayQueue,
  type WorkTaskWithEvidence,
} from "@/services/workTasks";
import { getLatestDailyMemory } from "@/services/dailyMemories";
import { isRejectedOwnership } from "@/lib/tasks/ownershipDecision";
import { planJiraAnchorEvidenceAdoption } from "@/lib/tasks/jiraAnchorEvidence";
import { createEvidence } from "@/services/evidence";
import {
  fetchJiraPendingSnapshot,
  type JiraPendingSnapshot,
} from "@/lib/connectors/jiraPending";
import { OPEN_QUEUE_STATUSES, type WorkTaskStatus } from "@/domain/workTask";
import { localDateString } from "@/lib/dates";
import type { Project } from "@/domain/project";
import type { SourceItem } from "@/domain/sourceItem";
import {
  resolvePlannerConfidence,
  shouldRouteLowConfidenceToUnclear,
} from "@/lib/tasks/plannerConfidence";
import {
  reconcileJiraWorkItems,
  reconcileSelfReportedCompletion,
} from "@/services/jiraWorkItemReconciliation";

const RECENT_SOURCE_LIMIT = 8;
const SOURCE_EXCERPT_LENGTH = 360;
const LLM_PLANNER_TASK_LIMIT = 40;
const PRIORITY_PLANNER_PROMPT_VERSION = 2;
const SUMMARY_PATH = path.join(process.cwd(), "data", "today-queue-summary.json");

export interface PriorityPlanSummary {
  summary: string;
  plannedAt: string;
  today: string;
  updatedTaskCount: number;
  inputHash?: string;
}

export interface RebuildTodayQueueResult {
  ok: boolean;
  summary?: PriorityPlanSummary;
  updatedTaskCount: number;
  error?: string;
}

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > SOURCE_EXCERPT_LENGTH
    ? `${trimmed.slice(0, SOURCE_EXCERPT_LENGTH)}...`
    : trimmed;
}

function readJsonFile(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeSummary(summary: PriorityPlanSummary) {
  const dir = path.dirname(SUMMARY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
}

export async function getTodayQueueSummary(): Promise<PriorityPlanSummary | null> {
  const raw = readJsonFile(SUMMARY_PATH);
  if (
    raw &&
    typeof raw === "object" &&
    "summary" in raw &&
    "plannedAt" in raw &&
    "today" in raw &&
    "updatedTaskCount" in raw
  ) {
    return raw as PriorityPlanSummary;
  }
  return null;
}

/**
 * The full structured end-of-day memory (not just the summary), so the
 * planner can honor "still open", "waiting on" and "first thing tomorrow".
 */
async function getPreviousDailyMemory(): Promise<string | null> {
  const memory = await getLatestDailyMemory();
  if (!memory) return null;
  return [
    `Date: ${memory.date}`,
    `Summary: ${memory.summary}`,
    memory.firstTomorrow ? `Planned first task for the next day: ${memory.firstTomorrow}` : null,
    memory.stillOpen.length > 0 ? `Still open: ${memory.stillOpen.join("; ")}` : null,
    memory.waitingOn.length > 0 ? `Waiting on: ${memory.waitingOn.join("; ")}` : null,
    memory.risks.length > 0 ? `Risks: ${memory.risks.join("; ")}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function flattenQueue(queue: Awaited<ReturnType<typeof getTodayQueue>>): WorkTaskWithEvidence[] {
  return OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]);
}

function buildProjectContext(projects: Project[]): PriorityPlannerProjectContext[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    keywords: project.keywords,
    people: project.people,
    jiraKeys: project.jiraKeys,
    repoPaths: project.repoPaths,
    githubRepositories: project.githubRepositories,
    confluenceSpaces: project.confluenceSpaces,
    confluencePageUrls: project.confluencePageUrls,
    discordChannels: project.discordChannels,
    figmaFileKeys: project.figmaFileKeys,
  }));
}

function buildRecentSources(
  sourceItems: SourceItem[],
  projectNameById: Map<number, string>
): PriorityPlannerRecentSource[] {
  return sourceItems.slice(0, RECENT_SOURCE_LIMIT).map((sourceItem) => ({
    id: sourceItem.id,
    projectName: sourceItem.projectId ? projectNameById.get(sourceItem.projectId) ?? null : null,
    sourceType: sourceItem.sourceType,
    title: sourceItem.title,
    sourceDate: sourceItem.sourceDate,
    excerpt: excerpt(sourceItem.body),
  }));
}

function toWorkTaskForRanking(task: WorkTaskWithEvidence): WorkTaskForRanking {
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    reason: task.reason,
    nextAction: task.nextAction,
    doneCriteria: task.doneCriteria,
    priorityScore: task.priorityScore,
    dueDate: task.dueDate,
    waitingOn: task.waitingOn,
    statusManuallySet: task.statusManuallySet,
    evidence: task.evidence.map((item) => ({
      sourceItemId: item.sourceItemId,
      quote: item.quote,
      summary: item.summary,
    })),
  };
}

function buildTasksForPlanning(
  tasks: WorkTaskWithEvidence[],
  projectNameById: Map<number, string>,
  sourceById: Map<number, SourceItem>,
  jiraPending: Awaited<ReturnType<typeof fetchJiraPendingSnapshot>>,
  today: string,
  attendance?: AttendanceContext
): TaskForPlanning[] {
  const jiraByKey = new Map(jiraPending.map((issue) => [issue.key, issue]));

  return tasks.map((task) => {
    const sources = task.evidence
      .map((item) => sourceById.get(item.sourceItemId))
      .filter((source): source is SourceItem => source != null);
    const ranked = rankWorkTask(toWorkTaskForRanking(task), today, sourceById, jiraByKey, attendance);

    return {
      id: task.id,
      projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
      title: task.title,
      reason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      currentStatus: task.status as Exclude<WorkTaskStatus, "done">,
      priorityScore: task.priorityScore,
      confidence: task.confidence,
      waitingOn: task.waitingOn,
      dueDate: task.dueDate,
      owner: task.owner,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      evidenceCount: task.evidence.length,
      sourceTypes: Array.from(new Set(sources.map((source) => source.sourceType))),
      sourceTitles: Array.from(new Set(sources.map((source) => source.title))),
      evidenceSummaries: task.evidence.map((item) => item.summary),
      evidenceSources: task.evidence
        .map((item) => {
          const source = sourceById.get(item.sourceItemId);
          if (!source) return null;
          return {
            title: source.title,
            sourceType: source.sourceType,
            sourceDate: source.sourceDate,
            url: source.url ?? null,
            quote: item.quote,
          };
        })
        .filter((source) => source != null),
      jiraKey: ranked.jiraKey,
      jiraPriority: ranked.jiraPriority,
      rankExplanation: ranked.explanation.join(" · "),
    };
  });
}

export async function rebuildTodayQueue(options?: {
  today?: string;
  jiraPending?: JiraPendingSnapshot[];
}): Promise<RebuildTodayQueueResult> {
  // Close Done Jira work items and merge duplicates before ranking.
  await reconcileJiraWorkItems();
  // Close tasks whose own freshest evidence self-reports the work is done
  // (e.g. today's meeting notes saying the design is finalized).
  await reconcileSelfReportedCompletion();

  const today = options?.today ?? localDateString();
  const [queue, allProjects, sourceItems, previousDailyMemory, profile] = await Promise.all([
    getTodayQueue(),
    getProjects(),
    getSourceItems(),
    getPreviousDailyMemory(),
    getUserProfile(),
  ]);
  const attendance: AttendanceContext = {
    myName: profile?.name ?? null,
    myEmail: profile?.email ?? null,
  };
  const projects = filterActiveProjects(allProjects);
  const inactiveProjectIds = new Set(
    allProjects.filter((project) => project.status === "inactive").map((project) => project.id)
  );
  // Tasks the user manually triaged (Start/Snooze/Waiting/Not mine) and tasks
  // sitting in "unclear" are not re-planned — only the user resolves those.
  // They keep their status; the planner only ranks the rest.
  const allOpen = flattenQueue(queue).filter((task) => !isRejectedOwnership(task));
  const tasks = allOpen.filter(
    (task) =>
      !task.statusManuallySet &&
      task.status !== "unclear" &&
      (task.projectId == null || !inactiveProjectIds.has(task.projectId))
  );

  if (tasks.length === 0) {
    const summary = {
      summary: "No open tasks were available to prioritize.",
      plannedAt: new Date().toISOString(),
      today,
      updatedTaskCount: 0,
    };
    writeSummary(summary);
    return { ok: true, summary, updatedTaskCount: 0 };
  }

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const sourceById = new Map(sourceItems.map((sourceItem) => [sourceItem.id, sourceItem]));
  const activeSources = sourceItems.filter((sourceItem) => {
    if (sourceItem.projectId == null) return true;
    return !inactiveProjectIds.has(sourceItem.projectId);
  });

  // Retroactive consolidation: Jira anchor tasks adopt transcript evidence
  // from open fragment tasks about the same topic, so the real ticket gets
  // the meeting freshness/attendance boosts instead of only the fragments.
  const adoptions = planJiraAnchorEvidenceAdoption({
    tasks: allOpen,
    sourceById: new Map(
      sourceItems.map((sourceItem) => [sourceItem.id, sourceItem])
    ),
  });
  const taskById = new Map(allOpen.map((task) => [task.id, task]));
  for (const adoption of adoptions) {
    const saved = await createEvidence({
      taskId: adoption.anchorTaskId,
      sourceItemId: adoption.sourceItemId,
      quote: adoption.quote,
      summary: adoption.summary,
      sourceDate: adoption.sourceDate,
      url: adoption.url,
    });
    taskById.get(adoption.anchorTaskId)?.evidence.push(saved);
  }

  const jiraPending = options?.jiraPending ?? await fetchJiraPendingSnapshot();
  const rankingTasks = tasks.map(toWorkTaskForRanking);
  const ranked = rankWorkTasks(rankingTasks, today, sourceById, jiraPending, attendance);
  const deterministicDecisions = buildQueueDecisionsFromRanking(ranked, rankingTasks);
  const plannerTaskIds = new Set(
    ranked.slice(0, LLM_PLANNER_TASK_LIMIT).map((entry) => entry.taskId)
  );
  const plannerTasks = tasks.filter((task) => plannerTaskIds.has(task.id));

  let summaryText = buildPlannerSummaryFromRanking(ranked, rankingTasks);

  const input: PriorityPlannerInput = {
    today,
    tasks: buildTasksForPlanning(
      plannerTasks,
      projectNameById,
      sourceById,
      jiraPending,
      today,
      attendance
    ),
    projects: buildProjectContext(projects),
    recentlyImportedSources: buildRecentSources(activeSources, projectNameById),
    previousDailyMemory,
  };
  const stablePlannerInput = {
    ...input,
    tasks: input.tasks.map((task) => ({ ...task, updatedAt: undefined })),
  };
  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        priorityPlannerPromptVersion: PRIORITY_PLANNER_PROMPT_VERSION,
        input: stablePlannerInput,
        deterministicDecisions,
      })
    )
    .digest("hex");
  const previousSummary = await getTodayQueueSummary();
  if (previousSummary?.today === today && previousSummary.inputHash === inputHash) {
    return {
      ok: true,
      summary: previousSummary,
      updatedTaskCount: 0,
    };
  }

  const llmResult = await runLlmJob({
    jobType: "priority_planning",
    userPrompt: buildPriorityPlannerUserPrompt(input),
    schema: priorityPlanningOutputSchema,
  });

  if (llmResult.ok && llmResult.data.summary.trim()) {
    summaryText = llmResult.data.summary.trim();
  }

  const semanticDecisionByTaskId = new Map(
    llmResult.ok
      ? llmResult.data.decisions.map((decision) => [decision.taskId, decision] as const)
      : []
  );

  // Tasks committed in a meeting the user attended in the last 4 days must stay
  // active — the LLM may not defer them to waiting/tomorrow/unclear.
  const forcedTaskIds = new Set(
    ranked.filter((entry) => entry.forceInclude).map((entry) => entry.taskId)
  );

  const confidenceByTaskId = new Map(
    tasks.map((task) => [task.id, task.confidence] as const)
  );

  const { updated } = await applyPlannerDecisions(
    deterministicDecisions.map((decision) => ({
      ...(() => {
        const semantic = semanticDecisionByTaskId.get(decision.taskId);
        const isForced = forcedTaskIds.has(decision.taskId);
        const confidence = resolvePlannerConfidence({
          semanticConfidence: semantic?.confidence,
          existingConfidence: confidenceByTaskId.get(decision.taskId) ?? null,
          priorityScore: decision.priorityScore,
        });
        const routeUnclear = shouldRouteLowConfidenceToUnclear({
          confidence,
          priorityScore: decision.priorityScore,
          forceInclude: isForced,
        });
        const semanticDeferredStatus =
          !isForced &&
          (semantic?.status === "waiting" ||
            semantic?.status === "tomorrow" ||
            semantic?.status === "unclear")
            ? semantic.status
            : null;
        const status =
          routeUnclear && !isForced
            ? ("unclear" as const)
            : (semanticDeferredStatus ?? decision.status);
        return {
          status,
          reason: semantic?.reason?.trim() || decision.reason,
          waitingOn:
            status === "waiting"
              ? semantic?.waitingOn ??
                rankingTasks.find((task) => task.id === decision.taskId)?.waitingOn ??
                null
              : null,
          confidence,
        };
      })(),
      taskId: decision.taskId,
      priorityScore: decision.priorityScore,
    }))
  );

  const summary = {
    summary: summaryText,
    plannedAt: new Date().toISOString(),
    today,
    updatedTaskCount: updated,
    inputHash,
  };
  writeSummary(summary);

  return {
    ok: true,
    summary,
    updatedTaskCount: updated,
  };
}
