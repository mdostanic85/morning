import "server-only";

import { createHash } from "node:crypto";
import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { syncProvider } from "@/lib/imports/syncProvider";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildHydraReportUserPrompt,
  hydraReportOutputSchema,
} from "@/lib/llm/prompts/hydraReport";
import { getConnections } from "@/services/connections";
import { getSourceItems } from "@/services/sourceItems";
import { getTodayQueue } from "@/services/workTasks";
import { getUserProfile } from "@/services/userProfile";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import {
  buildDeterministicHydraReport,
  detectHydraConflicts,
  reportCitationCoverage,
  scoreHydraEvidence,
} from "./decisionEngine";
import {
  createDelivery,
  createEvidenceRelation,
  ensureHydraSetup,
  getHydraEvidence,
  getHydraReportByRunId,
  getHydraRun,
  replaceHydraEvidence,
  saveHydraReport,
  saveSourceDocument,
  updateHydraEvidenceScore,
  updateHydraRun,
  upsertSyncCursor,
  writeAuditLog,
  type HydraEvidence,
} from "@/services/hydra";
import {
  hydraReportSchema,
  type HydraReport,
  type SourceStatus,
} from "@/domain/hydraReport";

const HYDRA_PROVIDERS: ConnectionProvider[] = [
  "granola",
  "calendar",
  "gmail",
  "drive",
  "jira",
  "confluence",
  "figma",
];
const HYDRA_SOURCE_TYPES = new Set([
  "manual_transcript",
  "gmail",
  "drive",
  "calendar",
  "jira",
  "confluence",
  "granola",
  "figma",
]);
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 15_000;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSource(sourceType: string) {
  if (sourceType === "gmail" || sourceType === "drive") return "drive";
  if (sourceType === "manual_transcript") return "granola";
  return sourceType;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function metadataString(metadata: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function withConnectorRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Connector timed out after ${FETCH_TIMEOUT_MS / 1000}s.`)), FETCH_TIMEOUT_MS)
        ),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

function connectionCapabilities(provider: ConnectionProvider, metadata: Record<string, unknown> | null) {
  const base: Record<string, boolean> = { read: true, incremental: true };
  if (provider === "granola") {
    base.notes = metadata?.notes !== false;
    base.transcripts = metadata?.transcripts !== false;
    base.history = metadata?.history !== false;
  }
  if (provider === "figma") {
    base.nodeRead = true;
    base.variables = metadata?.variables === true;
  }
  return base;
}

async function fetchHydraSources(reportTaskId: number): Promise<SourceStatus[]> {
  const connections = await getConnections();
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  return Promise.all(
    HYDRA_PROVIDERS.map(async (provider): Promise<SourceStatus> => {
      const connection = byProvider.get(provider);
      const checkedAt = new Date().toISOString();
      const providerLabel = provider === "gmail" ? "drive" : provider;
      const metadata = connection?.metadata ?? null;
      const lastSuccessfulSyncAt = metadataString(metadata, "lastSync");
      const tokenExpiresAt = metadataString(metadata, "tokenExpiresAt", "expiresAt");
      if (tokenExpiresAt && new Date(tokenExpiresAt).getTime() <= Date.now()) {
        return {
          provider: providerLabel,
          status: "expired",
          lastSuccessfulSyncAt,
          checkedAt,
          capabilities: connectionCapabilities(provider, metadata),
          warnings: [`${providerLabel} authorization expired and must be reconnected.`],
        };
      }
      if (!connection || connection.status !== "connected") {
        return {
          provider: providerLabel,
          status: connection?.status === "error" ? "error" : "not_connected",
          lastSuccessfulSyncAt,
          checkedAt,
          capabilities: connectionCapabilities(provider, metadata),
          warnings: [
            connection?.status === "error"
              ? `${providerLabel} connection is in an error state.`
              : `${providerLabel} is not connected and was not checked.`,
          ],
        };
      }

      const started = Date.now();
      try {
        const outcome = await withConnectorRetry(() => syncProvider(provider));
        if (!outcome.ok) throw new Error(outcome.error);
        const successfulAt = new Date().toISOString();
        upsertSyncCursor({
          reportTaskId,
          provider: providerLabel,
          cursor: successfulAt,
          lastSuccessfulSyncAt: successfulAt,
        });
        return {
          provider: providerLabel,
          status: outcome.result.errors.length > 0 ? "degraded" : "connected",
          lastSuccessfulSyncAt: successfulAt,
          checkedAt,
          latencyMs: Date.now() - started,
          imported: outcome.result.imported,
          skipped: outcome.result.skipped,
          capabilities: connectionCapabilities(provider, metadata),
          warnings: outcome.result.errors.slice(0, 5),
        };
      } catch (error) {
        return {
          provider: providerLabel,
          status: "error",
          lastSuccessfulSyncAt,
          checkedAt,
          latencyMs: Date.now() - started,
          capabilities: connectionCapabilities(provider, metadata),
          warnings: [error instanceof Error ? error.message : `${providerLabel} fetch failed.`],
        };
      }
    })
  );
}

async function normalizeEvidence(runId: number, projectId: number | null) {
  const allSources = await getSourceItems();
  const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;
  const candidates = allSources.filter((source) => {
    if (!HYDRA_SOURCE_TYPES.has(source.sourceType)) return false;
    if (projectId != null && source.projectId === projectId) return true;
    if (source.sourceType === "jira" && /^UATL-/i.test(source.sourceExternalId ?? source.title)) return true;
    const date = new Date(source.sourceDate).getTime();
    return Number.isFinite(date) && date >= cutoff;
  });

  const seen = new Set<string>();
  const normalized: Omit<import("@/services/hydra").HydraEvidence, "id" | "runId" | "createdAt">[] = [];
  for (const source of candidates) {
    const version = metadataString(source.metadata, "version", "updatedAt", "lastModified");
    const contentHash = sha256(`${source.title}\n${source.body}`);
    const fingerprint = `${source.sourceType}:${source.sourceExternalId ?? source.id}:${version ?? contentHash}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const fetchedAt = new Date().toISOString();
    await saveSourceDocument({
      sourceItemId: source.id,
      provider: canonicalSource(source.sourceType),
      externalId: source.sourceExternalId ?? String(source.id),
      version,
      contentHash,
      sourceUpdatedAt: metadataString(source.metadata, "updatedAt", "lastModified"),
      fetchedAt,
      metadata: source.metadata ?? {},
    });
    normalized.push({
      sourceItemId: source.id,
      source: canonicalSource(source.sourceType),
      sourceType: metadataString(source.metadata, "sourceType", "type") ?? source.sourceType,
      externalId: source.sourceExternalId ?? String(source.id),
      version,
      occurredAt: source.sourceDate,
      sourceUpdatedAt: metadataString(source.metadata, "updatedAt", "lastModified"),
      fetchedAt,
      author: source.author,
      participants: stringArray(source.metadata?.participants ?? source.metadata?.attendees),
      title: source.title,
      content: source.body,
      url: source.url,
      contentHash,
      score: 0,
      scoreReasons: [],
      metadata: source.metadata ?? {},
    });
  }

  return await replaceHydraEvidence(runId, normalized);
}

function collectReportUrls(report: HydraReport): string[] {
  return [
    ...report.todayFirst.sourceUrls,
    ...report.afterThat.flatMap((item) => item.sourceUrls),
    ...report.directInstructions.map((item) => item.sourceUrl).filter((url): url is string => Boolean(url)),
    ...report.jiraState.map((item) => item.url).filter((url): url is string => Boolean(url)),
    ...(report.figmaAudit ? [report.figmaAudit.nodeUrl] : []),
  ];
}

function urlsFromEvidence(item: HydraEvidence) {
  const embedded = item.content.match(/https?:\/\/[^\s<>()\]]+/g) ?? [];
  return [item.url, ...embedded].filter((url): url is string => Boolean(url));
}

function validateReportAgainstEvidence(input: {
  report: HydraReport;
  evidence: HydraEvidence[];
  deterministic: HydraReport;
}): { ok: true; report: HydraReport; coverage: number } | { ok: false; error: string } {
  const schemaResult = hydraReportSchema.safeParse(input.report);
  if (!schemaResult.success) return { ok: false, error: schemaResult.error.message };
  const evidenceIds = new Set(input.evidence.map((item) => `ev_${item.id}`));
  const allowedUrls = new Set(input.evidence.flatMap(urlsFromEvidence));
  const coverage = reportCitationCoverage(schemaResult.data, evidenceIds);
  if (coverage < 1) return { ok: false, error: "At least one report item references evidence outside this run." };
  if (collectReportUrls(schemaResult.data).some((url) => !allowedUrls.has(url))) {
    return { ok: false, error: "At least one report URL does not come from the immutable evidence snapshot." };
  }
  if (
    !schemaResult.data.todayFirst.evidenceIds.some((id) =>
      input.deterministic.todayFirst.evidenceIds.includes(id)
    )
  ) {
    return { ok: false, error: "The model changed the deterministic Today first priority." };
  }
  if (schemaResult.data.figmaAudit && !parseFigmaUrl(schemaResult.data.figmaAudit.nodeUrl)?.nodeId) {
    return { ok: false, error: "Figma audit requires a valid node-specific URL." };
  }
  return { ok: true, report: schemaResult.data, coverage };
}

function renderReportText(report: HydraReport) {
  const lines = [
    `TODAY FIRST\n${report.todayFirst.title}\nWhy: ${report.todayFirst.reason}\nNext: ${report.todayFirst.nextStep}\nDone when: ${report.todayFirst.doneWhen}`,
    report.afterThat.length > 0
      ? `AFTER THAT\n${report.afterThat.map((item, index) => `${index + 1}. ${item.title}`).join("\n")}`
      : null,
    report.directInstructions.length > 0
      ? `DIRECTLY TOLD TO YOU\n${report.directInstructions.map((item) => `- ${item.author}: ${item.instruction}`).join("\n")}`
      : null,
    report.blockers.length > 0
      ? `BLOCKED / WAITING\n${report.blockers.map((item) => `- ${item.title}: ${item.question}`).join("\n")}`
      : null,
    report.jiraState.length > 0
      ? `JIRA STATE\n${report.jiraState.map((item) => `- ${item.key} · ${item.status} · ${item.title}`).join("\n")}`
      : null,
    report.suggestedMessage ? `SUGGESTED MESSAGE\n${report.suggestedMessage}` : null,
  ];
  return lines.filter(Boolean).join("\n\n");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] ?? char);
}

async function deliverReport(input: {
  reportId: number;
  report: HydraReport;
  deliverySettings: { inApp: boolean; email: boolean; push: boolean };
}) {
  const outcomes: string[] = [];
  await createDelivery({
    reportId: input.reportId,
    channel: "in_app",
    status: "delivered",
    attempts: 1,
    providerResponse: "Report persisted and available in the app.",
    lastAttemptAt: new Date().toISOString(),
  });
  outcomes.push("in_app:delivered");

  if (input.deliverySettings.email) {
    const profile = await getUserProfile();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.REPORT_EMAIL_FROM?.trim();
    if (!apiKey || !from || !profile?.email) {
      await createDelivery({
        reportId: input.reportId,
        channel: "email",
        status: "skipped",
        attempts: 0,
        providerResponse: "Configure RESEND_API_KEY, REPORT_EMAIL_FROM, and profile email.",
      });
      outcomes.push("email:skipped");
    } else {
      let delivered = false;
      let responseMessage = "Email delivery failed.";
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from,
              to: [profile.email],
              subject: `Hydra report · ${input.report.todayFirst.title}`,
              html: `<pre style="white-space:pre-wrap;font:14px/1.6 system-ui">${escapeHtml(renderReportText(input.report))}</pre>`,
            }),
          });
          const body = await response.text();
          responseMessage = body.slice(0, 1000);
          if (response.ok) {
            delivered = true;
            await createDelivery({
              reportId: input.reportId,
              channel: "email",
              status: "delivered",
              attempts: attempt,
              providerResponse: responseMessage,
              lastAttemptAt: new Date().toISOString(),
            });
            break;
          }
        } catch (error) {
          responseMessage = error instanceof Error ? error.message : "Email delivery failed.";
        }
      }
      if (!delivered) {
        await createDelivery({
          reportId: input.reportId,
          channel: "email",
          status: "failed",
          attempts: 5,
          providerResponse: responseMessage,
          lastAttemptAt: new Date().toISOString(),
        });
      }
      outcomes.push(`email:${delivered ? "delivered" : "failed"}`);
    }
  }

  if (input.deliverySettings.push) {
    await createDelivery({
      reportId: input.reportId,
      channel: "web_push",
      status: "ready",
      attempts: 0,
      providerResponse: "Browser notification is dispatched when the report client receives completion.",
    });
    outcomes.push("web_push:ready");
  }
  return outcomes;
}

function terminal(status: string) {
  return ["completed", "partial", "failed", "cancelled"].includes(status);
}

export async function executeHydraRun(runId: number) {
  const existing = await getHydraRun(runId);
  if (!existing) throw new Error("Hydra run was not found.");
  if (terminal(existing.status)) {
    return { run: existing, report: await getHydraReportByRunId(runId) };
  }

  const setup = await ensureHydraSetup();
  const timings: Record<string, number> = {};
  const phase = async <T>(status: typeof existing.status, operation: () => Promise<T>) => {
    if ((await getHydraRun(runId))?.status === "cancelled") throw new Error("HYDRA_RUN_CANCELLED");
    const started = Date.now();
    await updateHydraRun(runId, {
      status,
      ...(status === "fetching_sources" ? { startedAt: new Date().toISOString() } : {}),
      timings: { ...timings },
    });
    const result = await operation();
    timings[status] = Date.now() - started;
    await updateHydraRun(runId, { timings: { ...timings } });
    return result;
  };

  try {
    const sourceStatus = await phase("fetching_sources", () => fetchHydraSources(setup.task.id));
    const warnings = sourceStatus.flatMap((entry) => entry.warnings.map((warning) => `${entry.provider}: ${warning}`));
    await updateHydraRun(runId, { sourceHealth: sourceStatus, warnings });

    let evidence = await phase("normalizing", () => normalizeEvidence(runId, setup.task.projectId));
    const profile = await getUserProfile();
    const stakeholders = Array.isArray(setup.task.config?.stakeholders)
      ? setup.task.config.stakeholders.filter((value): value is string => typeof value === "string")
      : ["Matt", "Lucas"];
    await phase("ranking", async () => {
      for (const item of evidence) {
        const scored = scoreHydraEvidence({
          item,
          currentUserName: profile?.name ?? "Milos Dostanic",
          stakeholders,
        });
        await updateHydraEvidenceScore(item.id, scored.score, scored.reasons);
      }
    });
    evidence = await getHydraEvidence(runId);
    const conflicts = detectHydraConflicts(evidence);
    for (const conflict of conflicts) {
      await createEvidenceRelation({
        runId,
        fromEvidenceId: conflict.winningEvidenceId,
        toEvidenceId: conflict.losingEvidenceId,
        relation: "conflicts_with",
        reason: conflict.reason,
      });
    }
    await updateHydraRun(runId, { evidenceCount: evidence.length });

    const queue = await getTodayQueue();
    const tasks = OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]);
    const deterministic = buildDeterministicHydraReport({
      evidence,
      tasks,
      conflicts,
      sourceStatus,
      configVersion: setup.task.configVersion,
      promptVersion: setup.task.promptVersion,
    });

    const llmResult = await phase("generating", () =>
      runLlmJob({
        jobType: "hydra_report",
        userPrompt: buildHydraReportUserPrompt({
          deterministicDraft: deterministic,
          evidence: evidence.slice(0, 80).map((item) => ({
            id: `ev_${item.id}`,
            source: item.source,
            sourceType: item.sourceType,
            externalId: item.externalId,
            occurredAt: item.occurredAt,
            author: item.author,
            title: item.title,
            content: item.content.slice(0, 1600),
            url: item.url,
            score: item.score,
            scoreReasons: item.scoreReasons,
          })),
          conflicts,
          missingSourceWarnings: warnings,
        }),
        schema: hydraReportOutputSchema,
        temperature: 0.1,
      })
    );

    const validated = await phase("validating", async () => {
      const candidate: HydraReport = llmResult.ok
        ? {
            ...llmResult.data,
            runSummary: deterministic.runSummary,
          }
        : deterministic;
      const check = validateReportAgainstEvidence({ report: candidate, evidence, deterministic });
      if (check.ok) return check;
      const fallback = validateReportAgainstEvidence({ report: deterministic, evidence, deterministic });
      if (!fallback.ok) throw new Error(`Report validation failed: ${fallback.error}`);
      warnings.push(`AI draft rejected by validator: ${check.error}`);
      return fallback;
    });

    const storedReport = await saveHydraReport({
      runId,
      report: validated.report,
      renderedText: renderReportText(validated.report),
      citationCoverage: validated.coverage,
    });
    const deliveryOutcomes = await phase("delivering", () =>
      deliverReport({
        reportId: storedReport.id,
        report: validated.report,
        deliverySettings: setup.task.deliverySettings,
      })
    );

    const partial = sourceStatus.some((entry) => entry.status !== "connected");
    const completedAt = new Date().toISOString();
    const run = await updateHydraRun(runId, {
      status: partial ? "partial" : "completed",
      completedAt,
      warnings,
      sourceHealth: sourceStatus,
      evidenceCount: evidence.length,
      timings,
      ...(llmResult.ok
        ? { modelProvider: llmResult.provider, modelName: llmResult.model }
        : { modelProvider: "deterministic", modelName: "hydra-fallback-v1" }),
    });
    await writeAuditLog({
      workspaceId: setup.workspace.id,
      action: `report_run.${partial ? "partial" : "completed"}`,
      entityType: "report_run",
      entityId: runId,
      metadata: {
        evidenceCount: evidence.length,
        citationCoverage: validated.coverage,
        sourceStatus: sourceStatus.map((entry) => ({ provider: entry.provider, status: entry.status })),
        deliveryOutcomes,
      },
    });
    return { run, report: storedReport };
  } catch (error) {
    if ((await getHydraRun(runId))?.status === "cancelled" || (error instanceof Error && error.message === "HYDRA_RUN_CANCELLED")) {
      return { run: await getHydraRun(runId), report: null };
    }
    const message = error instanceof Error ? error.message : "Hydra report run failed.";
    const run = await updateHydraRun(runId, {
      status: "failed",
      error: message,
      timings,
      completedAt: new Date().toISOString(),
    });
    await writeAuditLog({
      workspaceId: setup.workspace.id,
      action: "report_run.failed",
      entityType: "report_run",
      entityId: runId,
      metadata: { error: message },
    });
    return { run, report: null };
  }
}
