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

export const CONFLUENCE_SPACE_CURSOR_TYPE = "confluence_space";
export const CONFLUENCE_PAGE_CURSOR_TYPE = "confluence_page";

export function confluenceSpaceCursorKey(
  connectionId: number,
  spaceKey: string
): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "confluence",
    scopeType: "resource",
    scopeKey: resourceScopeKey(spaceKey),
    cursorType: CONFLUENCE_SPACE_CURSOR_TYPE,
  });
}

export function confluencePageCursorKey(
  connectionId: number,
  pageId: string
): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "confluence",
    scopeType: "resource",
    scopeKey: resourceScopeKey(pageId),
    cursorType: CONFLUENCE_PAGE_CURSOR_TYPE,
  });
}

export async function loadConfluenceResourceSinceIso(
  key: ConnectionCursorKey
): Promise<string> {
  const cursor = await getConnectionCursor(key);
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return window.sinceIso;
}

export function observedConfluenceLastSeenUpdatedAt(
  candidates: ConnectorSourceCandidate[]
): string | null {
  return maxIsoTimestamp(...candidates.map((candidate) => candidate.sourceDate));
}

export async function commitConfluenceResourceCursorOnSuccess(input: {
  key: ConnectionCursorKey;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
  pageVersion?: string | null;
}): Promise<void> {
  const existing = await getConnectionCursor(input.key);
  const observed = observedConfluenceLastSeenUpdatedAt(input.candidates);
  const advance = buildCursorAdvanceFromSync({
    existingLastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? null,
    observedLastSeenUpdatedAt: observed,
    overlapDurationMs: existing?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    syncedAt: input.syncedAt,
    cursorValue: input.pageVersion ?? observed ?? input.syncedAt,
    cursorValueType: "updated_since",
  });
  await commitConnectionCursorOnSuccess(input.key, advance);
}
