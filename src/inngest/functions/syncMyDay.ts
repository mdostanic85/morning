import { inngest } from "../client";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { syncProvider } from "@/lib/imports/syncProvider";
import { CONNECTION_PROVIDERS } from "@/lib/connectors/providers";
import { discoverProjectsFromSignals } from "@/lib/projects/discoverer";
import { approveAllPendingExtractions } from "@/lib/tasks/approvePending";
import { backfillUnextractedSources } from "@/lib/imports/backfillExtractions";
import { fetchJiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import { buildTodayBriefing } from "@/lib/tasks/todayBriefing";
import { buildDailyBriefV2 } from "@/lib/dailyBrief/buildDailyBrief";
import { rebuildTodayQueue } from "@/lib/tasks/prioritizer";
import { detectJiraDoneNotifications } from "@/lib/imports/jiraDoneNotifications";
import { importLinkedJiraEvidence } from "@/lib/imports/linkedJiraImport";
import { buildSyncWhatsNew } from "@/lib/imports/syncWhatsNew";
import type { ImportedSourceItem, SyncKnowledgeItem } from "@/lib/connectors/types";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { isSyncRunCancellationRequested } from "@/lib/imports/syncCancellation";
import {
  deriveSyncRunCompletionStatus,
  failurePhaseFromError,
  failurePhaseFromStepId,
  rebuildDiagnosticsFromResult,
  retryTerminalSyncFailureFinalization,
  runSyncPhase,
} from "@/lib/imports/syncRunCompletion";
import {
  cancelSyncProviderRun,
  completeSyncProviderRun,
  failSyncProviderRun,
  finalizeCancelledSyncRun,
  finalizeFailedSyncRun,
  finalizeSyncRun,
  partialSyncProviderRun,
  startSyncProviderRun,
} from "@/services/syncRuns";
import type { SyncProviderRunMetrics } from "@/domain/syncRun";
import {
  isSyncMyDayProvider,
  SYNC_PROVIDER_WAVES,
} from "@/lib/tasks/sourceAuthority";
import { runTodayFigmaTaskAudits } from "@/lib/tasks/figmaTaskAudit";

async function finalizeIfCancelled(
  syncRunId: number,
  message: string
): Promise<boolean> {
  if (!(await isSyncRunCancellationRequested(syncRunId))) return false;
  await finalizeCancelledSyncRun(syncRunId, message);
  return true;
}

export const syncMyDay = inngest.createFunction(
  {
    id: "sync-my-day",
    name: "Sync My Day",
    triggers: [{ event: "worklight/sync.requested" }],
    onFailure: async ({ event, error }) => {
      const originalData = event.data.event.data as { syncRunId?: unknown };
      const syncRunId = Number(originalData?.syncRunId);
      if (!Number.isFinite(syncRunId)) return;

      const phase = failurePhaseFromError(error);
      await retryTerminalSyncFailureFinalization(() =>
        finalizeFailedSyncRun({
          id: syncRunId,
          phase,
        })
      );
    },
  },
  async ({ event, step }) => {
    const syncRunId = Number(event.data.syncRunId);
    if (!Number.isFinite(syncRunId)) {
      throw new Error("worklight/sync.requested requires syncRunId.");
    }
    const runStep = <T>(id: string, operation: () => T | Promise<T>) =>
      step.run(id, () =>
        runSyncPhase(failurePhaseFromStepId(id), operation)
      );

    if (
      await runStep("check-cancelled", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before processing started. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    await runStep("approve-pending", () => approveAllPendingExtractions());

    const connectedProviders = await runStep("resolve-connected-providers", async () => {
      const connections = await getConnections();
      return CONNECTION_PROVIDERS.filter(
        (provider) =>
          isSyncMyDayProvider(provider) &&
          connections.some(
            (connection) => connection.provider === provider && connection.status === "connected"
          )
      ) as ConnectionProvider[];
    });

    let projectDiscovery = await runStep("discover-projects", () =>
      discoverProjectsFromSignals(connectedProviders)
    );

    if (
      await runSyncPhase("check-cancelled", () =>
        isSyncRunCancellationRequested(syncRunId)
      )
    ) {
      await runStep("finalize-cancelled-before-providers", async () => {
        await finalizeCancelledSyncRun(
          syncRunId,
          "Sync cancelled before provider execution. Source data already synced is preserved."
        );
      });
      return { syncRunId, status: "cancelled" as const };
    }

    // Ordered waves: Confluence/PRD base → Jira → transcripts (Granola/Gemini) → rest.
    // Within a wave, connected providers still run in parallel.
    const connectedSet = new Set(connectedProviders);
    const wavedProviders = SYNC_PROVIDER_WAVES.flatMap((wave) =>
      wave.filter((provider) => connectedSet.has(provider))
    );
    const unorderedProviders = connectedProviders.filter(
      (provider) => !wavedProviders.includes(provider)
    );
    const providerOrder = [...wavedProviders, ...unorderedProviders];

    type ProviderResult = {
      provider: ConnectionProvider;
      ok: boolean;
      imported: number;
      skipped: number;
      tasksExtracted: number;
      knowledgeExtracted: number;
      importedItems: ImportedSourceItem[];
      knowledgeItems: SyncKnowledgeItem[];
      error: string | null;
      cancelled: boolean;
    };

    const providerResults: ProviderResult[] = [];

    for (const wave of [...SYNC_PROVIDER_WAVES, unorderedProviders]) {
      const waveProviders = wave.filter((provider) => connectedSet.has(provider));
      if (waveProviders.length === 0) continue;

      if (
        await runSyncPhase("check-cancelled", () =>
          isSyncRunCancellationRequested(syncRunId)
        )
      ) {
        break;
      }

      const waveResults = await Promise.all(
        waveProviders.map((provider) =>
          runStep(`sync-provider-${provider}`, async () => {
            if (await isSyncRunCancellationRequested(syncRunId)) {
              return {
                provider,
                ok: false,
                imported: 0,
                skipped: 0,
                tasksExtracted: 0,
                knowledgeExtracted: 0,
                importedItems: [] as ImportedSourceItem[],
                knowledgeItems: [] as SyncKnowledgeItem[],
                error: "Sync cancelled.",
                cancelled: true,
              };
            }

            const providerRun = await startSyncProviderRun({ syncRunId, provider });
            const outcome = await syncProvider(provider, { syncRunId });

            if (outcome.cancelled) {
              // WL-01: a cancellation must never record "completed", even
              // when partial metrics are available — the run stays
              // cancelled, with those metrics preserved on the row.
              await cancelSyncProviderRun(
                providerRun.id,
                outcome.partialMetrics
                  ? { ...outcome.partialMetrics, itemsExtractionFailed: outcome.partialResult?.itemsExtractionFailed ?? 0 }
                  : undefined
              );
              return {
                provider,
                ok: false,
                imported: outcome.partialResult?.imported ?? 0,
                skipped: outcome.partialResult?.skipped ?? 0,
                tasksExtracted: outcome.partialResult?.tasksExtracted ?? 0,
                knowledgeExtracted: outcome.partialResult?.knowledgeExtracted.length ?? 0,
                importedItems: outcome.partialResult?.importedItems ?? [],
                knowledgeItems: outcome.partialResult?.knowledgeExtracted ?? [],
                error: outcome.error,
                cancelled: true,
              };
            }

            if (outcome.ok) {
              const metrics: SyncProviderRunMetrics = {
                itemsFetched: outcome.itemsFetched,
                itemsCreated: outcome.result.itemsCreated,
                itemsUpdated: outcome.result.itemsUpdated,
                itemsUnchanged: outcome.result.itemsUnchanged,
                itemsFailed: outcome.result.itemsFailed,
                itemsExtractionFailed: outcome.result.itemsExtractionFailed,
              };
              await completeSyncProviderRun(providerRun.id, metrics);
              return {
                provider,
                ok: true,
                imported: outcome.result.imported,
                skipped: outcome.result.skipped,
                tasksExtracted: outcome.result.tasksExtracted,
                knowledgeExtracted: outcome.result.knowledgeExtracted.length,
                importedItems: outcome.result.importedItems,
                knowledgeItems: outcome.result.knowledgeExtracted,
                error: outcome.result.errors[0] ?? null,
                cancelled: false,
              };
            }

            if (outcome.partial) {
              // WL-01: ran without throwing, but items failed to persist or
              // to extract — must not be recorded as completed.
              const metrics: SyncProviderRunMetrics = {
                itemsFetched: outcome.itemsFetched,
                itemsCreated: outcome.result.itemsCreated,
                itemsUpdated: outcome.result.itemsUpdated,
                itemsUnchanged: outcome.result.itemsUnchanged,
                itemsFailed: outcome.result.itemsFailed,
                itemsExtractionFailed: outcome.result.itemsExtractionFailed,
              };
              await partialSyncProviderRun(providerRun.id, {
                metrics,
                errorMessage: outcome.error,
              });
              return {
                provider,
                ok: false,
                imported: outcome.result.imported,
                skipped: outcome.result.skipped,
                tasksExtracted: outcome.result.tasksExtracted,
                knowledgeExtracted: outcome.result.knowledgeExtracted.length,
                importedItems: outcome.result.importedItems,
                knowledgeItems: outcome.result.knowledgeExtracted,
                error: outcome.error,
                cancelled: false,
              };
            }

            await failSyncProviderRun(providerRun.id, {
              errorCode: outcome.configError ? "config_error" : "sync_error",
              errorMessage: outcome.error,
            });
            return {
              provider,
              ok: false,
              imported: 0,
              skipped: 0,
              tasksExtracted: 0,
              knowledgeExtracted: 0,
              importedItems: [] as ImportedSourceItem[],
              knowledgeItems: [] as SyncKnowledgeItem[],
              error: outcome.error,
              cancelled: false,
            };
          })
        )
      );

      providerResults.push(...waveResults);

      if (waveResults.some((entry) => entry.cancelled)) {
        break;
      }
    }

    // Preserve a stable provider order for status/reporting even if a wave aborted early.
    providerResults.sort(
      (a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider)
    );

    if (
      providerResults.some((entry) => entry.cancelled) ||
      (await runSyncPhase("check-cancelled", () =>
        isSyncRunCancellationRequested(syncRunId)
      ))
    ) {
      await runStep("finalize-cancelled-after-providers", async () => {
        await finalizeCancelledSyncRun(
          syncRunId,
          "Sync cancelled during provider sync. Source data already synced is preserved."
        );
      });
      return { syncRunId, status: "cancelled" as const };
    }

    const totalImported = providerResults.reduce((sum, entry) => sum + entry.imported, 0);

    const backfill = await runStep("backfill-sources", () =>
      backfillUnextractedSources({ syncRunId })
    );
    if ("cancelled" in backfill && backfill.cancelled) {
      await runStep("finalize-cancelled-after-backfill", async () => {
        await finalizeCancelledSyncRun(
          syncRunId,
          "Sync cancelled before AI extraction finished. Source data already synced is preserved."
        );
      });
      return { syncRunId, status: "cancelled" as const };
    }

    if (
      await runStep("check-cancelled-after-backfill", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before AI extraction finished. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    const jiraPending = await runStep("fetch-jira-pending", () => fetchJiraPendingSnapshot());

    if (
      await runStep("check-cancelled-before-rediscover", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before project rediscovery. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    if (totalImported > 0 && !connectedProviders.includes("jira")) {
      const afterImport = await runStep("rediscover-projects", () =>
        discoverProjectsFromSignals(connectedProviders)
      );
      projectDiscovery = {
        ...afterImport,
        created: projectDiscovery.created + afterImport.created,
        updated: projectDiscovery.updated + afterImport.updated,
        errors: [...projectDiscovery.errors, ...afterImport.errors],
        signalCount: Math.max(projectDiscovery.signalCount, afterImport.signalCount),
        ok: projectDiscovery.ok && afterImport.ok,
      };
    }

    if (
      await runStep("check-cancelled-before-rebuild", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before task reconciliation. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    await runStep("import-linked-jira", () => importLinkedJiraEvidence());

    const rebuild = await runStep("rebuild-queue", () =>
      rebuildTodayQueue({ jiraPending })
    );

    if (
      await runStep("check-cancelled-before-audits", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before artifact audits. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    const figmaAudits = await runStep("audit-today-figma-work", () =>
      runTodayFigmaTaskAudits()
    );

    const briefingResult = await runStep("build-briefing", () =>
      buildTodayBriefing({ jiraPending })
    );

    const dailyBriefResult = await runStep("build-daily-brief-v2", () =>
      buildDailyBriefV2({ jiraPending })
    );

    if (
      await runStep("check-cancelled-before-publication", () =>
        finalizeIfCancelled(
          syncRunId,
          "Sync cancelled before final publication. Source data already synced is preserved."
        )
      )
    ) {
      return { syncRunId, status: "cancelled" as const };
    }

    const postSyncHooks = await runStep("post-sync-hooks", async () => {
      const [jiraDone, profile] = await Promise.all([
        detectJiraDoneNotifications(),
        getUserProfile(),
      ]);
      return {
        jiraDone,
        myName: profile?.name ?? null,
        myEmail: profile?.email ?? null,
      };
    });

    const providerFailures = providerResults.filter((entry) => !entry.ok);
    const rebuildDiagnostics = rebuildDiagnosticsFromResult(rebuild);
    const errorParts: string[] = [];
    if (providerFailures.length > 0) {
      errorParts.push(
        `${providerFailures.length} provider(s) failed: ${providerFailures.map((entry) => entry.provider).join(", ")}`
      );
    }
    if (figmaAudits.errors.length > 0) {
      errorParts.push(`${figmaAudits.errors.length} Figma audit(s) failed.`);
    }
    if (!briefingResult.ok) errorParts.push(briefingResult.error ?? "Briefing failed.");
    if (!dailyBriefResult.ok) errorParts.push(dailyBriefResult.error ?? "Daily brief failed.");

    const status = deriveSyncRunCompletionStatus({
      failedProviderCount: providerFailures.length,
      briefingOk: briefingResult.ok && dailyBriefResult.ok,
    });

    const whatsNewPayload = buildSyncWhatsNew({
      providerResults: providerResults
        .filter((entry): entry is typeof entry & { ok: true } => entry.ok)
        .map((entry) => ({
          provider: entry.provider,
          importedItems: (entry.importedItems ?? []) as ImportedSourceItem[],
          knowledgeExtracted: (entry.knowledgeItems ?? []) as SyncKnowledgeItem[],
        })),
      jiraDone: postSyncHooks.jiraDone,
      myName: postSyncHooks.myName,
      myEmail: postSyncHooks.myEmail,
    });

    await runStep("finalize-sync-run", async () => {
      await finalizeSyncRun({
        id: syncRunId,
        status,
        errorSummary: errorParts.length > 0 ? errorParts.join(" ") : null,
        whatsNew: JSON.stringify(whatsNewPayload),
      });
    });

    return {
      syncRunId,
      status,
      imported: totalImported,
      providerCount: connectedProviders.length,
      failedProviders: providerFailures.length,
      projectDiscoveryOk: projectDiscovery.ok,
      backfillProcessed: "sourcesProcessed" in backfill ? backfill.sourcesProcessed : 0,
      rebuildOk: true,
      plannerSummaryCached: rebuildDiagnostics.length === 0,
      figmaAuditsCompleted: figmaAudits.completed,
      briefingOk: briefingResult.ok,
    };
  }
);
