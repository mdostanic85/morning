import "server-only";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  workTasks as workTasksTable,
  evidence as evidenceTable,
  verificationReports as verificationReportsTable,
  syncReviewReports as syncReviewReportsTable,
} from "@/db/schema";
import type { NewWorkTask, WorkTask, WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES, hasRequiredPillars } from "@/domain/workTask";
import type { Evidence, NewEvidence } from "@/domain/evidence";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { findTaskIdByJiraKey } from "@/lib/tasks/resolveFocusTask";
import { toEvidence } from "./evidence";
import { getSourceItemByExternalId, searchSourceItems } from "./sourceItems";

function toWorkTask(row: typeof workTasksTable.$inferSelect): WorkTask {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    statusManuallySet: row.statusManuallySet,
    reviewStatus: row.reviewStatus,
    priorityScore: row.priorityScore,
    confidence: row.confidence,
    reason: row.reason,
    nextAction: row.nextAction,
    doneCriteria: row.doneCriteria ?? [],
    dueDate: row.dueDate,
    owner: row.owner,
    waitingOn: row.waitingOn,
    figmaFrameUrl: row.figmaFrameUrl,
    localRepoPath: row.localRepoPath,
    githubRepo: row.githubRepo,
    workContext: row.workContext,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface WorkTaskWithEvidence extends WorkTask {
  evidence: Evidence[];
  latestVerificationReport: VerificationReport | null;
  latestSyncReviewReport: SyncReviewReport | null;
}

function toVerificationReport(
  row: typeof verificationReportsTable.$inferSelect
): VerificationReport {
  return {
    id: row.id,
    taskId: row.taskId,
    verdict: row.verdict,
    matches: row.matches ?? [],
    missing: row.missing ?? [],
    risks: row.risks ?? [],
    recommendedNextAction: row.recommendedNextAction,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

function toSyncReviewReport(row: typeof syncReviewReportsTable.$inferSelect): SyncReviewReport {
  return {
    id: row.id,
    taskId: row.taskId,
    summary: row.summary,
    ok: row.ok ?? [],
    notOk: row.notOk ?? [],
    conflicts: row.conflicts ?? [],
    githubBranch: row.githubBranch,
    figmaUrl: row.figmaUrl,
    recommendedNextAction: row.recommendedNextAction,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

function attachContext(tasks: WorkTask[]): WorkTaskWithEvidence[] {
  if (tasks.length === 0) return [];
  const allEvidence = db.select().from(evidenceTable).all();
  const allReports = db
    .select()
    .from(verificationReportsTable)
    .orderBy(desc(verificationReportsTable.createdAt))
    .all();
  const allSyncReports = db
    .select()
    .from(syncReviewReportsTable)
    .orderBy(desc(syncReviewReportsTable.createdAt))
    .all();
  const byTask = new Map<number, Evidence[]>();
  for (const e of allEvidence) {
    const list = byTask.get(e.taskId) ?? [];
    list.push(toEvidence(e));
    byTask.set(e.taskId, list);
  }

  const latestReportByTask = new Map<number, VerificationReport>();
  for (const report of allReports) {
    if (latestReportByTask.has(report.taskId)) continue;
    latestReportByTask.set(report.taskId, toVerificationReport(report));
  }

  const latestSyncReportByTask = new Map<number, SyncReviewReport>();
  for (const report of allSyncReports) {
    if (latestSyncReportByTask.has(report.taskId)) continue;
    latestSyncReportByTask.set(report.taskId, toSyncReviewReport(report));
  }

  return tasks.map((task) => ({
    ...task,
    evidence: byTask.get(task.id) ?? [],
    latestVerificationReport: latestReportByTask.get(task.id) ?? null,
    latestSyncReviewReport: latestSyncReportByTask.get(task.id) ?? null,
  }));
}

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function insertWorkTaskRow(tx: DbOrTransaction, input: NewWorkTask): WorkTask {
  const [row] = tx
    .insert(workTasksTable)
    .values({
      projectId: input.projectId ?? null,
      title: input.title,
      status: input.status,
      priorityScore: input.priorityScore ?? null,
      confidence: input.confidence ?? null,
      reason: input.reason,
      nextAction: input.nextAction,
      doneCriteria: input.doneCriteria,
      dueDate: input.dueDate ?? null,
      owner: input.owner ?? null,
      waitingOn: input.waitingOn ?? null,
      reviewStatus: input.reviewStatus ?? "approved",
      statusManuallySet: input.statusManuallySet ?? false,
    })
    .returning()
    .all();
  return toWorkTask(row);
}

export async function createWorkTask(input: NewWorkTask): Promise<WorkTask> {
  if (!hasRequiredPillars(input)) {
    throw new Error(
      `Refusing to create task "${input.title}": every task must have a next action and at least one done criterion.`
    );
  }
  return insertWorkTaskRow(db, input);
}

/**
 * The only correct way to persist an AI-extracted task: the task and its
 * evidence rows are written in one transaction, so a mid-write failure can
 * never leave an orphan task without evidence. A task submitted with zero
 * evidence is never saved as a normal queue item — it is demoted to
 * "unclear" so the UI treats it as unresolved rather than fact.
 */
export async function createWorkTaskWithEvidence(
  input: NewWorkTask,
  evidenceItems: Omit<NewEvidence, "taskId">[]
): Promise<{ task: WorkTask; evidence: Evidence[] }> {
  if (!hasRequiredPillars(input)) {
    throw new Error(
      `Refusing to create task "${input.title}": every task must have a next action and at least one done criterion.`
    );
  }

  const effectiveInput: NewWorkTask =
    evidenceItems.length === 0 && input.status !== "unclear"
      ? {
          ...input,
          status: "unclear",
          reason: `${input.reason} (Unclear: no supporting evidence was recorded for this task.)`,
        }
      : input;

  return db.transaction((tx) => {
    const task = insertWorkTaskRow(tx, effectiveInput);
    const evidenceRows = evidenceItems.map((item) => {
      const [row] = tx
        .insert(evidenceTable)
        .values({
          taskId: task.id,
          sourceItemId: item.sourceItemId,
          quote: item.quote ?? null,
          summary: item.summary,
          sourceDate: item.sourceDate,
          url: item.url ?? null,
        })
        .returning()
        .all();
      return toEvidence(row);
    });
    return { task, evidence: evidenceRows };
  });
}

/** All non-done, user-approved tasks, grouped by status, in the fixed queue order. Each status is sorted by priorityScore desc. */
export async function getTodayQueue(): Promise<Record<WorkTaskStatus, WorkTaskWithEvidence[]>> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(and(ne(workTasksTable.status, "done"), eq(workTasksTable.reviewStatus, "approved")))
    .orderBy(desc(workTasksTable.priorityScore))
    .all();

  const withEvidence = attachContext(rows.map(toWorkTask));

  const grouped = Object.fromEntries(
    OPEN_QUEUE_STATUSES.map((s) => [s, [] as WorkTaskWithEvidence[]])
  ) as unknown as Record<WorkTaskStatus, WorkTaskWithEvidence[]>;
  grouped.done = [];

  for (const task of withEvidence) {
    grouped[task.status].push(task);
  }

  return grouped;
}

export function getDistinctOwners(): string[] {
  const rows = db
    .selectDistinct({ owner: workTasksTable.owner })
    .from(workTasksTable)
    .where(and(isNotNull(workTasksTable.owner), ne(workTasksTable.status, "done")))
    .all();
  return rows
    .map((r) => r.owner)
    .filter((o): o is string => o !== null)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export async function getWorkTaskById(id: number): Promise<WorkTaskWithEvidence | null> {
  const row = db.select().from(workTasksTable).where(eq(workTasksTable.id, id)).get();
  if (!row) return null;
  return attachContext([toWorkTask(row)])[0];
}

export async function getWorkTaskByJiraKey(
  issueKey: string
): Promise<WorkTaskWithEvidence | null> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(eq(workTasksTable.reviewStatus, "approved"))
    .all();
  const tasks = rows.map(toWorkTask);
  const taskId = findTaskIdByJiraKey(tasks, issueKey);
  if (taskId == null) return null;
  return getWorkTaskById(taskId);
}

export interface EnsureJiraFocusTaskInput {
  title: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
}

/** Links a Jira-only focus card to a local queue task, creating one when needed. */
export async function ensureWorkTaskForJiraIssue(
  issueKey: string,
  seed: EnsureJiraFocusTaskInput
): Promise<WorkTaskWithEvidence> {
  const key = issueKey.trim().toUpperCase();
  const existing = await getWorkTaskByJiraKey(key);
  if (existing) return existing;

  let sourceItem =
    (await getSourceItemByExternalId({ sourceType: "jira", sourceExternalId: key })) ??
    (await searchSourceItems(key)).find((item) => item.title.toUpperCase().startsWith(`${key}:`)) ??
    null;

  const evidenceItems: Omit<NewEvidence, "taskId">[] = sourceItem
    ? [
        {
          sourceItemId: sourceItem.id,
          quote: sourceItem.body.slice(0, 500) || null,
          summary: sourceItem.title,
          sourceDate: sourceItem.sourceDate,
          url: sourceItem.url,
        },
      ]
    : [];

  const { task } = await createWorkTaskWithEvidence(
    {
      title: seed.title.trim(),
      reason: seed.reason.trim(),
      nextAction: seed.nextAction.trim(),
      doneCriteria: seed.doneCriteria,
      status: "now",
      statusManuallySet: true,
    },
    evidenceItems
  );

  const created = await getWorkTaskById(task.id);
  if (!created) {
    throw new Error(`Could not load task after creating ${key}.`);
  }
  return created;
}

/** All user-approved tasks (any status) — pending review items are excluded. */
export async function getWorkTasks(): Promise<WorkTaskWithEvidence[]> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(eq(workTasksTable.reviewStatus, "approved"))
    .orderBy(desc(workTasksTable.updatedAt))
    .all();
  return attachContext(rows.map(toWorkTask));
}

export async function getOpenTasksForProject(projectId: number): Promise<WorkTaskWithEvidence[]> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(and(eq(workTasksTable.projectId, projectId), eq(workTasksTable.reviewStatus, "approved")))
    .orderBy(desc(workTasksTable.priorityScore))
    .all()
    .filter((r) => r.status !== "done");

  return attachContext(rows.map(toWorkTask));
}

/** Extracted tasks awaiting user approval, newest first. */
export async function getPendingTasks(): Promise<WorkTaskWithEvidence[]> {
  const rows = db
    .select()
    .from(workTasksTable)
    .where(eq(workTasksTable.reviewStatus, "pending"))
    .orderBy(desc(workTasksTable.createdAt))
    .all();
  return attachContext(rows.map(toWorkTask));
}

/**
 * Applies a batch of planner decisions atomically. Tasks whose status was set
 * manually by the user, and tasks currently in "unclear", keep their status —
 * the planner may only refresh their priority score. Only the user resolves
 * an unclear task (e.g. via Start) or reverses a manual decision.
 */
export async function applyPlannerDecisions(
  decisions: {
    taskId: number;
    status: Exclude<WorkTaskStatus, "done">;
    priorityScore: number;
    reason: string;
    waitingOn: string | null;
    confidence: number;
  }[]
): Promise<{ updated: number; preserved: number }> {
  if (decisions.length === 0) return { updated: 0, preserved: 0 };

  const rows = db
    .select()
    .from(workTasksTable)
    .where(
      inArray(
        workTasksTable.id,
        decisions.map((d) => d.taskId)
      )
    )
    .all();
  const currentById = new Map(rows.map((row) => [row.id, row]));
  const now = new Date().toISOString();

  let updated = 0;
  let preserved = 0;

  db.transaction((tx) => {
    for (const decision of decisions) {
      const current = currentById.get(decision.taskId);
      if (!current) continue;

      const statusIsProtected = current.statusManuallySet || current.status === "unclear";
      if (statusIsProtected) {
        tx.update(workTasksTable)
          .set({ priorityScore: decision.priorityScore, updatedAt: now })
          .where(eq(workTasksTable.id, decision.taskId))
          .run();
        preserved += 1;
        continue;
      }

      tx.update(workTasksTable)
        .set({
          status: decision.status,
          priorityScore: decision.priorityScore,
          reason: decision.reason,
          waitingOn: decision.waitingOn,
          confidence: decision.confidence,
          updatedAt: now,
        })
        .where(eq(workTasksTable.id, decision.taskId))
        .run();
      updated += 1;
    }

    // Keep exactly one task in "now" so the morning view always has a single
    // primary focus. A user-started task always wins; among planner-set tasks
    // the highest-scored one stays and the rest move to "next". Tasks the
    // user explicitly started are never demoted here.
    const nowRows = tx
      .select()
      .from(workTasksTable)
      .where(and(eq(workTasksTable.status, "now"), eq(workTasksTable.reviewStatus, "approved")))
      .orderBy(desc(workTasksTable.statusManuallySet), desc(workTasksTable.priorityScore))
      .all();
    for (const row of nowRows.slice(1)) {
      if (row.statusManuallySet) continue;
      tx.update(workTasksTable)
        .set({ status: "next", updatedAt: now })
        .where(eq(workTasksTable.id, row.id))
        .run();
    }
  });

  return { updated, preserved };
}

export async function updateWorkTask(id: number, patch: WorkTaskPatch): Promise<WorkTask | null> {
  const [row] = db
    .update(workTasksTable)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(workTasksTable.id, id))
    .returning()
    .all();
  return row ? toWorkTask(row) : null;
}

export async function approveWorkTask(id: number): Promise<WorkTask | null> {
  const [row] = db
    .update(workTasksTable)
    .set({ reviewStatus: "approved", updatedAt: new Date().toISOString() })
    .where(eq(workTasksTable.id, id))
    .returning()
    .all();
  return row ? toWorkTask(row) : null;
}

export async function deleteWorkTask(id: number): Promise<void> {
  db.transaction((tx) => {
    tx.delete(evidenceTable).where(eq(evidenceTable.taskId, id)).run();
    tx.delete(verificationReportsTable).where(eq(verificationReportsTable.taskId, id)).run();
    tx.delete(workTasksTable).where(eq(workTasksTable.id, id)).run();
  });
}
