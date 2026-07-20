import type { ConnectionCursorKey } from "@/domain/connectionCursor";
import {
  buildCursorAdvanceFromSync,
  connectionCursorKey,
  DEFAULT_OVERLAP_MS,
  maxIsoTimestamp,
  resourceScopeKey,
} from "./connectionCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export const CALENDAR_PRIMARY_RESOURCE = "primary";
export const CALENDAR_EVENTS_CURSOR_TYPE = "calendar_events";

export function calendarPrimaryCursorKey(connectionId: number): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "calendar",
    scopeType: "resource",
    scopeKey: resourceScopeKey(CALENDAR_PRIMARY_RESOURCE),
    cursorType: CALENDAR_EVENTS_CURSOR_TYPE,
  });
}

export async function loadCalendarSyncToken(
  connectionId: number
): Promise<string | null> {
  const cursor = await getConnectionCursor(calendarPrimaryCursorKey(connectionId));
  return cursor?.cursorValue ?? null;
}

export function observedCalendarLastSeenUpdatedAt(
  candidates: ConnectorSourceCandidate[]
): string | null {
  return maxIsoTimestamp(...candidates.map((candidate) => candidate.sourceDate));
}

export async function commitCalendarConnectionCursorOnSuccess(input: {
  connectionId: number;
  candidates: ConnectorSourceCandidate[];
  nextSyncToken: string | null;
  syncedAt: string;
}): Promise<void> {
  const key = calendarPrimaryCursorKey(input.connectionId);
  const existing = await getConnectionCursor(key);
  const advance = buildCursorAdvanceFromSync({
    existingLastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? null,
    observedLastSeenUpdatedAt: observedCalendarLastSeenUpdatedAt(input.candidates),
    overlapDurationMs: existing?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    syncedAt: input.syncedAt,
    cursorValue: input.nextSyncToken,
    cursorValueType: "opaque",
  });
  await commitConnectionCursorOnSuccess(key, advance);
}

export async function clearCalendarSyncToken(connectionId: number): Promise<void> {
  const key = calendarPrimaryCursorKey(connectionId);
  const existing = await getConnectionCursor(key);
  if (!existing) return;
  await commitConnectionCursorOnSuccess(key, {
    cursorValue: null,
    cursorValueType: "opaque",
    lastSeenUpdatedAt: existing.lastSeenUpdatedAt,
    overlapDurationMs: existing.overlapDurationMs,
    lastSuccessfulSyncAt: existing.lastSuccessfulSyncAt ?? new Date().toISOString(),
  });
}
