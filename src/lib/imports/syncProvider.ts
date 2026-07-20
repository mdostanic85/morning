import "server-only";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import type { ConnectorSyncResult } from "@/lib/connectors/types";
import { importConnectorSources } from "./sourceImportPipeline";
import { getConnectionByProvider, upsertConnection } from "@/services/connections";
import { getActiveProjects } from "@/services/projects";
import {
  isSyncRunCancellationRequested,
  shouldCancelFromSyncRunId,
  type ShouldCancelSync,
} from "@/lib/imports/syncCancellation";
import { commitGranolaConnectionCursorOnSuccess } from "@/lib/imports/granolaConnectionCursor";
import { commitJiraConnectionCursorOnSuccess } from "@/lib/imports/jiraConnectionCursor";
import {
  commitCalendarConnectionCursorOnSuccess,
  clearCalendarSyncToken,
} from "@/lib/imports/calendarConnectionCursor";
import { consumePendingCalendarSync } from "@/lib/imports/calendarSyncState";
import { commitGmailConnectionCursorOnSuccess } from "@/lib/imports/gmailConnectionCursor";
import { commitDriveConnectionCursorOnSuccess } from "@/lib/imports/driveConnectionCursor";
import { isMcpTransport } from "@/lib/connectors/transport";
import {
  syncConfluenceIncremental,
  syncDiscordIncremental,
  syncFigmaIncremental,
  syncGitHubIncremental,
} from "@/lib/imports/syncIncrementalProviders";
import type { SyncProviderRunMetrics } from "@/domain/syncRun";

export type ProviderSyncOutcome =
  | {
      ok: true;
      provider: ConnectionProvider;
      result: ConnectorSyncResult;
      itemsFetched: number;
      cancelled?: false;
    }
  | {
      ok: false;
      provider: ConnectionProvider;
      error: string;
      configError?: boolean;
      cancelled?: false;
    }
  | {
      ok: false;
      provider: ConnectionProvider;
      cancelled: true;
      error: string;
      partialResult?: ConnectorSyncResult;
      partialMetrics?: SyncProviderRunMetrics;
      itemsFetched?: number;
    };

/**
 * Read-only sync for one provider: fetch new external signals through the
 * connector registry, run them through the import pipeline (dedupe → project
 * match → index → extract), and record sync metadata on the connection row.
 */
export async function syncProvider(
  provider: ConnectionProvider,
  options: {
    syncRunId?: number;
    requestOptions?: Record<string, unknown>;
  } = {}
): Promise<ProviderSyncOutcome> {
  const shouldCancel: ShouldCancelSync | undefined = options.syncRunId
    ? shouldCancelFromSyncRunId(options.syncRunId)
    : undefined;

  if (shouldCancel && (await shouldCancel())) {
    return { ok: false, provider, cancelled: true, error: "Sync cancelled." };
  }

  const connector = CONNECTOR_REGISTRY[provider];
  const projects = await getActiveProjects();
  const context = {
    projects,
    options: options.requestOptions ?? {},
    shouldCancel,
  };

  const configError = await connector.configError(context);
  if (configError) {
    return { ok: false, provider, error: configError, configError: true };
  }

  try {
    if (options.syncRunId && (await shouldCancel?.())) {
      return { ok: false, provider, cancelled: true, error: "Sync cancelled." };
    }

    const existingConnection = await getConnectionByProvider(provider);
    const incrementalHandlers = {
      confluence: syncConfluenceIncremental,
      github: syncGitHubIncremental,
      figma: syncFigmaIncremental,
      discord: syncDiscordIncremental,
    } as const;
    const incrementalHandler =
      incrementalHandlers[provider as keyof typeof incrementalHandlers];
    if (
      incrementalHandler &&
      existingConnection &&
      !isMcpTransport(existingConnection)
    ) {
      return incrementalHandler(
        { projects, options: options.requestOptions ?? {}, shouldCancel },
        existingConnection.id,
        shouldCancel
      );
    }

    const candidates = await connector.listItems(context);
    const importResult = await importConnectorSources(candidates, { shouldCancel });

    if (shouldCancel && (await shouldCancel())) {
      const partialMetrics: SyncProviderRunMetrics = {
        itemsFetched: candidates.length,
        itemsCreated: importResult.itemsCreated,
        itemsUpdated: importResult.itemsUpdated,
        itemsUnchanged: importResult.itemsUnchanged,
        itemsFailed: importResult.itemsFailed,
      };
      return {
        ok: false,
        provider,
        cancelled: true,
        error: "Sync cancelled.",
        partialResult: importResult,
        partialMetrics,
        itemsFetched: candidates.length,
      };
    }

    const existing = await getConnectionByProvider(provider);
    const connection = await upsertConnection({
      provider,
      authType: existing?.authType ?? "none",
      status: existing?.status ?? "connected",
      scopes: existing?.scopes ?? [],
      metadata: {
        ...(existing?.metadata ?? {}),
        lastSync: new Date().toISOString(),
        lastSyncImported: importResult.imported,
        lastSyncSkipped: importResult.skipped,
        lastSyncErrors: importResult.errors,
      },
    });

    if (provider === "granola") {
      await commitGranolaConnectionCursorOnSuccess({
        connectionId: connection.id,
        candidates,
        syncedAt: new Date().toISOString(),
      });
    }
    if (provider === "jira") {
      await commitJiraConnectionCursorOnSuccess({
        connectionId: connection.id,
        candidates,
        syncedAt: new Date().toISOString(),
      });
    }
    if (provider === "calendar") {
      const pending = consumePendingCalendarSync();
      if (pending?.syncTokenExpired) {
        await clearCalendarSyncToken(connection.id);
      }
      await commitCalendarConnectionCursorOnSuccess({
        connectionId: connection.id,
        candidates,
        nextSyncToken: pending?.nextSyncToken ?? null,
        syncedAt: new Date().toISOString(),
      });
    }
    if (provider === "gmail") {
      await commitGmailConnectionCursorOnSuccess({
        connectionId: connection.id,
        candidates,
        syncedAt: new Date().toISOString(),
      });
    }
    if (provider === "drive") {
      await commitDriveConnectionCursorOnSuccess({
        connectionId: connection.id,
        candidates,
        syncedAt: new Date().toISOString(),
      });
    }

    return { ok: true, provider, result: importResult, itemsFetched: candidates.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    const existing = await getConnectionByProvider(provider);
    await upsertConnection({
      provider,
      authType: existing?.authType ?? "none",
      status: "error",
      scopes: existing?.scopes ?? [],
      metadata: {
        ...(existing?.metadata ?? {}),
        error: message,
        lastErrorAt: new Date().toISOString(),
      },
    });
    return { ok: false, provider, error: message };
  }
}

export async function syncProviderCancellationRequested(syncRunId: number): Promise<boolean> {
  return isSyncRunCancellationRequested(syncRunId);
}
