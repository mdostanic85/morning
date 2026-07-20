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
import { isoToGmailAfterDate } from "./providerCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export const GMAIL_MEET_NOTES_CURSOR_TYPE = "gmail_meet_notes";

export function gmailProviderCursorKey(connectionId: number): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "gmail",
    scopeType: "provider",
    scopeKey: providerScopeKey("gmail"),
    cursorType: GMAIL_MEET_NOTES_CURSOR_TYPE,
  });
}

export async function loadGmailIncrementalAfterDate(connectionId: number): Promise<{
  afterDate: string;
  isFirstSync: boolean;
}> {
  const cursor = await getConnectionCursor(gmailProviderCursorKey(connectionId));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return { afterDate: isoToGmailAfterDate(window.sinceIso), isFirstSync: window.isFirstSync };
}

function observedGmailLastSeenUpdatedAt(
  candidates: ConnectorSourceCandidate[]
): string | null {
  return maxIsoTimestamp(...candidates.map((candidate) => candidate.sourceDate));
}

export async function commitGmailConnectionCursorOnSuccess(input: {
  connectionId: number;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = gmailProviderCursorKey(input.connectionId);
  const existing = await getConnectionCursor(key);
  const observed = observedGmailLastSeenUpdatedAt(input.candidates);
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
