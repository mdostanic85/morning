import "server-only";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import type { ConnectorSyncResult } from "@/lib/connectors/types";
import { importConnectorSources } from "./sourceImportPipeline";
import { getConnectionByProvider, upsertConnection } from "@/services/connections";
import { getActiveProjects } from "@/services/projects";

export type ProviderSyncOutcome =
  | { ok: true; provider: ConnectionProvider; result: ConnectorSyncResult }
  | { ok: false; provider: ConnectionProvider; error: string; configError?: boolean };

/**
 * Read-only sync for one provider: fetch new external signals through the
 * connector registry, run them through the import pipeline (dedupe → project
 * match → index → extract), and record sync metadata on the connection row.
 */
export async function syncProvider(
  provider: ConnectionProvider,
  options: Record<string, unknown> = {}
): Promise<ProviderSyncOutcome> {
  const connector = CONNECTOR_REGISTRY[provider];
  const projects = await getActiveProjects();
  const context = { projects, options };

  const configError = await connector.configError(context);
  if (configError) {
    return { ok: false, provider, error: configError, configError: true };
  }

  try {
    const candidates = await connector.listItems(context);
    const importResult = await importConnectorSources(candidates);

    const existing = await getConnectionByProvider(provider);
    await upsertConnection({
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

    return { ok: true, provider, result: importResult };
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
