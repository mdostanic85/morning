import "server-only";

import type { ConnectionCursorKey } from "@/domain/connectionCursor";
import {
  buildCursorAdvanceFromSync,
  connectionCursorKey,
  DEFAULT_INITIAL_LOOKBACK_MS,
  DEFAULT_OVERLAP_MS,
  providerScopeKey,
  resolveIncrementalSinceIso,
} from "./connectionCursorUtils";
import { observedJiraLastSeenUpdatedAt } from "./providerCursorUtils";
import {
  commitConnectionCursorOnSuccess,
  getConnectionCursor,
} from "@/services/connectionCursors";
import type { ConnectorSourceCandidate } from "@/lib/connectors/types";

export const JIRA_ISSUES_CURSOR_TYPE = "jira_issues";

export function jiraProviderCursorKey(connectionId: number): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "jira",
    scopeType: "provider",
    scopeKey: providerScopeKey("jira"),
    cursorType: JIRA_ISSUES_CURSOR_TYPE,
  });
}

export async function loadJiraIncrementalWindow(connectionId: number): Promise<{
  updatedSinceIso: string;
  isFirstSync: boolean;
}> {
  const cursor = await getConnectionCursor(jiraProviderCursorKey(connectionId));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return { updatedSinceIso: window.sinceIso, isFirstSync: window.isFirstSync };
}

export async function commitJiraConnectionCursorOnSuccess(input: {
  connectionId: number;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = jiraProviderCursorKey(input.connectionId);
  const existing = await getConnectionCursor(key);
  const observed = observedJiraLastSeenUpdatedAt(input.candidates);
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
