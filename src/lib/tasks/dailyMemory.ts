import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildDailyMemoryUserPrompt,
  dailyMemoryOutputSchema,
  type DailyMemoryInput,
} from "@/lib/llm/prompts/dailyMemory";
import { scanLocalGitRepos } from "@/lib/connectors/localGit";
import { createDailyMemory, getLatestDailyMemory } from "@/services/dailyMemories";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getVerificationReports } from "@/services/verificationReports";
import { getWorkTasks } from "@/services/workTasks";
import { localDateString } from "@/lib/dates";
import type { DailyMemory } from "@/domain/dailyMemory";

export interface EndDayResult {
  ok: boolean;
  memory?: DailyMemory;
  error?: string;
}

function recentEnough(value: string, today: string): boolean {
  return value.slice(0, 10) === today;
}

export async function generateEndOfDayMemory(input?: { today?: string }): Promise<EndDayResult> {
  const today = input?.today ?? localDateString();
  const [tasks, projects, sourceItems, verificationReports] = await Promise.all([
    getWorkTasks(),
    getProjects(),
    getSourceItems(),
    getVerificationReports(),
  ]);

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const gitEvidence: DailyMemoryInput["gitEvidence"] = [];

  for (const project of projects.filter((candidate) => candidate.repoPaths.length > 0)) {
    const repos = await scanLocalGitRepos(project.repoPaths);
    gitEvidence.push(
      ...repos.map((repo) => ({
        projectName: project.name,
        repoPath: repo.repoPath,
        currentBranch: repo.currentBranch,
        changedFiles: repo.changedFiles,
        diffSummary: repo.diffSummary,
        error: repo.error,
      }))
    );
  }

  const dailyInput: DailyMemoryInput = {
    today,
    completedTasks: tasks
      .filter((task) => task.status === "done" && recentEnough(task.updatedAt, today))
      .map((task) => ({
        id: task.id,
        title: task.title,
        projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
        updatedAt: task.updatedAt,
      })),
    startedTasks: tasks
      .filter((task) => task.status === "now" || task.status === "next")
      .map((task) => ({
        id: task.id,
        title: task.title,
        projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
        updatedAt: task.updatedAt,
      })),
    openTasks: tasks
      .filter((task) => task.status !== "done")
      .slice(0, 20)
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
        reason: task.reason,
        nextAction: task.nextAction,
        waitingOn: task.waitingOn,
      })),
    verificationReports: verificationReports.slice(0, 12).map((report) => ({
      taskId: report.taskId,
      verdict: report.verdict,
      recommendedNextAction: report.recommendedNextAction,
      createdAt: report.createdAt,
    })),
    latestSourceItems: sourceItems.slice(0, 12).map((source) => ({
      title: source.title,
      sourceType: source.sourceType,
      sourceDate: source.sourceDate,
      projectName: source.projectId
        ? (projectById.get(source.projectId)?.name ?? null)
        : null,
    })),
    gitEvidence,
  };

  const result = await runLlmJob({
    jobType: "daily_memory",
    userPrompt: buildDailyMemoryUserPrompt(dailyInput),
    schema: dailyMemoryOutputSchema,
  });

  if (!result.ok) {
    return { ok: false, error: `${result.kind}: ${result.error}` };
  }

  const memory = await createDailyMemory({
    date: today,
    whatWorkedOn: result.data.whatWorkedOn,
    completed: result.data.completed,
    stillOpen: result.data.stillOpen,
    waitingOn: result.data.waitingOn,
    firstTomorrow: result.data.firstTomorrow,
    risks: result.data.risks,
    summary: result.data.summary,
    confidence: result.data.confidence,
  });

  return { ok: true, memory };
}

export async function getResumeFromYesterday(): Promise<DailyMemory | null> {
  const memory = await getLatestDailyMemory();
  if (!memory) return null;
  // A memory written today is today's own end-of-day note, not something to
  // "resume from" — hide it until tomorrow morning.
  if (memory.date === localDateString()) return null;
  return memory;
}
