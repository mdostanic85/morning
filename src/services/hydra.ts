import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectForJiraKey } from "@/lib/projects/projectForJiraKey";
import {
  auditLogs,
  evidenceRelations,
  hydraEvidenceItems,
  notificationDeliveries,
  projects,
  reportRuns,
  reportFeedback,
  reports,
  reportTasks,
  sourceDocuments,
  syncCursors,
  taskSchedules,
  workspaces,
} from "@/db/tables";
import { fetchAll, fetchOne, execute, fetchReturning } from "@/db/query";
import {
  DEFAULT_HYDRA_CONFIG,
  HYDRA_REPORT_SCHEMA_VERSION,
  type HydraReport,
  type SourceStatus,
} from "@/domain/hydraReport";

export type HydraTask = typeof reportTasks.$inferSelect;
export type HydraSchedule = typeof taskSchedules.$inferSelect;
export type HydraRun = typeof reportRuns.$inferSelect;
export type HydraEvidence = typeof hydraEvidenceItems.$inferSelect;
export type StoredHydraReport = typeof reports.$inferSelect;

export const DEFAULT_HYDRA_SCHEDULES = [
  { type: "morning" as const, cron: "30 9 * * 1-5", hour: 9, minute: 30 },
  { type: "evening" as const, cron: "15 19 * * 1-5", hour: 19, minute: 15 },
];

export async function writeAuditLog(input: {
  workspaceId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
}) {
  await execute(
    db.insert(auditLogs).values({
      workspaceId: input.workspaceId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      metadata: input.metadata ?? {},
    })
  );
}

export async function ensureHydraSetup(): Promise<{
  workspace: typeof workspaces.$inferSelect;
  task: HydraTask;
  schedules: HydraSchedule[];
}> {
  let workspace = await fetchOne(db.select().from(workspaces).orderBy(workspaces.id));
  if (!workspace) {
    const [w] = await fetchReturning(
      db.insert(workspaces).values({ name: "Miloš · Hydra", timezone: DEFAULT_HYDRA_CONFIG.timezone }).returning()
    );
    workspace = w;
  }

  const projectRows = await fetchAll(db.select().from(projects));
  const hydraProject =
    projectRows.find((project) => /hydra|asc/i.test(project.name)) ??
    projectForJiraKey(projectRows, "UATL") ??
    null;

  let task = await fetchOne(db.select().from(reportTasks).where(eq(reportTasks.template, "hydra_asc")));
  if (!task) {
    const [t] = await fetchReturning(
      db
        .insert(reportTasks)
        .values({
          workspaceId: workspace.id,
          projectId: hydraProject?.id ?? null,
          name: "Hydra Daily Work Operator",
          template: "hydra_asc",
          promptVersion: "hydra-report-v1",
          schemaVersion: HYDRA_REPORT_SCHEMA_VERSION,
          configVersion: 1,
          config: { ...DEFAULT_HYDRA_CONFIG },
          deliverySettings: { inApp: true, email: false, push: false },
        })
        .returning()
    );
    task = t;
    await writeAuditLog({
      workspaceId: workspace.id,
      action: "report_task.created",
      entityType: "report_task",
      entityId: task.id,
      metadata: { template: task.template },
    });
  } else if (!task.projectId && hydraProject) {
    const [t] = await fetchReturning(
      db.update(reportTasks).set({ projectId: hydraProject.id, updatedAt: new Date().toISOString() }).where(eq(reportTasks.id, task.id)).returning()
    );
    task = t;
  }

  let schedules = await fetchAll(db.select().from(taskSchedules).where(eq(taskSchedules.reportTaskId, task.id)));
  for (const schedule of DEFAULT_HYDRA_SCHEDULES) {
    if (schedules.some((entry) => entry.type === schedule.type)) continue;
    await execute(
      db.insert(taskSchedules).values({
        reportTaskId: task.id,
        ...schedule,
        timezone: DEFAULT_HYDRA_CONFIG.timezone,
        enabled: true,
      })
    );
  }
  schedules = await fetchAll(db.select().from(taskSchedules).where(eq(taskSchedules.reportTaskId, task.id)).orderBy(taskSchedules.hour));
  return { workspace, task, schedules };
}

export async function updateHydraTask(input: {
  config?: Record<string, unknown>;
  deliverySettings?: { inApp: boolean; email: boolean; push: boolean };
}) {
  const setup = await ensureHydraSetup();
  const patch: Partial<typeof reportTasks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.config) {
    patch.config = { ...(setup.task.config ?? {}), ...input.config };
    patch.configVersion = setup.task.configVersion + 1;
  }
  if (input.deliverySettings) patch.deliverySettings = input.deliverySettings;
  const [updated] = await fetchReturning(db.update(reportTasks).set(patch).where(eq(reportTasks.id, setup.task.id)).returning());
  await writeAuditLog({
    workspaceId: setup.workspace.id,
    action: "report_task.updated",
    entityType: "report_task",
    entityId: setup.task.id,
    metadata: { configVersion: updated.configVersion },
  });
  return updated;
}

export async function updateHydraSchedule(
  id: number,
  patch: { hour?: number; minute?: number; timezone?: string; enabled?: boolean }
) {
  const existing = await fetchOne(db.select().from(taskSchedules).where(eq(taskSchedules.id, id)));
  if (!existing) return null;
  const hour = patch.hour ?? existing.hour;
  const minute = patch.minute ?? existing.minute;
  const [updated] = await fetchReturning(
    db
      .update(taskSchedules)
      .set({
        ...patch,
        hour,
        minute,
        cron: `${minute} ${hour} * * 1-5`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(taskSchedules.id, id))
      .returning()
  );
  const setup = await ensureHydraSetup();
  await writeAuditLog({
    workspaceId: setup.workspace.id,
    action: "schedule.updated",
    entityType: "task_schedule",
    entityId: id,
    metadata: { type: updated.type, hour, minute, timezone: updated.timezone, enabled: updated.enabled },
  });
  return updated;
}

export async function createHydraRun(input: {
  runType: "morning" | "evening" | "manual";
  scheduledFor?: string;
  idempotencyKey?: string;
}): Promise<{ run: HydraRun; created: boolean }> {
  const setup = await ensureHydraSetup();
  const scheduledFor = input.scheduledFor ?? new Date().toISOString();
  const idempotencyKey =
    input.idempotencyKey ??
    (input.runType === "manual"
      ? `manual:${setup.task.id}:${randomUUID()}`
      : `${setup.task.id}:${input.runType}:${scheduledFor}`);
  const existing = await fetchOne(db.select().from(reportRuns).where(eq(reportRuns.idempotencyKey, idempotencyKey)));
  if (existing) return { run: existing, created: false };

  const [run] = await fetchReturning(
    db
      .insert(reportRuns)
      .values({
        reportTaskId: setup.task.id,
        runType: input.runType,
        scheduledFor,
        idempotencyKey,
        status: "queued",
        configSnapshot: {
          configVersion: setup.task.configVersion,
          promptVersion: setup.task.promptVersion,
          schemaVersion: setup.task.schemaVersion,
          config: setup.task.config,
        },
      })
      .returning()
  );
  await writeAuditLog({
    workspaceId: setup.workspace.id,
    action: input.runType === "manual" ? "report_run.manual_started" : "report_run.scheduled",
    entityType: "report_run",
    entityId: run.id,
    metadata: { runType: input.runType, scheduledFor },
  });
  return { run, created: true };
}

export async function getHydraRun(id: number): Promise<HydraRun | null> {
  return (await fetchOne(db.select().from(reportRuns).where(eq(reportRuns.id, id)))) ?? null;
}

export async function updateHydraRun(id: number, patch: Partial<typeof reportRuns.$inferInsert>) {
  const [row] = await fetchReturning(db.update(reportRuns).set(patch).where(eq(reportRuns.id, id)).returning());
  return row ?? null;
}

export async function listHydraRuns(input?: { status?: string; limit?: number }): Promise<HydraRun[]> {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const query = input?.status ? db.select().from(reportRuns).where(eq(reportRuns.status, input.status as HydraRun["status"])) : db.select().from(reportRuns);
  return await fetchAll(query.orderBy(desc(reportRuns.createdAt)).limit(limit));
}

export async function saveSourceDocument(input: typeof sourceDocuments.$inferInsert) {
  const existing = await fetchOne(
    db.select().from(sourceDocuments).where(and(eq(sourceDocuments.sourceItemId, input.sourceItemId), eq(sourceDocuments.contentHash, input.contentHash)))
  );
  if (existing) return existing;
  const [row] = await fetchReturning(db.insert(sourceDocuments).values(input).returning());
  return row;
}

export async function replaceHydraEvidence(
  runId: number,
  items: (Omit<typeof hydraEvidenceItems.$inferInsert, "id" | "runId"> & { runId?: number })[]
): Promise<HydraEvidence[]> {
  await execute(db.delete(evidenceRelations).where(eq(evidenceRelations.runId, runId)));
  await execute(db.delete(hydraEvidenceItems).where(eq(hydraEvidenceItems.runId, runId)));
  if (items.length === 0) return [];
  const rows = await fetchReturning(db.insert(hydraEvidenceItems).values(items.map((item) => ({ ...item, runId }))).returning());
  return rows;
}

export async function getHydraEvidence(runId: number): Promise<HydraEvidence[]> {
  return await fetchAll(
    db.select().from(hydraEvidenceItems).where(eq(hydraEvidenceItems.runId, runId)).orderBy(desc(hydraEvidenceItems.score), desc(hydraEvidenceItems.occurredAt))
  );
}

export async function updateHydraEvidenceScore(id: number, score: number, scoreReasons: string[]) {
  await execute(db.update(hydraEvidenceItems).set({ score, scoreReasons }).where(eq(hydraEvidenceItems.id, id)));
}

export async function createEvidenceRelation(input: typeof evidenceRelations.$inferInsert) {
  const [row] = await fetchReturning(db.insert(evidenceRelations).values(input).returning());
  return row;
}

export async function getEvidenceRelationsForRun(runId: number) {
  return await fetchAll(db.select().from(evidenceRelations).where(eq(evidenceRelations.runId, runId)));
}

export async function saveHydraReport(input: {
  runId: number;
  report: HydraReport;
  renderedText: string;
  citationCoverage: number;
}) {
  const existing = await fetchOne(db.select().from(reports).where(eq(reports.runId, input.runId)));
  if (existing) {
    const [updated] = await fetchReturning(
      db
        .update(reports)
        .set({
          structuredJson: input.report,
          renderedText: input.renderedText,
          citationCoverage: input.citationCoverage,
        })
        .where(eq(reports.id, existing.id))
        .returning()
    );
    return updated;
  }
  const [report] = await fetchReturning(
    db
      .insert(reports)
      .values({
        runId: input.runId,
        schemaVersion: HYDRA_REPORT_SCHEMA_VERSION,
        structuredJson: input.report,
        renderedText: input.renderedText,
        citationCoverage: input.citationCoverage,
      })
      .returning()
  );
  return report;
}

export async function getHydraReportByRunId(runId: number): Promise<StoredHydraReport | null> {
  return (await fetchOne(db.select().from(reports).where(eq(reports.runId, runId)))) ?? null;
}

export async function getLatestHydraReport(): Promise<{ run: HydraRun; report: StoredHydraReport } | null> {
  const runs = await fetchAll(db.select().from(reportRuns).orderBy(desc(reportRuns.completedAt)));
  const run = runs.find((entry) => entry.status === "completed" || entry.status === "partial");
  if (!run) return null;
  const report = await getHydraReportByRunId(run.id);
  return report ? { run, report } : null;
}

export async function createDelivery(input: typeof notificationDeliveries.$inferInsert) {
  const [row] = await fetchReturning(db.insert(notificationDeliveries).values(input).returning());
  return row;
}

export async function getDeliveriesForReport(reportId: number) {
  return await fetchAll(db.select().from(notificationDeliveries).where(eq(notificationDeliveries.reportId, reportId)));
}

export async function getAuditLog(limit = 100) {
  return await fetchAll(db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit));
}

export async function createReportFeedback(input: typeof reportFeedback.$inferInsert) {
  const [row] = await fetchReturning(db.insert(reportFeedback).values(input).returning());
  return row;
}

export async function getReportFeedback(reportId: number) {
  return await fetchAll(db.select().from(reportFeedback).where(eq(reportFeedback.reportId, reportId)));
}

export async function upsertSyncCursor(input: {
  reportTaskId: number;
  provider: string;
  cursor: string | null;
  lastSuccessfulSyncAt: string;
}) {
  const existing = await fetchOne(
    db.select().from(syncCursors).where(and(eq(syncCursors.reportTaskId, input.reportTaskId), eq(syncCursors.provider, input.provider)))
  );
  if (existing) {
    const [updated] = await fetchReturning(
      db.update(syncCursors).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(syncCursors.id, existing.id)).returning()
    );
    return updated;
  }
  const [row] = await fetchReturning(db.insert(syncCursors).values(input).returning());
  return row;
}

export async function getSyncCursors(reportTaskId: number) {
  return await fetchAll(db.select().from(syncCursors).where(eq(syncCursors.reportTaskId, reportTaskId)));
}

export function sourceHealthSummary(statuses: SourceStatus[]) {
  const checked = statuses.filter((entry) => entry.status !== "not_connected");
  const healthy = checked.filter((entry) => entry.status === "connected").length;
  return { healthy, checked: checked.length, total: statuses.length };
}
