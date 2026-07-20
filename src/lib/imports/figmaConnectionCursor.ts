import type { ConnectionCursorKey } from "@/domain/connectionCursor";
import {
  buildCursorAdvanceFromSync,
  connectionCursorKey,
  DEFAULT_INITIAL_LOOKBACK_MS,
  DEFAULT_OVERLAP_MS,
  maxIsoTimestamp,
  resolveIncrementalSinceIso,
  resourceScopeKey,
} from "./connectionCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export const FIGMA_FILE_CURSOR_TYPE = "figma_file";

export function figmaFileCursorKey(connectionId: number, fileKey: string): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "figma",
    scopeType: "resource",
    scopeKey: resourceScopeKey(fileKey),
    cursorType: FIGMA_FILE_CURSOR_TYPE,
  });
}

export async function loadFigmaFileSinceIso(
  connectionId: number,
  fileKey: string
): Promise<string> {
  const cursor = await getConnectionCursor(figmaFileCursorKey(connectionId, fileKey));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return window.sinceIso;
}

export async function commitFigmaFileCursorOnSuccess(input: {
  connectionId: number;
  fileKey: string;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = figmaFileCursorKey(input.connectionId, input.fileKey);
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
