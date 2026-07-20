import "server-only";

import type { ConnectorSourceCandidate } from "@/lib/connectors/types";
import {
  buildCursorAdvanceFromSync,
  granolaProviderCursorKey,
  resolveIncrementalSinceIso,
  DEFAULT_INITIAL_LOOKBACK_MS,
  DEFAULT_OVERLAP_MS,
  maxIsoTimestamp,
} from "@/lib/imports/connectionCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";

export async function loadGranolaIncrementalSinceIso(
  connectionId: number
): Promise<{ createdAfterIso: string; isFirstSync: boolean }> {
  const cursor = await getConnectionCursor(granolaProviderCursorKey(connectionId));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return { createdAfterIso: window.sinceIso, isFirstSync: window.isFirstSync };
}

export function observedGranolaLastSeenUpdatedAt(
  candidates: ConnectorSourceCandidate[]
): string | null {
  return maxIsoTimestamp(...candidates.map((candidate) => candidate.sourceDate));
}

export async function commitGranolaConnectionCursorOnSuccess(input: {
  connectionId: number;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = granolaProviderCursorKey(input.connectionId);
  const existing = await getConnectionCursor(key);
  const observed = observedGranolaLastSeenUpdatedAt(input.candidates);
  const advance = buildCursorAdvanceFromSync({
    existingLastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? null,
    observedLastSeenUpdatedAt: observed,
    overlapDurationMs: existing?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    syncedAt: input.syncedAt,
    cursorValue: input.syncedAt,
    cursorValueType: "updated_since",
  });
  await commitConnectionCursorOnSuccess(key, advance);
}
