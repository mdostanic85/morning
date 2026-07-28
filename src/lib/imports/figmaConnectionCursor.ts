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

// ---- Per-file comment cursor ----
// Comments use a separate cursor keyed on the comment creation timestamp so
// the file-structure cursor (based on file lastModified) advances independently.

export const FIGMA_COMMENTS_CURSOR_TYPE = "figma_comments";

export function figmaCommentsCursorKey(
  connectionId: number,
  fileKey: string
): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "figma",
    scopeType: "resource",
    scopeKey: resourceScopeKey(`${fileKey}:comments`),
    cursorType: FIGMA_COMMENTS_CURSOR_TYPE,
  });
}

export async function loadFigmaCommentsSinceIso(
  connectionId: number,
  fileKey: string
): Promise<string> {
  const cursor = await getConnectionCursor(figmaCommentsCursorKey(connectionId, fileKey));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    // 14-day initial lookback for comments — shorter than file structure to
    // avoid flooding on first connect.
    initialLookbackMs: 14 * 24 * 60 * 60 * 1000,
  });
  return window.sinceIso;
}

export async function commitFigmaCommentsCursorOnSuccess(input: {
  connectionId: number;
  fileKey: string;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = figmaCommentsCursorKey(input.connectionId, input.fileKey);
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
