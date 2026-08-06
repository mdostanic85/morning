import "server-only";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  workTasks as workTasksTable,
  evidence as evidenceTable,
  taskCriterionEvidence as taskCriterionEvidenceTable,
  verificationReports as verificationReportsTable,
  syncReviewReports as syncReviewReportsTable,
} from "@/db/tables";
import { fetchAll, fetchOne, execute, fetchReturning, withTransaction, syncRun, syncAll } from "@/db/query";
import { isPostgresDatabase } from "@/db/dialect";
import type { NewWorkTask, WorkTask, WorkTaskPatch, WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES, hasRequiredPillars } from "@/domain/workTask";
import type { Evidence, NewEvidence } from "@/domain/evidence";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { findTaskIdByJiraKey } from "@/lib/tasks/resolveFocusTask";
import { jiraKeyForTask } from "@/lib/tasks/transcriptTaskMerge";
import { isQuoteRelevantToTask, taskDomainText } from "@/lib/tasks/evidenceRelevance";
import { isRejectedOwnership } from "@/lib/tasks/ownershipDecision";
import { toEvidence } from "./evidence";
import { getSourceItemByExternalId, getSourceItemsByIds, searchSourceItems } from "./sourceItems";

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
    confidenceComponents: row.confidenceComponents ?? null,
    reason: row.reason,
    nextAction: row.nextAction,
    doneCriteria: row.doneCriteria ?? [],
    meetingContext: row.meetingContext ?? [],
    dueDate: row.dueDate,
    owner: row.owner,
    waitingOn: row.waitingOn,
    figmaFrameUrl: row.figmaFrameUrl,
    localRepoPath: row.localRepoPath,
    githubRepo: row.githubRepo,
    workContext: row.workContext,
    canonicalKey: row.canonicalKey ?? null,
    ownershipDecision: (row.ownershipDecision as WorkTask["ownershipDecision"] | null) ?? null,
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

/**
 * Attaches evidence + reports to tasks. Every UI surface (Today, task detail,
 * TaskCard's evidence drawer, the AI explanation drawer) reads `task.evidence`
 * straight from here, so the per-quote relevance safety net lives in this one
 * place rather than in each component — no task's evidence carries a different
 * task's line just because it shared a source with a genuinely relevant quote
 * (see `evidenceRelevance.ts`).
 *
 * `filterRelevance: false` is for the retroactive prune job only — it must
 * see the raw, unfiltered rows to find and delete the off-topic ones; the
 * live filter would otherwise hide them from `task.evidence` before the prune
 * ever inspects them, and the DB would never self-heal.
 */
async function attachContext(
  tasks: WorkTask[],
  options: { filterRelevance?: boolean } = {}
): Promise<WorkTaskWithEvidence[]> {
  if (tasks.length === 0) return [];
  const { filterRelevance = true } = options;
  const allEvidence = await fetchAll(db.select().from(evidenceTable));
  const allReports = await fetchAll(
    db.select().from(verificationReportsTable).orderBy(desc(verificationReportsTable.createdAt))
  );
  const allSyncReports = await fetchAll(
    db.select().from(syncReviewReportsTable).orderBy(desc(syncReviewReportsTable.createdAt))
  );
  const byTask = new Map<number, Evidence[]>();
  for (const e of allEvidence) {
    const list = byTask.get(e.taskId) ?? [];
    list.push(toEvidence(e));
    byTask.set(e.taskId, list);
  }

  if (filterRelevance) {
    const referencedSourceIds = [...new Set(allEvidence.map((e) => e.sourceItemId))];
    const sourceById = new Map(
      (await getSourceItemsByIds(referencedSourceIds)).map((s) => [s.id, s])
    );
    for (const task of tasks) {
      const taskKey = jiraKeyForTask({ title: task.title });
      const list = byTask.get(task.id);
      if (!list || list.length === 0) continue;

      const domain = taskDomainText(task);
      const newestSourceTime = list.reduce((max, row) => {
        const t = Date.parse(row.sourceDate);
        return Number.isFinite(t) ? Math.max(max, t) : max;
      }, 0);

      const relevant = list.filter((row) => {
        const source = sourceById.get(row.sourceItemId);
        const quoteText = (row.quote ?? "").trim() || row.summary.trim();
        return isQuoteRelevantToTask({
          taskKey,
          domain,
          newestSourceTime,
          source: {
            sourceType: source?.sourceType ?? "other",
            sourceExternalId: source?.sourceExternalId ?? null,
            sourceDate: source?.sourceDate ?? row.sourceDate,
          },
          quoteText,
        }).relevant;
      });
      // Empty is safer than presenting an unrelated quote as truth. Jira tasks
      // keep their matching ticket anchor; meeting-created tasks must retain at
      // least one genuinely topical quote to show supporting evidence.
      byTask.set(task.id, relevant);
    }
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
  const returning = tx.insert(workTasksTable).values({
    projectId: input.projectId ?? null,
    title: input.title,
    status: input.status,
    priorityScore: input.priorityScore ?? null,
    confidence: input.confidence ?? null,
    confidenceComponents: input.confidenceComponents ?? null,
    reason: input.reason,
    nextAction: input.nextAction,
    doneCriteria: input.doneCriteria,
    meetingContext: input.meetingContext ?? [],
    dueDate: input.dueDate ?? null,
    owner: input.owner ?? null,
    waitingOn: input.waitingOn ?? null,
    githubRepo: input.githubRepo ?? null,
    workContext: input.workContext ?? null,
    reviewStatus: input.reviewStatus ?? "approved",
    statusManuallySet: input.statusManuallySet ?? false,
    canonicalKey: input.canonicalKey ?? null,
    ownershipDecision: input.ownershipDecision ?? null,
  }).returning();
  const rows = syncAll(returning);
  const [row] = rows;
  return toWorkTask(row);
}

export async function createWorkTask(input: NewWorkTask): Promise<WorkTask> {
  if (!hasRequiredPillars(input)) {
    throw new Error(
      `Refusing to create task "${input.title}": every task must have a next action and at least one done criterion.`
    );
  }
  const [row] = await fetchReturning(
    db
      .insert(workTasksTable)
      .values({
        projectId: input.projectId ?? null,
        title: input.title,
        status: input.status,
        priorityScore: input.priorityScore ?? null,
        confidence: input.confidence ?? null,
        confidenceComponents: input.confidenceComponents ?? null,
        reason: input.reason,
        nextAction: input.nextAction,
        doneCriteria: input.doneCriteria,
        meetingContext: input.meetingContext ?? [],
        dueDate: input.dueDate ?? null,
        owner: input.owner ?? null,
        waitingOn: input.waitingOn ?? null,
        reviewStatus: input.reviewStatus ?? "approved",
        statusManuallySet: input.statusManuallySet ?? false,
        canonicalKey: input.canonicalKey ?? null,
        ownershipDecision: input.ownershipDecision ?? null,
      })
      .returning()
  );
  return toWorkTask(row);
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

  if (isPostgresDatabase()) {
    return db.transaction(async (tx) => {
      const [taskRow] = await tx.insert(workTasksTable).values({
        projectId: effectiveInput.projectId ?? null,
        title: effectiveInput.title,
        status: effectiveInput.status,
        priorityScore: effectiveInput.priorityScore ?? null,
        confidence: effectiveInput.confidence ?? null,
        confidenceComponents: effectiveInput.confidenceComponents ?? null,
        reason: effectiveInput.reason,
        nextAction: effectiveInput.nextAction,
        doneCriteria: effectiveInput.doneCriteria,
        meetingContext: effectiveInput.meetingContext ?? [],
        dueDate: effectiveInput.dueDate ?? null,
        owner: effectiveInput.owner ?? null,
        waitingOn: effectiveInput.waitingOn ?? null,
        reviewStatus: effectiveInput.reviewStatus ?? "approved",
        statusManuallySet: effectiveInput.statusManuallySet ?? false,
        canonicalKey: effectiveInput.canonicalKey ?? null,
        ownershipDecision: effectiveInput.ownershipDecision ?? null,
      }).returning();
      const task = toWorkTask(taskRow);
      const evidenceRows = await Promise.all(
        evidenceItems.map(async (item) => {
          const [row] = await tx.insert(evidenceTable).values({
            taskId: task.id,
            sourceItemId: item.sourceItemId,
            quote: item.quote ?? null,
            summary: item.summary,
            sourceDate: item.sourceDate,
            url: item.url ?? null,
          }).returning();
          return toEvidence(row);
        })
      );
      return { task, evidence: evidenceRows };
    });
  }

  return withTransaction((tx) => {
    const task = insertWorkTaskRow(tx, effectiveInput);
    const evidenceRows = evidenceItems.map((item) => {
      const [row] = syncAll(
        tx
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
      );
      return toEvidence(row);
    });
    return { task, evidence: evidenceRows };
  });
}

/** All non-done, user-approved tasks, grouped by status, in the fixed queue order. Each status is sorted by priorityScore desc. */
export async function getTodayQueue(): Promise<Record<WorkTaskStatus, WorkTaskWithEvidence[]>> {
  const rows = await fetchAll(
    db
      .select()
      .from(workTasksTable)
      .where(and(ne(workTasksTable.status, "done"), eq(workTasksTable.reviewStatus, "approved")))
      .orderBy(desc(workTasksTable.priorityScore))
  );

  const withEvidence = await attachContext(rows.map(toWorkTask));

  const grouped = Object.fromEntries(
    OPEN_QUEUE_STATUSES.map((s) => [s, [] as WorkTaskWithEvidence[]])
  ) as unknown as Record<WorkTaskStatus, WorkTaskWithEvidence[]>;
  grouped.done = [];

  for (const task of withEvidence) {
    if (isRejectedOwnership(task)) continue;
    grouped[task.status].push(task);
  }

  return grouped;
}

export async function getDistinctOwners(): Promise<string[]> {
  const rows = await fetchAll(
    db
      .selectDistinct({ owner: workTasksTable.owner })
      .from(workTasksTable)
      .where(and(isNotNull(workTasksTable.owner), ne(workTasksTable.status, "done")))
  );
  return rows
    .map((r) => r.owner)
    .filter((o): o is string => o !== null)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export async function getWorkTaskById(id: number): Promise<WorkTaskWithEvidence | null> {
  const row = await fetchOne(db.select().from(workTasksTable).where(eq(workTasksTable.id, id)));
  if (!row) return null;
  const arr = await attachContext([toWorkTask(row)]);
  return arr[0];
}

export async function getWorkTaskByJiraKey(
  issueKey: string
): Promise<WorkTaskWithEvidence | null> {
  const rows = await fetchAll(db.select().from(workTasksTable).where(eq(workTasksTable.reviewStatus, "approved")));
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

  const sourceItem =
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
  const rows = await fetchAll(
    db.select().from(workTasksTable).where(eq(workTasksTable.reviewStatus, "approved")).orderBy(desc(workTasksTable.updatedAt))
  );
  return await attachContext(rows.map(toWorkTask));
}

/**
 * Same task set as `getWorkTasks` (approved, not done), but with evidence
 * completely unfiltered — for the retroactive relevance prune job only (see
 * `attachContext`'s `filterRelevance` doc). Never use this for anything that
 * renders to the user.
 */
export async function getWorkTasksWithRawEvidenceForPrune(): Promise<WorkTaskWithEvidence[]> {
  const rows = await fetchAll(
    db
      .select()
      .from(workTasksTable)
      .where(and(eq(workTasksTable.reviewStatus, "approved"), ne(workTasksTable.status, "done")))
  );
  return await attachContext(rows.map(toWorkTask), { filterRelevance: false });
}

export async function getOpenTasksForProject(projectId: number): Promise<WorkTaskWithEvidence[]> {
  const rows = await fetchAll(
    db
      .select()
      .from(workTasksTable)
      .where(and(eq(workTasksTable.projectId, projectId), eq(workTasksTable.reviewStatus, "approved")))
      .orderBy(desc(workTasksTable.priorityScore))
  );
  const filtered = rows.filter((r) => r.status !== "done");
  return await attachContext(filtered.map(toWorkTask));
}

/** Extracted tasks awaiting user approval, newest first. */
export async function getPendingTasks(): Promise<WorkTaskWithEvidence[]> {
  const rows = await fetchAll(
    db.select().from(workTasksTable).where(eq(workTasksTable.reviewStatus, "pending")).orderBy(desc(workTasksTable.createdAt))
  );
  return await attachContext(rows.map(toWorkTask));
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

  const rows = await fetchAll(
    db.select().from(workTasksTable).where(inArray(workTasksTable.id, decisions.map((d) => d.taskId)))
  );
  const currentById = new Map(rows.map((row) => [row.id, row]));
  const now = new Date().toISOString();

  let updated = 0;
  let preserved = 0;

  if (isPostgresDatabase()) {
    await db.transaction(async (tx) => {
      for (const decision of decisions) {
        const current = currentById.get(decision.taskId);
        if (!current) continue;

        const statusIsProtected = current.statusManuallySet || current.status === "unclear";
        if (statusIsProtected) {
          await tx
            .update(workTasksTable)
            .set({ priorityScore: decision.priorityScore, updatedAt: now })
            .where(eq(workTasksTable.id, decision.taskId));
          preserved += 1;
          continue;
        }

        await tx
          .update(workTasksTable)
          .set({
            status: decision.status,
            priorityScore: decision.priorityScore,
            reason: decision.reason,
            waitingOn: decision.waitingOn,
            confidence: decision.confidence,
            updatedAt: now,
          })
          .where(eq(workTasksTable.id, decision.taskId));
        updated += 1;
      }

      const nowRows = await tx
        .select()
        .from(workTasksTable)
        .where(and(eq(workTasksTable.status, "now"), eq(workTasksTable.reviewStatus, "approved")))
        .orderBy(desc(workTasksTable.statusManuallySet), desc(workTasksTable.priorityScore));

      for (const row of nowRows.slice(1)) {
        if (row.statusManuallySet) continue;
        await tx
          .update(workTasksTable)
          .set({ status: "next", updatedAt: now })
          .where(eq(workTasksTable.id, row.id));
      }
    });
    return { updated, preserved };
  }

  await withTransaction((tx) => {
    for (const decision of decisions) {
      const current = currentById.get(decision.taskId);
      if (!current) continue;

      const statusIsProtected = current.statusManuallySet || current.status === "unclear";
      if (statusIsProtected) {
        syncRun(
          tx.update(workTasksTable)
          .set({ priorityScore: decision.priorityScore, updatedAt: now })
          .where(eq(workTasksTable.id, decision.taskId))
        );
        preserved += 1;
        continue;
      }

      syncRun(
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
      );
      updated += 1;
    }

    const nowRows = syncAll(
      tx
      .select()
      .from(workTasksTable)
      .where(and(eq(workTasksTable.status, "now"), eq(workTasksTable.reviewStatus, "approved")))
      .orderBy(desc(workTasksTable.statusManuallySet), desc(workTasksTable.priorityScore))
    );
    for (const row of nowRows.slice(1)) {
      if (row.statusManuallySet) continue;
      syncRun(
        tx.update(workTasksTable)
        .set({ status: "next", updatedAt: now })
        .where(eq(workTasksTable.id, row.id))
      );
    }
  });

  return { updated, preserved };
}

export async function updateWorkTask(id: number, patch: WorkTaskPatch): Promise<WorkTask | null> {
  const [row] = await fetchReturning(
    db.update(workTasksTable).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(workTasksTable.id, id)).returning()
  );
  return row ? toWorkTask(row) : null;
}

export async function approveWorkTask(id: number): Promise<WorkTask | null> {
  const [row] = await fetchReturning(
    db.update(workTasksTable).set({ reviewStatus: "approved", updatedAt: new Date().toISOString() }).where(eq(workTasksTable.id, id)).returning()
  );
  return row ? toWorkTask(row) : null;
}

export async function deleteWorkTask(id: number): Promise<void> {
  // `task_criterion_evidence` FKs both task and evidence with no CASCADE.
  // Clear those links first so neither evidence nor task delete can raise 23503.
  if (isPostgresDatabase()) {
    await db.transaction(async (tx) => {
      await tx.delete(taskCriterionEvidenceTable).where(eq(taskCriterionEvidenceTable.taskId, id));
      await tx.delete(evidenceTable).where(eq(evidenceTable.taskId, id));
      await tx.delete(verificationReportsTable).where(eq(verificationReportsTable.taskId, id));
      await tx.delete(workTasksTable).where(eq(workTasksTable.id, id));
    });
    return;
  }

  await withTransaction((tx) => {
    syncRun(tx.delete(taskCriterionEvidenceTable).where(eq(taskCriterionEvidenceTable.taskId, id)));
    syncRun(tx.delete(evidenceTable).where(eq(evidenceTable.taskId, id)));
    syncRun(tx.delete(verificationReportsTable).where(eq(verificationReportsTable.taskId, id)));
    syncRun(tx.delete(workTasksTable).where(eq(workTasksTable.id, id)));
  });
}
