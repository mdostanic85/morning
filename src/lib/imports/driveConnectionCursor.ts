import "server-only";

import type { ConnectionCursorKey } from "@/domain/connectionCursor";
import {
  buildCursorAdvanceFromSync,
  connectionCursorKey,
  DEFAULT_INITIAL_LOOKBACK_MS,
  DEFAULT_OVERLAP_MS,
  maxIsoTimestamp,
  providerScopeKey,
  resolveIncrementalSinceIso,
} from "./connectionCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export const DRIVE_GEMINI_NOTES_CURSOR_TYPE = "drive_gemini_notes";

export function driveProviderCursorKey(connectionId: number): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "drive",
    scopeType: "provider",
    scopeKey: providerScopeKey("drive"),
    cursorType: DRIVE_GEMINI_NOTES_CURSOR_TYPE,
  });
}

export async function loadDriveIncrementalSinceIso(connectionId: number): Promise<{
  modifiedAfterIso: string;
  isFirstSync: boolean;
}> {
  const cursor = await getConnectionCursor(driveProviderCursorKey(connectionId));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return { modifiedAfterIso: window.sinceIso, isFirstSync: window.isFirstSync };
}

export async function commitDriveConnectionCursorOnSuccess(input: {
  connectionId: number;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = driveProviderCursorKey(input.connectionId);
  const existing = await getConnectionCursor(key);
  const observed = maxIsoTimestamp(...input.candidates.map((candidate) => candidate.sourceDate));
  const advance = buildCursorAdvanceFromSync({
    existingLastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? null,
    observedLastSeenUpdatedAt: observed,
    overlapDurationMs: existing?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    syncedAt: input.syncedAt,
    cursorValue: observed ?? input.syncedAt,
    cursorValueType: "updated_since",
  });
  await commitConnectionCursorOnSuccess(key, advance);
}
