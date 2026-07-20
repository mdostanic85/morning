import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildTodayBriefingUserPrompt,
  todayBriefingContentSchema,
  type StoredTodayBriefing,
} from "@/lib/llm/prompts/todayBriefing";
import {
  fetchJiraPendingSnapshot,
  jiraPendingFromSourceItems,
  type JiraPendingSnapshot,
} from "@/lib/connectors/jiraPending";
import { getConnectionByProvider, getConnections } from "@/services/connections";
import {
  getKnowledgeItemsWithContext,
  type KnowledgeItemView,
} from "@/services/knowledgeItems";
import { getActiveProjects, getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getTodayQueue } from "@/services/workTasks";
import { getLatestDailyMemory } from "@/services/dailyMemories";
import { localDateString } from "@/lib/dates";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { SourceItem } from "@/domain/sourceItem";
import {
  buildDeterministicFocusItems,
  rankJiraIssues,
  rankWorkTask,
  type WorkTaskForRanking,
} from "@/lib/tasks/priorityRank";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import { getUserProfile } from "@/services/userProfile";
import { myOwnerFilter, taskMatchesOwner } from "@/lib/filters/ownerFilter";
import {
  enrichFocusItemsWithActionPlans,
} from "@/lib/tasks/focusActionPlanner";
import { DAILY_FOCUS_TASK_LIMIT } from "@/lib/tasks/dailyFocus";
import { buildGranolaWorkContext, granolaSourceBodyMatchesMe } from "@/lib/granola/personalKnowledge";
import { filterKnowledgeForMe } from "@/lib/filters/knowledgeFilter";

const BRIEFING_PATH = path.join(process.cwd(), "data", "today-briefing.json");
const RECENT_SOURCE_LIMIT = 12;
const KNOWLEDGE_LIMIT = 15;
const KNOWLEDGE_PER_SOURCE_LIMIT = 3;
const BRIEFING_OPEN_TASK_LIMIT = 50;
const SOURCE_EXCERPT = 320;
const BRIEFING_PROMPT_VERSION = 9;

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > SOURCE_EXCERPT ? `${trimmed.slice(0, SOURCE_EXCERPT)}...` : trimmed;
}

function diverseKnowledgeForBriefing(items: KnowledgeItemView[]): KnowledgeItemView[] {
  const countBySource = new Map<string, number>();
  const selected: KnowledgeItemView[] = [];

  for (const item of items) {
    const sourceKey =
      item.sourceItemId != null
        ? `source:${item.sourceItemId}`
        : `project:${item.projectId ?? "global"}:${item.type}`;
    const sourceCount = countBySource.get(sourceKey) ?? 0;
    if (sourceCount >= KNOWLEDGE_PER_SOURCE_LIMIT) continue;

    selected.push(item);
    countBySource.set(sourceKey, sourceCount + 1);
    if (selected.length >= KNOWLEDGE_LIMIT) break;
  }

  return selected;
}

function readBriefingFile(): StoredTodayBriefing | null {
  if (!fs.existsSync(BRIEFING_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BRIEFING_PATH, "utf-8")) as StoredTodayBriefing;
  } catch {
    return null;
  }
}

function writeBriefingFile(briefing: StoredTodayBriefing) {
  const dir = path.dirname(BRIEFING_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BRIEFING_PATH, JSON.stringify(briefing, null, 2));
}

async function getPreviousDailyMemoryText(): Promise<string | null> {
  const memory = await getLatestDailyMemory();
  if (!memory) return null;
  return [
    `Date: ${memory.date}`,
    `Summary: ${memory.summary}`,
    memory.firstTomorrow ? `Planned first: ${memory.firstTomorrow}` : null,
    memory.stillOpen.length > 0 ? `Still open: ${memory.stillOpen.join("; ")}` : null,
    memory.waitingOn.length > 0 ? `Waiting on: ${memory.waitingOn.join("; ")}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function extractJiraKeyFromSource(source: SourceItem | undefined): string | null {
  if (!source || source.sourceType !== "jira") return null;
  const external = source.sourceExternalId?.trim();
  if (external && /^[A-Z][A-Z0-9]+-\d+$/.test(external)) return external;
  const titleMatch = source.title.match(/^([A-Z][A-Z0-9]+-\d+):/);
  return titleMatch?.[1] ?? null;
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

export async function getTodayBriefing(): Promise<StoredTodayBriefing | null> {
  const briefing = readBriefingFile();
  if (!briefing) return null;
  const today = localDateString();
  if (briefing.today !== today) return null;
  return briefing;
}

export interface BuildTodayBriefingResult {
  ok: boolean;
  briefing?: StoredTodayBriefing;
  error?: string;
}

export async function buildTodayBriefing(options?: {
  today?: string;
  jiraPending?: JiraPendingSnapshot[];
}): Promise<BuildTodayBriefingResult> {
  const today = options?.today ?? localDateString();

  const [projects, allProjects, sourceItems, knowledge, queue, connections, jiraConnection, previousDailyMemory, profile] =
    await Promise.all([
      getActiveProjects(),
      getProjects(),
      getSourceItems(),
      getKnowledgeItemsWithContext(),
      getTodayQueue(),
      getConnections(),
      getConnectionByProvider("jira"),
      getPreviousDailyMemoryText(),
      getUserProfile(),
    ]);

  const myName = profile?.name?.trim() ?? null;
  const ownerFilter = myOwnerFilter(myName);

  const inactiveProjectIds = new Set(
    allProjects.filter((project) => project.status === "inactive").map((project) => project.id)
  );
  const activeJiraKeys = projects.flatMap((project) => project.jiraKeys);

  const connectedProviders = connections
    .filter((connection) => connection.status === "connected")
    .map((connection) => connection.provider);

  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));

  let jiraPending = options?.jiraPending ?? await fetchJiraPendingSnapshot();
  if (jiraPending.length === 0 && jiraConnection?.status === "connected") {
    jiraPending = jiraPendingFromSourceItems(sourceItems, activeJiraKeys);
  }

  const rankedJira = rankJiraIssues(jiraPending, today);
  const jiraPendingForPrompt = rankedJira
    .map((ranked) => jiraPending.find((issue) => issue.key === ranked.key))
    .filter((issue): issue is (typeof jiraPending)[number] => issue != null);

  const todaySources = sourceItems.filter(
    (item) =>
      item.sourceDate.startsWith(today) &&
      (item.projectId == null || !inactiveProjectIds.has(item.projectId))
  );
  const eligibleSources = sourceItems.filter(
    (item) => item.projectId == null || !inactiveProjectIds.has(item.projectId)
  );
  const granolaWorkContext = myName
    ? buildGranolaWorkContext({
        myName,
        projects,
        taskTitles: OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]).map(
          (task) => task.title
        ),
      })
    : null;
  const briefingEligibleSources = eligibleSources.filter((item) => {
    if (item.sourceType !== "granola") return true;
    if (!granolaWorkContext) return false;
    return granolaSourceBodyMatchesMe(item.body, granolaWorkContext);
  });
  const sourcesForBriefing = (() => {
    const base = todaySources.length > 0
      ? todaySources.filter(
          (item) =>
            item.sourceType !== "granola" ||
            (granolaWorkContext != null && granolaSourceBodyMatchesMe(item.body, granolaWorkContext))
        )
      : briefingEligibleSources;
    const prioritized = [...base].sort(
      (a, b) => new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime()
    );
    return prioritized.slice(0, RECENT_SOURCE_LIMIT);
  })();
  const recentSources = sourcesForBriefing.slice(0, RECENT_SOURCE_LIMIT).map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    title: item.title,
    sourceDate: item.sourceDate,
    excerpt: excerpt(item.body),
    projectName: item.projectId ? projectNameById.get(item.projectId) ?? null : null,
  }));

  const knowledgeForBriefing = diverseKnowledgeForBriefing(
    filterKnowledgeForMe(
      knowledge.filter((item) => item.projectId == null || !inactiveProjectIds.has(item.projectId)),
      {
        myName,
        myEmail: profile?.email ?? null,
        sourceBodyByItemId: new Map(sourceItems.map((item) => [item.id, item.body] as const)),
        granolaWorkContext,
      }
    )
  )
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      content: item.content,
      projectName: item.projectId ? projectNameById.get(item.projectId) ?? null : null,
      evidenceQuotes: item.evidenceQuotes,
    }));

  const openTaskRows = OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]).filter(
    (task) => task.projectId == null || !inactiveProjectIds.has(task.projectId)
  );

  const attendance = { myName, myEmail: profile?.email ?? null };
  const rankingTasks = openTaskRows
    .filter((task) => taskMatchesOwner(task, ownerFilter, myName))
    .map(toWorkTaskForRanking);
  let focusItems = buildDeterministicFocusItems({
    tasks: rankingTasks,
    jiraPending,
    today,
    sourceById,
    maxItems: DAILY_FOCUS_TASK_LIMIT,
    attendance,
  });

  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        briefingPromptVersion: BRIEFING_PROMPT_VERSION,
        today,
        jiraPending,
        recentSources,
        knowledgeForBriefing,
        openTasks: openTaskRows.map((task) => ({
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
          evidence: task.evidence,
        })),
        focusItems,
        projectNames: projects.map((project) => project.name),
        connectedProviders,
        previousDailyMemory,
      })
    )
    .digest("hex");
  const previousBriefing = readBriefingFile();
  if (previousBriefing?.today === today && previousBriefing.inputHash === inputHash) {
    return { ok: true, briefing: previousBriefing };
  }

  const tasksById = new Map(rankingTasks.map((task) => [task.id, task]));
  focusItems = await enrichFocusItemsWithActionPlans({
    today,
    focusItems,
    jiraPending,
    tasksById,
    sourceItems: eligibleSources,
  });

  const openTasks = openTaskRows
    .map((task) => {
      const ranked = rankWorkTask(
        toWorkTaskForRanking(task),
        today,
        sourceById,
        new Map(jiraPending.map((issue) => [issue.key, issue])),
        attendance
      );
      const jiraSource = task.evidence
        .map((item) => sourceById.get(item.sourceItemId))
        .find((source) => source?.sourceType === "jira");

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        reason: task.reason,
        nextAction: task.nextAction,
        doneCriteria: task.doneCriteria,
        projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
        priorityScore: task.priorityScore,
        dueDate: task.dueDate,
        waitingOn: task.waitingOn,
        jiraKey: ranked.jiraKey ?? extractJiraKeyFromSource(jiraSource),
        jiraPriority: ranked.jiraPriority,
        rankScore: ranked.score,
        rankExplanation: ranked.explanation.join(" · "),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, BRIEFING_OPEN_TASK_LIMIT);

  const hasSignals =
    jiraPending.length > 0 ||
    knowledgeForBriefing.length > 0 ||
    recentSources.length > 0 ||
    openTasks.length > 0;

  if (!hasSignals) {
    return { ok: true };
  }

  const result = await runLlmJob({
    jobType: "today_briefing",
    userPrompt: buildTodayBriefingUserPrompt({
      today,
      jiraPending: jiraPendingForPrompt,
      knowledge: knowledgeForBriefing,
      recentSources,
      openTasks,
      rankedFocusTitles: focusItems.map((item) => item.title),
      projectNames: projects.map((project) => project.name),
      connectedProviders,
      previousDailyMemory,
    }),
    schema: todayBriefingContentSchema,
  });

  if (!result.ok) {
    const briefing: StoredTodayBriefing = {
      summary:
        focusItems.length > 0
          ? `Today's focus: ${focusItems[0].title}.`
          : "Sync completed — review your queue for the single task to start with.",
      focusItems,
      jiraPending: [],
      knowledgeHighlights: [],
      waitingOn: [],
      risks: [],
      generatedAt: new Date().toISOString(),
      today,
      inputHash,
      jiraIssueCount: jiraPending.length,
      sourceCount: recentSources.length,
      sourcesUsed: sourcesForBriefing.slice(0, RECENT_SOURCE_LIMIT).map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title,
        sourceDate: item.sourceDate,
        author: item.author ?? null,
        projectName: item.projectId ? projectNameById.get(item.projectId) ?? null : null,
        url: item.url ?? null,
      })),
      connectedProviders,
    };
    writeBriefingFile(briefing);
    return { ok: true, briefing };
  }

  const briefing: StoredTodayBriefing = {
    summary: result.data.summary,
    focusItems,
    jiraPending: [],
    knowledgeHighlights: result.data.knowledgeHighlights,
    waitingOn: result.data.waitingOn,
    risks: result.data.risks,
    generatedAt: new Date().toISOString(),
    today,
    inputHash,
    jiraIssueCount: jiraPending.length,
    sourceCount: recentSources.length,
    sourcesUsed: sourcesForBriefing.slice(0, RECENT_SOURCE_LIMIT).map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      title: item.title,
      sourceDate: item.sourceDate,
      author: item.author ?? null,
      projectName: item.projectId ? projectNameById.get(item.projectId) ?? null : null,
      url: item.url ?? null,
    })),
    connectedProviders,
  };

  writeBriefingFile(briefing);
  return { ok: true, briefing };
}
