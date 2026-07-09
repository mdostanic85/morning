import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildProjectMatcherUserPrompt,
  projectMatchOutputSchema,
  type ProjectMatcherCandidate,
} from "@/lib/llm/prompts/projectMatcher";
import { getActiveProjects } from "@/services/projects";
import { getSourceItems, updateSourceItem } from "@/services/sourceItems";
import { updateWorkTask } from "@/services/workTasks";
import type { Project } from "@/domain/project";
import type { SourceItem } from "@/domain/sourceItem";
import type { WorkTask } from "@/domain/workTask";

const MIN_PROJECT_MATCH_CONFIDENCE = 0.7;
const PREVIOUS_SOURCE_LIMIT = 3;
const PREVIOUS_SOURCE_EXCERPT_LENGTH = 180;

export interface ProjectMatchResult {
  ok: boolean;
  projectId: number | null;
  confidence: number | null;
  matchedSignals: string[];
  reason: string;
  evidenceQuotes: string[];
  error?: string;
}

export interface SourceProjectMatchRunResult {
  match: ProjectMatchResult;
  sourceItem: SourceItem;
}

export interface TaskProjectMatchRunResult {
  match: ProjectMatchResult;
  task: WorkTask;
}

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > PREVIOUS_SOURCE_EXCERPT_LENGTH
    ? `${trimmed.slice(0, PREVIOUS_SOURCE_EXCERPT_LENGTH)}...`
    : trimmed;
}

function emptyMatch(reason: string, error?: string): ProjectMatchResult {
  return {
    ok: !error,
    projectId: null,
    confidence: null,
    matchedSignals: [],
    reason,
    evidenceQuotes: [],
    error,
  };
}

async function buildCandidates(projects: Project[]): Promise<ProjectMatcherCandidate[]> {
  const sourceItems = await getSourceItems();

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
    previousLinkedSources: sourceItems
      .filter((sourceItem) => sourceItem.projectId === project.id)
      .slice(0, PREVIOUS_SOURCE_LIMIT)
      .map((sourceItem) => ({
        title: sourceItem.title,
        sourceType: sourceItem.sourceType,
        sourceDate: sourceItem.sourceDate,
        excerpt: excerpt(sourceItem.body),
      })),
  }));
}

function normalizeMatch(
  result: {
    projectId: number | null;
    confidence: number;
    matchedOn: string[];
    isUnclear: boolean;
    reason: string;
    evidence: { quote: string }[];
  },
  candidateProjectIds: Set<number>
): ProjectMatchResult {
  const hasValidProject =
    result.projectId !== null &&
    candidateProjectIds.has(result.projectId) &&
    result.confidence >= MIN_PROJECT_MATCH_CONFIDENCE &&
    !result.isUnclear;

  return {
    ok: true,
    projectId: hasValidProject ? result.projectId : null,
    confidence: result.confidence,
    matchedSignals: hasValidProject ? result.matchedOn : [],
    reason: hasValidProject
      ? result.reason
      : result.confidence < MIN_PROJECT_MATCH_CONFIDENCE
        ? `${result.reason} Confidence ${result.confidence.toFixed(2)} is below ${MIN_PROJECT_MATCH_CONFIDENCE}.`
        : result.reason,
    evidenceQuotes: hasValidProject ? result.evidence.map((item) => item.quote) : [],
  };
}

async function matchProjectForText(input: {
  title: string;
  sourceType: string;
  body: string;
  projects?: Project[];
}): Promise<ProjectMatchResult> {
  const projects = input.projects ?? (await getActiveProjects());
  if (projects.length === 0) {
    return emptyMatch("No existing projects to match against.");
  }

  const candidates = await buildCandidates(projects);
  const candidateProjectIds = new Set(candidates.map((project) => project.id));

  const result = await runLlmJob({
    jobType: "project_matching",
    userPrompt: buildProjectMatcherUserPrompt({
      sourceTitle: input.title,
      sourceType: input.sourceType,
      sourceBody: input.body,
      candidateProjects: candidates,
    }),
    schema: projectMatchOutputSchema,
  });

  if (!result.ok) {
    return emptyMatch("Project matching could not run.", `${result.kind}: ${result.error}`);
  }

  return normalizeMatch(result.data, candidateProjectIds);
}

function buildSourceMetadata(
  sourceItem: SourceItem,
  match: ProjectMatchResult
): Record<string, unknown> {
  return {
    ...(sourceItem.metadata ?? {}),
    projectMatch: {
      projectId: match.projectId,
      confidence: match.confidence,
      matchedSignals: match.matchedSignals,
      reason: match.reason,
      evidenceQuotes: match.evidenceQuotes,
      matchedAt: new Date().toISOString(),
    },
  };
}

export async function matchProjectForSourceItem(input: {
  sourceItem: SourceItem;
  projects?: Project[];
}): Promise<ProjectMatchResult> {
  return matchProjectForText({
    title: input.sourceItem.title,
    sourceType: input.sourceItem.sourceType,
    body: input.sourceItem.body,
    projects: input.projects,
  });
}

export async function matchAndAssignSourceItemToProject(input: {
  sourceItem: SourceItem;
  projects?: Project[];
}): Promise<SourceProjectMatchRunResult> {
  const match = await matchProjectForSourceItem(input);
  const nextMetadata = buildSourceMetadata(input.sourceItem, match);

  if (!match.ok || match.projectId === null) {
    const sourceItem =
      (await updateSourceItem(input.sourceItem.id, { metadata: nextMetadata })) ??
      input.sourceItem;
    return { match, sourceItem };
  }

  const sourceItem =
    (await updateSourceItem(input.sourceItem.id, {
      projectId: match.projectId,
      metadata: nextMetadata,
    })) ?? input.sourceItem;

  return { match, sourceItem };
}

export async function matchProjectForTask(input: {
  task: WorkTask;
  sourceItem?: SourceItem | null;
  projects?: Project[];
}): Promise<ProjectMatchResult> {
  const sourceContext = input.sourceItem
    ? [
        `Source title: ${input.sourceItem.title}`,
        `Source type: ${input.sourceItem.sourceType}`,
        "",
        "Source body:",
        input.sourceItem.body,
      ].join("\n")
    : "No source item context was provided.";

  return matchProjectForText({
    title: input.task.title,
    sourceType: "extracted_task",
    body: [
      `Task title: ${input.task.title}`,
      `Reason: ${input.task.reason}`,
      `Next action: ${input.task.nextAction}`,
      `Done criteria: ${input.task.doneCriteria.join("; ")}`,
      input.task.owner ? `Owner: ${input.task.owner}` : null,
      input.task.waitingOn ? `Waiting on: ${input.task.waitingOn}` : null,
      "",
      sourceContext,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    projects: input.projects,
  });
}

export async function matchAndAssignTaskToProject(input: {
  task: WorkTask;
  sourceItem?: SourceItem | null;
  projects?: Project[];
}): Promise<TaskProjectMatchRunResult> {
  const match = await matchProjectForTask(input);

  if (!match.ok || match.projectId === null) {
    return { match, task: input.task };
  }

  const task = (await updateWorkTask(input.task.id, { projectId: match.projectId })) ?? input.task;
  return { match, task };
}
