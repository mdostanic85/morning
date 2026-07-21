import type { WorkTaskStatus } from "@/domain/workTask";
import type { SourceItem } from "@/domain/sourceItem";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { jiraStatusFocusWeight } from "@/lib/connectors/jiraText";
import { findTaskIdByJiraKey } from "@/lib/tasks/resolveFocusTask";
import { DAILY_FOCUS_TASK_LIMIT } from "@/lib/tasks/dailyFocus";
import { priorityExplanationForDisplay } from "@/lib/tasks/priorityExplanation";
import {
  filterFreshTaskSources,
  sourceAuthorityScoreBoost,
  type AttendanceContext,
} from "@/lib/tasks/sourceAuthority";
import {
  claimAwareScoreAdjustment,
  isNewJiraAssignment,
} from "@/lib/tasks/claimAwareRanking";
import { isJiraDoneMetadata } from "@/lib/tasks/canonicalKey";

export interface RankedWorkTask {
  taskId: number;
  score: number;
  normalizedScore: number;
  explanation: string[];
  jiraKey: string | null;
  jiraPriority: string | null;
  /** True when a meeting the user attended in the last 4 days committed this — must surface. */
  forceInclude: boolean;
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
  todayWorkSummary?: string[];
  referenceLinks?: BriefingReferenceLink[];
  doneCriteria: string[];
  evidenceQuotes: { quote: string }[];
  linkedTaskId: number | null;
  linkedJiraKey: string | null;
  priorityExplanation: string;
}

const STATUS_WEIGHT: Record<Exclude<WorkTaskStatus, "done">, number> = {
  now: 80,
  next: 40,
  later: 0,
  waiting: -300,
  tomorrow: -120,
  unclear: -200,
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

/** Ignore overdue boosts from ancient calendar leftovers with no fresh evidence. */
const STALE_OVERDUE_DAYS = 14;

function dueDateWeight(
  dueDate: string | null | undefined,
  today: string,
  options?: { newestEvidenceAgeDays?: number | null }
): { score: number; note: string | null } {
  const days = dueDate ? daysUntil(dueDate, today) : null;
  if (days == null) return { score: 0, note: null };
  if (days < 0) {
    const overdueDays = Math.abs(days);
    const evidenceAge = options?.newestEvidenceAgeDays;
    if (
      overdueDays > STALE_OVERDUE_DAYS &&
      evidenceAge != null &&
      evidenceAge > STALE_OVERDUE_DAYS
    ) {
      return { score: 0, note: null };
    }
    return { score: 180, note: `Overdue by ${overdueDays} day(s)` };
  }
  if (days === 0) return { score: 150, note: "Due today" };
  if (days === 1) return { score: 110, note: "Due tomorrow" };
  if (days <= 7) return { score: 70, note: `Due in ${days} days` };
  return { score: 20, note: null };
}

function newestEvidenceAgeDays(sourceDates: string[], now: number = Date.now()): number | null {
  const newest = sourceDates
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];
  if (newest == null) return null;
  return (now - newest) / (1000 * 60 * 60 * 24);
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
  projectId: number | null;
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
  jiraByKey: Map<string, JiraPendingSnapshot>,
  attendance?: AttendanceContext
): RankedWorkTask {
  let score = 0;
  const explanation: string[] = [];
  let forceInclude = false;

  if (task.status !== "done") {
    score += STATUS_WEIGHT[task.status];
    if (task.status === "now") explanation.push("Marked as in focus now");
    else if (task.status === "next") explanation.push("Queued as next up");
  }

  // Resolve Jira Done from evidence early — a manual queue pin is about
  // ordering, not a dispute with Jira's mechanical status. Done always wins.
  const jiraDoneFromEvidence = task.evidence
    .map((item) => sourceById.get(item.sourceItemId))
    .some((source) => source?.sourceType === "jira" && isJiraDoneMetadata(source.metadata));

  if (task.statusManuallySet && !jiraDoneFromEvidence) {
    score += 1000;
    explanation.push("You explicitly set its queue position");
  } else if (task.statusManuallySet && jiraDoneFromEvidence) {
    explanation.push("Jira now shows this issue as Done — manual pin no longer applies");
  }

  const taskText = `${task.title} ${task.reason} ${task.nextAction}`;
  if (/block(?:ing|s|ed)? (?:the )?(?:team|others|someone|release|launch)|others? (?:are )?waiting on/i.test(taskText)) {
    score += 160;
    explanation.push("Blocks other people or delivery");
  }
  if (/stakeholder|client request|customer request|asked (?:me|you|us) to|explicit request/i.test(taskText)) {
    score += 120;
    explanation.push("Direct stakeholder request");
  }
  if (/review comment|requested changes|changes requested|pull request|\bPR\b/i.test(taskText)) {
    score += 100;
    explanation.push("Review feedback needs action");
  }
  if (/requirement changed|scope changed|new update|updated requirement|supersed/i.test(taskText)) {
    score += 80;
    explanation.push("Recent requirement change");
  }

  const allSources = task.evidence
    .map((item) => sourceById.get(item.sourceItemId))
    .filter((source): source is SourceItem => source != null);
  // Per-task freshness window: evidence more than 5 days older than the
  // task's newest signal is ignored for scoring — newest information wins.
  const sources = filterFreshTaskSources(allSources);

  let jiraKey: string | null = null;
  let jiraPriority: string | null = null;

  // Jira key is task identity (not stale info) — resolve it from all sources.
  for (const source of allSources) {
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

  const evidenceAgeDays = newestEvidenceAgeDays(
    allSources.map((source) => source.sourceDate)
  );
  const dueFromTask = dueDateWeight(task.dueDate, today, {
    newestEvidenceAgeDays: evidenceAgeDays,
  });
  score += dueFromTask.score;
  if (dueFromTask.note) explanation.push(dueFromTask.note);

  if (jiraSnapshot?.updatedAt) {
    const jiraDue = jiraSnapshot.excerpt.match(/Due date: (\d{4}-\d{2}-\d{2})/);
    const dueFromJira = dueDateWeight(jiraDue?.[1] ?? null, today, {
      newestEvidenceAgeDays: evidenceAgeDays,
    });
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

  const authority = sourceAuthorityScoreBoost(sources, { attendance });
  score += authority.score;
  explanation.push(...authority.notes);
  if (authority.forceInclude) forceInclude = true;

  // Claim-aware: Jira mechanical Done beats transcript forceInclude;
  // same-day assignment gets an explicit boost.
  const jiraStatusFromSource = allSources
    .filter((source) => source.sourceType === "jira")
    .map((source) =>
      typeof source.metadata?.status === "string" ? source.metadata.status : null
    )
    .find(Boolean);
  const jiraDoneFromSource = allSources.some(
    (source) => source.sourceType === "jira" && isJiraDoneMetadata(source.metadata)
  );
  const jiraStatus = jiraSnapshot?.status ?? jiraStatusFromSource ?? null;
  const newAssignment = isNewJiraAssignment({
    jiraUpdatedAt: jiraSnapshot?.updatedAt ?? null,
    today,
    assignee: jiraSnapshot?.assignee ?? null,
    myName: attendance?.myName ?? null,
  });
  const claimAdjust = claimAwareScoreAdjustment({
    forceInclude,
    jiraStatus: jiraDoneFromSource ? jiraStatus ?? "Done" : jiraStatus,
    newAssignment,
  });
  score += claimAdjust.scoreDelta;
  forceInclude = claimAdjust.forceInclude;
  explanation.push(...claimAdjust.notes);

  if (sources.length >= 2) {
    score += 25;
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
    score -= 250;
    explanation.push(`Waiting on ${task.waitingOn}`);
  }

  return {
    taskId: task.id,
    score,
    normalizedScore: 0,
    explanation: explanation.length > 0 ? explanation : ["Open work in your queue"],
    jiraKey,
    jiraPriority,
    forceInclude,
  };
}

export function rankWorkTasks(
  tasks: WorkTaskForRanking[],
  today: string,
  sourceById: Map<number, SourceItem>,
  jiraPending: JiraPendingSnapshot[],
  attendance?: AttendanceContext
): RankedWorkTask[] {
  const jiraByKey = new Map(jiraPending.map((issue) => [issue.key, issue]));
  const ranked = tasks
    .map((task) => rankWorkTask(task, today, sourceById, jiraByKey, attendance))
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
  attendance?: AttendanceContext;
}): BriefingFocusItemDraft[] {
  const maxItems = input.maxItems ?? DAILY_FOCUS_TASK_LIMIT;
  const rankedTasks = rankWorkTasks(
    input.tasks,
    input.today,
    input.sourceById,
    input.jiraPending,
    input.attendance
  );
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

  // Commitments from meetings the user attended in the last 4 days are
  // force-included first, ahead of everything else, even without a Jira ticket.
  const isForced = (candidate: FocusCandidate): boolean =>
    candidate.kind === "task" && candidate.ranked.forceInclude;
  candidates.sort((a, b) => {
    const forcedDelta = Number(isForced(b)) - Number(isForced(a));
    if (forcedDelta !== 0) return forcedDelta;
    return b.score - a.score;
  });

  const forcedCount = candidates.filter(isForced).length;
  // Never let the daily limit drop a must-do commitment.
  const effectiveMax = Math.max(maxItems, forcedCount);

  const focus: BriefingFocusItemDraft[] = [];

  for (const candidate of candidates) {
    if (focus.length >= effectiveMax) break;

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
        priorityExplanation: priorityExplanationForDisplay(ranked.explanation.join(" · ")),
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
      priorityExplanation: priorityExplanationForDisplay(ranked.explanation.join(" · ")),
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
    } else if (index === 1) {
      status = "next";
    } else if (item.forceInclude) {
      // A commitment from a meeting the user attended in the last 4 days must
      // surface as active work — never buried in "later".
      status = "next";
    } else {
      status = "later";
    }

    return {
      taskId: item.taskId,
      status,
      priorityScore: item.normalizedScore,
      // Ranking must never replace the source-grounded explanation of the
      // actual work with internal scores or terse signal labels.
      reason: task?.reason ?? "The task needs source review before work begins.",
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
