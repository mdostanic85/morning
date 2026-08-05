import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildTaskQaUserPrompt,
  TASK_CHAT_MAX_KNOWLEDGE,
  TASK_CHAT_MAX_SOURCE_BODY_CHARS,
  TASK_CHAT_MAX_SOURCES,
  taskQaOutputSchema,
  type TaskQaContextSource,
  type TaskQaInput,
} from "@/lib/llm/prompts/taskQa";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { getKnowledgeItemsWithContext } from "@/services/knowledgeItems";
import { getWorkTaskById, getWorkTasks } from "@/services/workTasks";
import { getUserProfile, type UserProfile } from "@/services/userProfile";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { SourceItem, SourceType } from "@/domain/sourceItem";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import { parseJiraBodyFields } from "@/lib/connectors/jiraText";
import {
  myOwnerFilter,
  personMatchesFilter,
  taskMatchesOwner,
} from "@/lib/filters/ownerFilter";
import { textMentionsPerson } from "@/lib/granola/personalKnowledge";
import { isTranscriptSource } from "@/lib/tasks/sourceAuthority";

const MAX_CONTEXT_SOURCES = TASK_CHAT_MAX_SOURCES;
const MAX_SOURCE_BODY_LENGTH = TASK_CHAT_MAX_SOURCE_BODY_CHARS;
const MAX_CONTEXT_KNOWLEDGE = TASK_CHAT_MAX_KNOWLEDGE;
const TASK_CHAT_STATUS_ORDER: Record<WorkTaskStatus, number> = {
  now: 0,
  next: 1,
  tomorrow: 2,
  later: 3,
  waiting: 4,
  unclear: 5,
  done: 6,
};

export interface TaskChatOption {
  id: number;
  title: string;
  status: string;
  projectName: string | null;
  nextAction: string;
}

export interface TaskQaAnswerSource {
  id: string;
  sourceType: SourceType;
  sourceRole: string;
  title: string;
  sourceDate: string;
  excerpt: string;
  url: string | null;
}

export interface TaskQaAnswer {
  ok: boolean;
  taskId: number | null;
  taskTitle: string;
  canAnswer: boolean;
  confidence: number;
  directAnswer: string;
  whatWeKnow: string[];
  whatToDo: string[];
  requirements: string[];
  uncertainties: string[];
  sources: TaskQaAnswerSource[];
  error?: string;
}

function sourceRole(source: SourceItem): string {
  if (isTranscriptSource(source)) {
    return source.sourceType === "granola" ? "granola_transcript" : "gemini_transcript";
  }
  if (source.sourceType === "jira") return "jira_issue_with_comments";
  if (source.sourceType === "confluence") return "confluence_document";
  return `${source.sourceType}_context`;
}

function contextBody(source: SourceItem): string {
  const body = source.body.trim();
  return body.length > MAX_SOURCE_BODY_LENGTH
    ? `${body.slice(0, MAX_SOURCE_BODY_LENGTH).trimEnd()}…`
    : body;
}

function extractedReferenceTokens(text: string): {
  jiraKeys: Set<string>;
  confluencePageIds: Set<string>;
  figmaFileKeys: Set<string>;
} {
  return {
    jiraKeys: new Set(Array.from(text.matchAll(/\b([A-Z][A-Z0-9]+-\d+)\b/g), (match) => match[1])),
    confluencePageIds: new Set(
      Array.from(text.matchAll(/\/pages\/(\d+)/g), (match) => match[1])
    ),
    figmaFileKeys: new Set(
      Array.from(text.matchAll(/figma\.com\/(?:design|file)\/([^/?#\s]+)/gi), (match) => match[1])
    ),
  };
}

function sourceMatchesProfile(source: SourceItem, profile: UserProfile): boolean {
  const myName = profile.name?.trim() ?? "";
  const myEmail = profile.email.trim().toLowerCase();
  const author = source.author?.trim() ?? "";

  if (author && myEmail && author.toLowerCase().includes(myEmail)) return true;
  if (myName && author) {
    const owners = myOwnerFilter(myName);
    if (owners && personMatchesFilter(author, owners, myName)) return true;
  }
  if (myName && textMentionsPerson(`${source.title}\n${source.body}`, myName)) return true;

  if (source.sourceType === "jira" && myName) {
    const assignee = parseJiraBodyFields(source.body).assignee;
    const owners = myOwnerFilter(myName);
    if (assignee && owners && personMatchesFilter(assignee, owners, myName)) return true;
  }

  return false;
}

function taskContextSources(
  task: WorkTaskWithEvidence,
  sourceItems: SourceItem[]
): SourceItem[] {
  const directSourceIds = new Set(task.evidence.map((entry) => entry.sourceItemId));
  const directSources = sourceItems.filter((source) => directSourceIds.has(source.id));
  const referenceText = [
    task.title,
    task.reason,
    task.nextAction,
    ...task.doneCriteria,
    ...task.evidence.map((entry) => entry.quote),
    ...directSources.flatMap((source) => [source.title, source.body, source.url ?? ""]),
  ].join("\n");
  const referenceTokens = extractedReferenceTokens(referenceText);
  const jiraKey = jiraKeyFromTask(task.title, directSources);
  if (jiraKey) referenceTokens.jiraKeys.add(jiraKey);

  return sourceItems.filter((source) => {
    if (directSourceIds.has(source.id)) return true;
    if (source.sourceExternalId && referenceTokens.jiraKeys.has(source.sourceExternalId)) {
      return true;
    }
    if (
      source.sourceType === "confluence" &&
      source.sourceExternalId &&
      referenceTokens.confluencePageIds.has(source.sourceExternalId)
    ) {
      return true;
    }
    if (
      source.sourceType === "figma" &&
      Array.from(referenceTokens.figmaFileKeys).some((key) =>
        `${source.url ?? ""}\n${source.body}`.includes(key)
      )
    ) {
      return true;
    }
    return jiraKey
      ? `${source.title}\n${source.body}`.toUpperCase().includes(jiraKey)
      : false;
  });
}

function taskMatchesProfile(
  task: WorkTaskWithEvidence,
  sourceItems: SourceItem[],
  profile: UserProfile | null
): boolean {
  if (!profile) return false;
  const myName = profile.name?.trim() ?? "";
  const ownerFilter = myOwnerFilter(myName || null);
  if (ownerFilter && taskMatchesOwner(task, ownerFilter, myName)) return true;

  const taskText = [
    task.title,
    task.reason,
    task.nextAction,
    ...task.doneCriteria,
    ...task.evidence.map((entry) => entry.quote),
    task.workContext ? JSON.stringify(task.workContext) : "",
  ].join("\n");
  if (myName && textMentionsPerson(taskText, myName)) return true;

  return taskContextSources(task, sourceItems).some((source) => {
    // A long meeting transcript may mention the user somewhere unrelated to
    // this extracted task. For transcript-like sources, only the task fields
    // and evidence quote above are specific enough to establish relevance.
    if (
      source.sourceType === "granola" ||
      source.sourceType === "manual_transcript" ||
      source.sourceType === "calendar" ||
      sourceRole(source) === "gemini_transcript"
    ) {
      return false;
    }
    return sourceMatchesProfile(source, profile);
  });
}

function jiraKeyFromTask(
  title: string,
  directSources: SourceItem[]
): string | null {
  const titleKey = title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
  if (titleKey) return titleKey;
  return directSources.find((source) => source.sourceType === "jira")?.sourceExternalId ?? null;
}

function sortContextSources(a: SourceItem, b: SourceItem): number {
  const roleWeight = (source: SourceItem) => {
    const role = sourceRole(source);
    if (role === "gemini_transcript" || role === "granola_transcript") return 4;
    if (role === "jira_issue_with_comments") return 3;
    if (role === "confluence_document") return 2;
    return 1;
  };
  const weightDifference = roleWeight(b) - roleWeight(a);
  if (weightDifference !== 0) return weightDifference;
  return new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime();
}

function taskOptionIdentity(task: {
  projectId: number | null;
  title: string;
  nextAction: string;
}): string {
  const jiraKey = task.title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1];
  if (jiraKey) return `jira:${jiraKey}`;
  return [task.projectId ?? "none", task.title, task.nextAction]
    .map((value) => String(value).trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export async function listTaskChatOptions(): Promise<TaskChatOption[]> {
  const [tasks, projects, sourceItems, profile] = await Promise.all([
    getWorkTasks(),
    getProjects(),
    getSourceItems(),
    getUserProfile(),
  ]);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const sourceProjectById = new Map(sourceItems.map((source) => [source.id, source.projectId]));
  const seen = new Set<string>();

  return tasks
    .filter((task) => taskMatchesProfile(task, sourceItems, profile))
    .sort((a, b) => {
      const statusDifference = TASK_CHAT_STATUS_ORDER[a.status] - TASK_CHAT_STATUS_ORDER[b.status];
      if (statusDifference !== 0) return statusDifference;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .filter((task) => {
      const identity = taskOptionIdentity(task);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((task) => {
      const inferredProjectId =
        task.projectId ??
        task.evidence
          .map((entry) => sourceProjectById.get(entry.sourceItemId) ?? null)
          .find((projectId): projectId is number => projectId != null) ??
        null;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        projectName: inferredProjectId ? projectNameById.get(inferredProjectId) ?? null : null,
        nextAction: task.nextAction,
      };
    })
    .slice(0, 100);
}

async function runTaskQaAnswer(input: {
  question: string;
  currentUserName: string | null;
  task: TaskQaInput["task"];
  taskId: number | null;
  taskTitle: string;
  relevantSources: SourceItem[];
  knowledge: TaskQaInput["knowledge"];
}): Promise<TaskQaAnswer> {
  const promptSources: TaskQaContextSource[] = input.relevantSources.map((source) => ({
    id: `source-${source.id}`,
    sourceType: source.sourceType,
    sourceRole: sourceRole(source),
    title: source.title,
    sourceDate: source.sourceDate,
    body: contextBody(source),
  }));
  const result = await runLlmJob({
    jobType: "task_qa",
    userPrompt: buildTaskQaUserPrompt({
      question: input.question,
      currentUserName: input.currentUserName,
      task: input.task,
      sources: promptSources,
      knowledge: input.knowledge,
    }),
    schema: taskQaOutputSchema,
    temperature: 0,
    maxTokens: 4096,
  });

  if (!result.ok) {
    return {
      ok: false,
      taskId: input.taskId,
      taskTitle: input.taskTitle,
      canAnswer: false,
      confidence: 0,
      directAnswer: "",
      whatWeKnow: [],
      whatToDo: [],
      requirements: [],
      uncertainties: [],
      sources: [],
      error: `${result.kind}: ${result.error}`,
    };
  }

  const sourceById = new Map(
    input.relevantSources.map((source) => [`source-${source.id}`, source])
  );
  const citedIds = Array.from(new Set(result.data.citedSourceIds));
  const citedSources = citedIds
    .map((id) => {
      const source = sourceById.get(id);
      if (!source) return null;
      const body = source.body.trim().replace(/\s+/g, " ");
      return {
        id,
        sourceType: source.sourceType,
        sourceRole: sourceRole(source),
        title: source.title,
        sourceDate: source.sourceDate,
        excerpt: body.length > 220 ? `${body.slice(0, 220).trimEnd()}…` : body,
        url: source.url,
      };
    })
    .filter((source): source is TaskQaAnswerSource => source != null);
  const canAnswer = result.data.canAnswer && result.data.confidence >= 0.7 && citedSources.length > 0;

  return {
    ok: true,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    canAnswer,
    confidence: result.data.confidence,
    directAnswer: canAnswer ? result.data.directAnswer : "",
    whatWeKnow: result.data.whatWeKnow,
    whatToDo: canAnswer ? result.data.whatToDo : [],
    requirements: result.data.requirements,
    uncertainties: result.data.uncertainties,
    sources: citedSources,
  };
}

export async function answerGeneralWorkQuestion(question: string): Promise<TaskQaAnswer> {
  const [sourceItems, knowledge, tasks, profile] = await Promise.all([
    getSourceItems(),
    getKnowledgeItemsWithContext(),
    getWorkTasks(),
    getUserProfile(),
  ]);
  const personalTasks = tasks.filter((task) =>
    taskMatchesProfile(task, sourceItems, profile)
  );
  const personalSourceIds = new Set(
    personalTasks.flatMap((task) =>
      taskContextSources(task, sourceItems).map((source) => source.id)
    )
  );
  const relevantSources = sourceItems
    .filter(
      (source) =>
        personalSourceIds.has(source.id) ||
        (profile != null && sourceMatchesProfile(source, profile))
    )
    .sort(sortContextSources)
    .slice(0, MAX_CONTEXT_SOURCES);
  const relevantSourceIds = new Set(relevantSources.map((source) => source.id));
  const myName = profile?.name?.trim() ?? "";
  const myEmail = profile?.email.trim().toLowerCase() ?? "";
  const promptKnowledge = knowledge
    .filter(
      (item) =>
        (item.sourceItemId != null && relevantSourceIds.has(item.sourceItemId)) ||
        (myName &&
          textMentionsPerson(
            `${item.title}\n${item.content}\n${item.evidenceQuotes.join("\n")}`,
            myName
          )) ||
        (myEmail && item.sourceAuthor?.toLowerCase().includes(myEmail))
    )
    .slice(0, MAX_CONTEXT_KNOWLEDGE)
    .map((item) => ({
      id: `knowledge-${item.id}`,
      type: item.type,
      title: item.title,
      content: item.content,
      sourceDate: item.sourceDate,
    }));

  return runTaskQaAnswer({
    question,
    currentUserName: profile?.name ?? null,
    task: null,
    taskId: null,
    taskTitle: "All synced work",
    relevantSources,
    knowledge: promptKnowledge,
  });
}

export async function answerTaskQuestion(
  taskId: number,
  question: string
): Promise<TaskQaAnswer> {
  const [task, sourceItems, projects, knowledge, profile] = await Promise.all([
    getWorkTaskById(taskId),
    getSourceItems(),
    getProjects(),
    getKnowledgeItemsWithContext(),
    getUserProfile(),
  ]);
  if (!task) throw new Error("Task was not found.");
  if (!taskMatchesProfile(task, sourceItems, profile)) {
    throw new Error("Task is not connected to your profile or mentioned in its context.");
  }

  const directSourceIds = new Set(task.evidence.map((entry) => entry.sourceItemId));
  const directSources = sourceItems.filter((source) => directSourceIds.has(source.id));
  const jiraKey = jiraKeyFromTask(task.title, directSources);
  const referenceText = [
    task.title,
    task.reason,
    task.nextAction,
    ...task.doneCriteria,
    ...directSources.flatMap((source) => [source.title, source.body, source.url ?? ""]),
  ].join("\n");
  const referenceTokens = extractedReferenceTokens(referenceText);
  if (jiraKey) referenceTokens.jiraKeys.add(jiraKey);

  const linkedSources = sourceItems.filter((source) => {
    if (source.sourceExternalId && referenceTokens.jiraKeys.has(source.sourceExternalId)) return true;
    if (
      source.sourceType === "confluence" &&
      source.sourceExternalId &&
      referenceTokens.confluencePageIds.has(source.sourceExternalId)
    ) {
      return true;
    }
    if (
      source.sourceType === "figma" &&
      Array.from(referenceTokens.figmaFileKeys).some((key) =>
        `${source.url ?? ""}\n${source.body}`.includes(key)
      )
    ) {
      return true;
    }
    return false;
  });
  const linkedSourceIds = new Set(linkedSources.map((source) => source.id));
  const relevantProjectIds = new Set(
    [task.projectId, ...directSources.map((source) => source.projectId), ...linkedSources.map((source) => source.projectId)]
      .filter((projectId): projectId is number => projectId != null)
  );
  const projectName =
    projects.find((project) => relevantProjectIds.has(project.id))?.name ?? null;

  const relevantSources = sourceItems
    .filter((source) => {
      if (directSourceIds.has(source.id)) return true;
      if (linkedSourceIds.has(source.id)) return true;
      if (source.projectId != null && relevantProjectIds.has(source.projectId)) return true;
      if (jiraKey && `${source.title}\n${source.body}`.toUpperCase().includes(jiraKey)) return true;
      return false;
    })
    .sort(sortContextSources)
    .slice(0, MAX_CONTEXT_SOURCES);

  const relevantSourceIds = new Set(relevantSources.map((source) => source.id));
  const promptKnowledge = knowledge
    .filter(
      (item) =>
        (item.projectId != null && relevantProjectIds.has(item.projectId)) ||
        (item.sourceItemId != null && relevantSourceIds.has(item.sourceItemId))
    )
    .slice(0, MAX_CONTEXT_KNOWLEDGE)
    .map((item) => ({
      id: `knowledge-${item.id}`,
      type: item.type,
      title: item.title,
      content: item.content,
      sourceDate: item.sourceDate,
    }));

  return runTaskQaAnswer({
    question,
    currentUserName: profile?.name ?? null,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      reason: task.reason,
      nextAction: task.nextAction,
      doneCriteria: task.doneCriteria,
      dueDate: task.dueDate,
      owner: task.owner,
      projectName,
    },
    taskId: task.id,
    taskTitle: task.title,
    relevantSources,
    knowledge: promptKnowledge,
  });
}
