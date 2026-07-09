import "server-only";
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
import {
  applyPlannerDecisions,
  getTodayQueue,
  type WorkTaskWithEvidence,
} from "@/services/workTasks";
import { getLatestDailyMemory } from "@/services/dailyMemories";
import { fetchJiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { OPEN_QUEUE_STATUSES, type WorkTaskStatus } from "@/domain/workTask";
import { localDateString } from "@/lib/dates";
import type { Project } from "@/domain/project";
import type { SourceItem } from "@/domain/sourceItem";

const RECENT_SOURCE_LIMIT = 8;
const SOURCE_EXCERPT_LENGTH = 360;
const SUMMARY_PATH = path.join(process.cwd(), "data", "today-queue-summary.json");

export interface PriorityPlanSummary {
  summary: string;
  plannedAt: string;
  today: string;
  updatedTaskCount: number;
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
  today: string
): TaskForPlanning[] {
  const jiraByKey = new Map(jiraPending.map((issue) => [issue.key, issue]));

  return tasks.map((task) => {
    const sources = task.evidence
      .map((item) => sourceById.get(item.sourceItemId))
      .filter((source): source is SourceItem => source != null);
    const ranked = rankWorkTask(toWorkTaskForRanking(task), today, sourceById, jiraByKey);

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
}): Promise<RebuildTodayQueueResult> {
  const today = options?.today ?? localDateString();
  const [queue, allProjects, sourceItems, previousDailyMemory] = await Promise.all([
    getTodayQueue(),
    getProjects(),
    getSourceItems(),
    getPreviousDailyMemory(),
  ]);
  const projects = filterActiveProjects(allProjects);
  const inactiveProjectIds = new Set(
    allProjects.filter((project) => project.status === "inactive").map((project) => project.id)
  );
  // Tasks the user manually triaged (Start/Snooze/Waiting/Not mine) and tasks
  // sitting in "unclear" are not re-planned — only the user resolves those.
  // They keep their status; the planner only ranks the rest.
  const allOpen = flattenQueue(queue);
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

  const jiraPending = await fetchJiraPendingSnapshot();
  const rankingTasks = tasks.map(toWorkTaskForRanking);
  const ranked = rankWorkTasks(rankingTasks, today, sourceById, jiraPending);
  const deterministicDecisions = buildQueueDecisionsFromRanking(ranked, rankingTasks);

  let summaryText = buildPlannerSummaryFromRanking(ranked, rankingTasks);

  const input: PriorityPlannerInput = {
    today,
    tasks: buildTasksForPlanning(tasks, projectNameById, sourceById, jiraPending, today),
    projects: buildProjectContext(projects),
    recentlyImportedSources: buildRecentSources(activeSources, projectNameById),
    previousDailyMemory,
  };

  const llmResult = await runLlmJob({
    jobType: "priority_planning",
    userPrompt: buildPriorityPlannerUserPrompt(input),
    schema: priorityPlanningOutputSchema,
  });

  if (llmResult.ok && llmResult.data.summary.trim()) {
    summaryText = llmResult.data.summary.trim();
  }

  const { updated } = await applyPlannerDecisions(
    deterministicDecisions.map((decision) => ({
      taskId: decision.taskId,
      status: decision.status,
      priorityScore: decision.priorityScore,
      reason: decision.reason,
      waitingOn: rankingTasks.find((task) => task.id === decision.taskId)?.waitingOn ?? null,
      confidence: decision.priorityScore,
    }))
  );

  const summary = {
    summary: summaryText,
    plannedAt: new Date().toISOString(),
    today,
    updatedTaskCount: updated,
  };
  writeSummary(summary);

  return {
    ok: true,
    summary,
    updatedTaskCount: updated,
  };
}
