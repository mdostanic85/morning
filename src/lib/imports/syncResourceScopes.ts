import "server-only";

import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import type { ConnectorSyncResult } from "@/lib/connectors/types";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { importConnectorSources } from "./sourceImportPipeline";
import { getConnectionByProvider, upsertConnection } from "@/services/connections";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";
import type { ProviderSyncOutcome } from "./syncProvider";

export async function finalizeProviderSyncSuccess(input: {
  provider: ConnectionProvider;
  candidates: ConnectorSourceCandidate[];
  importResult: ConnectorSyncResult;
  commitCursor?: () => Promise<void>;
}): Promise<ProviderSyncOutcome> {
  const existing = await getConnectionByProvider(input.provider);
  await upsertConnection({
    provider: input.provider,
    authType: existing?.authType ?? "none",
    status: existing?.status ?? "connected",
    scopes: existing?.scopes ?? [],
    metadata: {
      ...(existing?.metadata ?? {}),
      lastSync: new Date().toISOString(),
      lastSyncImported: input.importResult.imported,
      lastSyncSkipped: input.importResult.skipped,
      lastSyncErrors: input.importResult.errors,
    },
  });
  if (input.commitCursor) {
    await input.commitCursor();
  }
  return {
    ok: true,
    provider: input.provider,
    result: input.importResult,
    itemsFetched: input.candidates.length,
  };
}

export async function mergeImportResults(
  results: ConnectorSyncResult[]
): Promise<ConnectorSyncResult> {
  const merged: ConnectorSyncResult = {
    ok: true,
    imported: 0,
    skipped: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsFailed: 0,
    tasksExtracted: 0,
    errors: [],
    importedItems: [],
    extractedTasks: [],
    knowledgeExtracted: [],
  };
  for (const result of results) {
    merged.imported += result.imported;
    merged.skipped += result.skipped;
    merged.itemsCreated += result.itemsCreated;
    merged.itemsUpdated += result.itemsUpdated;
    merged.itemsUnchanged += result.itemsUnchanged;
    merged.itemsFailed += result.itemsFailed;
    merged.tasksExtracted += result.tasksExtracted;
    merged.errors.push(...result.errors);
    merged.importedItems.push(...result.importedItems);
    merged.extractedTasks.push(...result.extractedTasks);
    merged.knowledgeExtracted.push(...result.knowledgeExtracted);
    if (!result.ok) merged.ok = false;
  }
  return merged;
}

export async function syncResourceScopes(input: {
  provider: ConnectionProvider;
  shouldCancel?: ShouldCancelSync;
  scopes: Array<{
    label: string;
    fetch: () => Promise<ConnectorSourceCandidate[]>;
    commit: (candidates: ConnectorSourceCandidate[]) => Promise<void>;
  }>;
}): Promise<ProviderSyncOutcome> {
  const importResults: ConnectorSyncResult[] = [];
  const allCandidates: ConnectorSourceCandidate[] = [];
  const errors: string[] = [];

  for (const scope of input.scopes) {
    if (input.shouldCancel && (await input.shouldCancel())) {
      return {
        ok: false,
        provider: input.provider,
        cancelled: true,
        error: "Sync cancelled.",
        partialResult: await mergeImportResults(importResults),
        partialMetrics: {
          itemsFetched: allCandidates.length,
          itemsCreated: importResults.reduce((sum, entry) => sum + entry.itemsCreated, 0),
          itemsUpdated: importResults.reduce((sum, entry) => sum + entry.itemsUpdated, 0),
          itemsUnchanged: importResults.reduce((sum, entry) => sum + entry.itemsUnchanged, 0),
          itemsFailed: importResults.reduce((sum, entry) => sum + entry.itemsFailed, 0),
        },
        itemsFetched: allCandidates.length,
      };
    }

    try {
      const candidates = await scope.fetch();
      const importResult = await importConnectorSources(candidates, {
        shouldCancel: input.shouldCancel,
      });
      importResults.push(importResult);
      allCandidates.push(...candidates);

      if (importResult.itemsFailed > 0) {
        errors.push(`${scope.label}: ${importResult.itemsFailed} item(s) failed to persist.`);
        continue;
      }
      if (input.shouldCancel && (await input.shouldCancel())) {
        continue;
      }
      await scope.commit(candidates);
    } catch (error) {
      errors.push(
        `${scope.label}: ${error instanceof Error ? error.message : "sync failed."}`
      );
    }
  }

  const merged = await mergeImportResults(importResults);
  if (errors.length > 0) merged.errors.push(...errors);

  return finalizeProviderSyncSuccess({
    provider: input.provider,
    candidates: allCandidates,
    importResult: merged,
  });
}
