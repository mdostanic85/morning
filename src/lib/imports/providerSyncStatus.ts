import type { ConnectorSyncResult } from "@/lib/connectors/types";

/**
 * WL-01/WL-02 gate: true only when every item persisted AND every
 * extraction/knowledge/embedding step succeeded. Previously `syncProvider.ts`
 * reported `{ ok: true }` whenever no exception was thrown, ignoring
 * `importResult.ok`/`itemsFailed` entirely, and extraction/embedding
 * failures never even touched `itemsFailed` — this is the single source of
 * truth both the provider-status report (WL-01) and the cursor-commit gate
 * (WL-02) must use so they can never disagree.
 *
 * Deliberately dependency-free (no `server-only`) so the decision logic is
 * unit-testable without a database.
 */
export function isProviderSyncFullyOk(result: ConnectorSyncResult): boolean {
  return result.ok && result.itemsFailed === 0 && result.itemsExtractionFailed === 0;
}
