import type { WorkTaskStatus } from "@/domain/workTask";
import type { SourceItem } from "@/domain/sourceItem";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { jiraStatusFocusWeight } from "@/lib/connectors/jiraText";
import { findTaskIdByJiraKey } from "@/lib/tasks/resolveFocusTask";
import { DAILY_FOCUS_TASK_LIMIT } from "@/lib/tasks/dailyFocus";

export interface RankedWorkTask {
  taskId: number;
  score: number;
  normalizedScore: number;
  explanation: string[];
  jiraKey: string | null;
  jiraPriority: string | null;
}

export interface RankedJiraIssue {
  key: string;
  score: number;
  normalizedScore: number;
  explanation: string[];
}

export interface BriefingReferenceLink {
  label: string;
  url: string;
}

export interface BriefingFocusItemDraft {
  title: string;
  reason: string;
  nextAction: string;
  actionSteps?: string[];
  referenceLinks?: BriefingReferenceLink[];
  doneCriteria: string[];
  evidenceQuotes: { quote: string }[];
  linkedTaskId: number | null;
  linkedJiraKey: string | null;
  priorityExplanation: string;
}

const STATUS_WEIGHT: Record<Exclude<WorkTaskStatus, "done">, number> = {
  now: 1000,
  next: 850,
  later: 500,
  waiting: 200,
  tomorrow: 150,
  unclear: 100,
};

const FOCUS_EXCLUDED_STATUSES = new Set<WorkTaskStatus>(["waiting", "tomorrow", "unclear", "done"]);

function parseDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function daysUntil(dueDate: string, today: string): number | null {
  const due = parseDateOnly(dueDate);
  if (!due) return null;
  const dueMs = new Date(`${due}T12:00:00`).getTime();
  const todayMs = new Date(`${today}T12:00:00`).getTime();
  return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function jiraPriorityWeight(priority: string | null | undefined): number {
  if (!priority) return 0;
  const normalized = priority.toLowerCase();
  if (/(highest|critical|blocker|p0)/.test(normalized)) return 120;
  if (/(high|p1)/.test(normalized)) return 80;
  if (/(medium|p2|normal)/.test(normalized)) return 40;
  if (/(low|p3|minor|trivial)/.test(normalized)) return 10;
  return 25;
}

function dueDateWeight(dueDate: string | null | undefined, today: string): { score: number; note: string | null } {
  const days = dueDate ? daysUntil(dueDate, today) : null;
  if (days == null) return { score: 0, note: null };
  if (days < 0) return { score: 180, note: `Overdue by ${Math.abs(days)} day(s)` };
  if (days === 0) return { score: 150, note: "Due today" };
  if (days === 1) return { score: 110, note: "Due tomorrow" };
  if (days <= 7) return { score: 70, note: `Due in ${days} days` };
  return { score: 20, note: null };
}

function evidenceRecencyWeight(sourceDates: string[]): { score: number; note: string | null } {
  if (sourceDates.length === 0) return { score: 0, note: null };
  const newest = sourceDates
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];
  if (newest == null) return { score: 0, note: null };
  const ageHours = (Date.now() - newest) / (1000 * 60 * 60);
  if (ageHours <= 48) return { score: 60, note: "Fresh signal in last 48h" };
  if (ageHours <= 168) return { score: 30, note: "Recent signal this week" };
  return { score: 0, note: null };
}

function extractJiraKey(source: SourceItem | undefined): string | null {
  if (!source) return null;
  if (source.sourceType !== "jira") return null;
  const external = source.sourceExternalId?.trim();
  if (external && /^[A-Z][A-Z0-9]+-\d+$/.test(external)) return external;
  const titleMatch = source.title.match(/^([A-Z][A-Z0-9]+-\d+):/);
  return titleMatch?.[1] ?? null;
}

function jiraMetadata(source: SourceItem | undefined): {
  key: string | null;
  priority: string | null;
  dueDate: string | null;
} {
  if (!source || source.sourceType !== "jira") {
    return { key: null, priority: null, dueDate: null };
  }
  const metadata = source.metadata ?? {};
  return {
    key: extractJiraKey(source),
    priority: typeof metadata.priority === "string" ? metadata.priority : null,
    dueDate:
      typeof metadata.dueDate === "string"
        ? metadata.dueDate
        : typeof metadata.duedate === "string"
          ? metadata.duedate
          : null,
  };
}

export interface WorkTaskForRanking {
  id: number;
  title: string;
  status: WorkTaskStatus;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  priorityScore: number | null;
  dueDate: string | null;
  waitingOn: string | null;
  statusManuallySet: boolean;
  evidence: { sourceItemId: number; quote: string | null; summary: string }[];
}

export function rankWorkTask(
  task: WorkTaskForRanking,
  today: string,
  sourceById: Map<number, SourceItem>,
  jiraByKey: Map<string, JiraPendingSnapshot>
): RankedWorkTask {
  let score = 0;
  const explanation: string[] = [];

  if (task.status !== "done") {
    score += STATUS_WEIGHT[task.status];
    if (task.status === "now") explanation.push("Marked as in focus now");
    else if (task.status === "next") explanation.push("Queued as next up");
  }

  if (task.priorityScore != null) {
    const plannerBoost = Math.round(task.priorityScore * 100);
    score += plannerBoost;
    if (plannerBoost >= 70) explanation.push("High planner urgency");
  }

  if (task.statusManuallySet) {
    score += 90;
    explanation.push("You explicitly set its queue position");
  }

  const sources = task.evidence
    .map((item) => sourceById.get(item.sourceItemId))
    .filter((source): source is SourceItem => source != null);

  let jiraKey: string | null = null;
  let jiraPriority: string | null = null;

  for (const source of sources) {
    const meta = jiraMetadata(source);
    if (meta.key) {
      jiraKey = meta.key;
      jiraPriority = meta.priority ?? jiraByKey.get(meta.key)?.priority ?? null;
      break;
    }
  }

  if (!jiraKey) {
    const titleMatch = task.title.match(/^([A-Z][A-Z0-9]+-\d+)\b/);
    if (titleMatch) {
      jiraKey = titleMatch[1];
      jiraPriority = jiraByKey.get(jiraKey)?.priority ?? null;
    }
  }

  const jiraSnapshot = jiraKey ? jiraByKey.get(jiraKey) : undefined;
  if (jiraSnapshot) {
    jiraPriority = jiraSnapshot.priority ?? jiraPriority;
    const jWeight = jiraPriorityWeight(jiraSnapshot.priority);
    score += jWeight;
    if (jWeight > 0) {
      explanation.push(`Jira ${jiraKey} · ${jiraSnapshot.priority ?? "priority unknown"}`);
    }

    const statusWeight = jiraStatusFocusWeight(jiraSnapshot.status);
    score += statusWeight.score;
    if (statusWeight.note) explanation.push(statusWeight.note);
  } else if (jiraPriority) {
    const jWeight = jiraPriorityWeight(jiraPriority);
    score += jWeight;
    if (jWeight > 0) explanation.push(`Jira priority: ${jiraPriority}`);
  }

  const dueFromTask = dueDateWeight(task.dueDate, today);
  score += dueFromTask.score;
  if (dueFromTask.note) explanation.push(dueFromTask.note);

  if (jiraSnapshot?.updatedAt) {
    const jiraDue = jiraSnapshot.excerpt.match(/Due date: (\d{4}-\d{2}-\d{2})/);
    const dueFromJira = dueDateWeight(jiraDue?.[1] ?? null, today);
    if (!task.dueDate && dueFromJira.score > 0) {
      score += dueFromJira.score;
      if (dueFromJira.note) explanation.push(`Jira ${dueFromJira.note.toLowerCase()}`);
    }
  }

  const recency = evidenceRecencyWeight(sources.map((source) => source.sourceDate));
  score += recency.score;
  if (recency.note) {
    const newest = sources
      .map((source) => ({ source, time: new Date(source.sourceDate).getTime() }))
      .filter((entry) => !Number.isNaN(entry.time))
      .sort((a, b) => b.time - a.time)[0]?.source;
    explanation.push(
      newest ? `${recency.note} — ${newest.sourceType}: ${newest.title}` : recency.note
    );
  }

  if (sources.length >= 2) {
    score += 35;
    const labels = sources.slice(0, 3).map((source) => `${source.sourceType}: ${source.title}`);
    explanation.push(
      sources.length > 3
        ? `Confirmed by ${labels.join(", ")} (+${sources.length - 3} more)`
        : `Confirmed by ${labels.join(", ")}`
    );
  } else if (sources.length === 1) {
    explanation.push(`Signal from ${sources[0].sourceType}: ${sources[0].title}`);
  }

  const maintenancePattern = /(update figma|figma sync|design polish|cleanup|refactor|improve)/i;
  const commitmentPattern = /(jira|ticket|bug|blocker|stakeholder|due|deadline|review|UAT|PR)/i;
  if (maintenancePattern.test(task.title) && !commitmentPattern.test(`${task.title} ${task.reason}`)) {
    score -= 45;
    explanation.push("General improvement — ranked below explicit commitments");
  }

  if (task.waitingOn) {
    score -= 120;
    explanation.push(`Waiting on ${task.waitingOn}`);
  }

  return {
    taskId: task.id,
    score,
    normalizedScore: 0,
    explanation: explanation.length > 0 ? explanation : ["Open work in your queue"],
    jiraKey,
    jiraPriority,
  };
}

export function rankWorkTasks(
  tasks: WorkTaskForRanking[],
  today: string,
  sourceById: Map<number, SourceItem>,
  jiraPending: JiraPendingSnapshot[]
): RankedWorkTask[] {
  const jiraByKey = new Map(jiraPending.map((issue) => [issue.key, issue]));
  const ranked = tasks
    .map((task) => rankWorkTask(task, today, sourceById, jiraByKey))
    .sort((a, b) => b.score - a.score);

  const maxScore = ranked[0]?.score ?? 1;
  return ranked.map((item) => ({
    ...item,
    normalizedScore: maxScore > 0 ? item.score / maxScore : 0,
  }));
}

export function rankJiraIssue(issue: JiraPendingSnapshot, today: string): RankedJiraIssue {
  let score = 0;
  const explanation: string[] = [];

  const statusWeight = jiraStatusFocusWeight(issue.status);
  score += statusWeight.score;
  if (statusWeight.note) explanation.push(statusWeight.note);

  const jWeight = jiraPriorityWeight(issue.priority);
  score += jWeight;
  if (jWeight > 0) explanation.push(`Jira priority: ${issue.priority}`);

  const updatedAgeHours = (Date.now() - new Date(issue.updatedAt).getTime()) / (1000 * 60 * 60);
  if (updatedAgeHours <= 48) {
    score += 40;
    explanation.push("Recently updated in Jira");
  }

  const due = issue.dueDate ?? null;
  const dueWeight = dueDateWeight(due, today);
  score += dueWeight.score;
  if (dueWeight.note) explanation.push(dueWeight.note);

  return {
    key: issue.key,
    score,
    normalizedScore: 0,
    explanation: explanation.length > 0 ? explanation : [`Assigned Jira issue ${issue.key}`],
  };
}

export function rankJiraIssues(
  issues: JiraPendingSnapshot[],
  today: string
): RankedJiraIssue[] {
  const ranked = issues.map((issue) => rankJiraIssue(issue, today)).sort((a, b) => b.score - a.score);
  const maxScore = ranked[0]?.score ?? 1;
  return ranked.map((item) => ({
    ...item,
    normalizedScore: maxScore > 0 ? item.score / maxScore : 0,
  }));
}

export function buildDeterministicFocusItems(input: {
  tasks: WorkTaskForRanking[];
  jiraPending: JiraPendingSnapshot[];
  today: string;
  sourceById: Map<number, SourceItem>;
  maxItems?: number;
}): BriefingFocusItemDraft[] {
  const maxItems = input.maxItems ?? DAILY_FOCUS_TASK_LIMIT;
  const rankedTasks = rankWorkTasks(input.tasks, input.today, input.sourceById, input.jiraPending);
  const rankedJira = rankJiraIssues(input.jiraPending, input.today);
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const jiraByKey = new Map(input.jiraPending.map((issue) => [issue.key, issue]));

  type FocusCandidate =
    | { kind: "task"; score: number; ranked: RankedWorkTask; task: WorkTaskForRanking }
    | { kind: "jira"; score: number; ranked: RankedJiraIssue; issue: JiraPendingSnapshot };

  const candidates: FocusCandidate[] = [];

  for (const ranked of rankedTasks) {
    const task = taskById.get(ranked.taskId);
    if (!task) continue;
    if (FOCUS_EXCLUDED_STATUSES.has(task.status)) continue;
    if (!task.nextAction.trim() || task.doneCriteria.length === 0) continue;
    candidates.push({ kind: "task", score: ranked.score, ranked, task });
  }

  for (const ranked of rankedJira) {
    const issue = jiraByKey.get(ranked.key);
    if (!issue) continue;
    const alreadyLinked = candidates.some(
      (candidate) => candidate.kind === "task" && candidate.ranked.jiraKey === ranked.key
    );
    if (alreadyLinked) continue;
    candidates.push({ kind: "jira", score: ranked.score, ranked, issue });
  }

  candidates.sort((a, b) => b.score - a.score);

  const focus: BriefingFocusItemDraft[] = [];

  for (const candidate of candidates) {
    if (focus.length >= maxItems) break;

    if (candidate.kind === "task") {
      const { task, ranked } = candidate;
      const quotes = task.evidence
        .map((item) => item.quote?.trim() || item.summary.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((quote) => ({ quote }));

      if (quotes.length === 0) {
        quotes.push({ quote: task.reason.slice(0, 280) });
      }

      focus.push({
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
        doneCriteria: task.doneCriteria,
        evidenceQuotes: quotes,
        linkedTaskId: task.id,
        linkedJiraKey: ranked.jiraKey,
        priorityExplanation: ranked.explanation.join(" · "),
      });
      continue;
    }

    const { issue, ranked } = candidate;
    const excerptQuote = issue.excerpt.trim().slice(0, 280);
    focus.push({
      title: `${issue.key}: ${issue.title}`,
      reason: `Assigned Jira issue in ${issue.status}. ${ranked.explanation.join(". ")}.`,
      nextAction: `Open ${issue.key} and take the next concrete step described in the ticket.`,
      doneCriteria: [
        `Progress on ${issue.key} is visible in Jira (status or comment updated).`,
        "The acceptance criteria in the ticket are satisfied or you recorded what is still missing.",
      ],
      evidenceQuotes: excerptQuote ? [{ quote: excerptQuote }] : [{ quote: issue.title }],
      linkedTaskId: findTaskIdByJiraKey(input.tasks, issue.key),
      linkedJiraKey: issue.key,
      priorityExplanation: ranked.explanation.join(" · "),
    });
  }

  return focus;
}

export function buildQueueDecisionsFromRanking(
  ranked: RankedWorkTask[],
  tasks: WorkTaskForRanking[]
): {
  taskId: number;
  status: Exclude<WorkTaskStatus, "done">;
  priorityScore: number;
  reason: string;
}[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  return ranked.map((item, index) => {
    const task = taskById.get(item.taskId);
    let status: Exclude<WorkTaskStatus, "done"> = "later";

    if (task?.waitingOn || task?.status === "waiting") {
      status = "waiting";
    } else if (task?.status === "tomorrow") {
      status = "tomorrow";
    } else if (index === 0) {
      status = "now";
    } else {
      status = "later";
    }

    return {
      taskId: item.taskId,
      status,
      priorityScore: item.normalizedScore,
      reason: `Priority ${Math.round(item.normalizedScore * 100)}% — ${item.explanation.join(" · ")}`,
    };
  });
}

export function buildPlannerSummaryFromRanking(ranked: RankedWorkTask[], tasks: WorkTaskForRanking[]): string {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const top = ranked[0];
  if (!top) return "No open tasks were available to prioritize.";

  const task = taskById.get(top.taskId);
  return `Today's focus: ${task?.title ?? "Task"} — ${top.explanation.slice(0, 2).join("; ")}.`;
}
