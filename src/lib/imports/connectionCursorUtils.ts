import type { ConnectionCursorAdvance, ConnectionCursorValueType } from "@/domain/connectionCursor";

export const DEFAULT_OVERLAP_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
export const GRANOLA_NOTES_CURSOR_TYPE = "granola_notes";

export function providerScopeKey(provider: string): string {
  return provider;
}

export function resourceScopeKey(resource: string): string {
  return resource;
}

export function connectionCursorKey(input: {
  connectionId: number;
  provider: string;
  scopeType: import("@/domain/connectionCursor").ConnectionCursorScopeType;
  scopeKey?: string;
  cursorType: string;
}): import("@/domain/connectionCursor").ConnectionCursorKey {
  return {
    connectionId: input.connectionId,
    provider: input.provider,
    scopeType: input.scopeType,
    scopeKey: input.scopeKey ?? "",
    cursorType: input.cursorType,
  };
}

export function granolaProviderCursorKey(
  connectionId: number
): import("@/domain/connectionCursor").ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "granola",
    scopeType: "provider",
    scopeKey: providerScopeKey("granola"),
    cursorType: GRANOLA_NOTES_CURSOR_TYPE,
  });
}

export function jiraProviderCursorKey(
  connectionId: number
): import("@/domain/connectionCursor").ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "jira",
    scopeType: "provider",
    scopeKey: providerScopeKey("jira"),
    cursorType: "jira_issues",
  });
}

export function githubRepoCursorKey(
  connectionId: number,
  repository: string
): import("@/domain/connectionCursor").ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "github",
    scopeType: "resource",
    scopeKey: resourceScopeKey(repository),
    cursorType: "github_repo_prs",
  });
}

export function discordChannelCursorKey(
  connectionId: number,
  channelId: string
): import("@/domain/connectionCursor").ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "discord",
    scopeType: "resource",
    scopeKey: resourceScopeKey(channelId),
    cursorType: "discord_channel_messages",
  });
}

export function buildCursorAdvanceFromSync(input: {
  existingLastSeenUpdatedAt: string | null;
  observedLastSeenUpdatedAt: string | null;
  overlapDurationMs: number;
  syncedAt: string;
  cursorValue: string | null;
  cursorValueType?: import("@/domain/connectionCursor").ConnectionCursorValueType;
}): import("@/domain/connectionCursor").ConnectionCursorAdvance {
  return buildConnectionCursorAdvance({
    existingLastSeenUpdatedAt: input.existingLastSeenUpdatedAt,
    observedLastSeenUpdatedAt: input.observedLastSeenUpdatedAt,
    overlapDurationMs: input.overlapDurationMs,
    syncedAt: input.syncedAt,
    cursorValue: input.cursorValue,
    cursorValueType: input.cursorValueType,
  });
}

export function resolveIncrementalSinceIso(input: {
  lastSuccessfulSyncAt: string | null;
  overlapDurationMs: number;
  initialLookbackMs: number;
  now?: Date;
}): { sinceIso: string; isFirstSync: boolean } {
  const now = input.now ?? new Date();
  if (!input.lastSuccessfulSyncAt) {
    return {
      sinceIso: new Date(now.getTime() - input.initialLookbackMs).toISOString(),
      isFirstSync: true,
    };
  }

  const anchor = Date.parse(input.lastSuccessfulSyncAt);
  const sinceMs = Number.isFinite(anchor)
    ? anchor - input.overlapDurationMs
    : now.getTime() - input.initialLookbackMs;

  return {
    sinceIso: new Date(sinceMs).toISOString(),
    isFirstSync: false,
  };
}

export function maxIsoTimestamp(
  ...values: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = value;
    }
  }

  return best;
}

export function buildConnectionCursorAdvance(input: {
  existingLastSeenUpdatedAt: string | null;
  observedLastSeenUpdatedAt: string | null;
  overlapDurationMs: number;
  syncedAt: string;
  cursorValue: string | null;
  cursorValueType?: ConnectionCursorValueType;
}): ConnectionCursorAdvance {
  return {
    cursorValue: input.cursorValue,
    cursorValueType: input.cursorValueType ?? "updated_since",
    lastSeenUpdatedAt: maxIsoTimestamp(
      input.existingLastSeenUpdatedAt,
      input.observedLastSeenUpdatedAt
    ),
    overlapDurationMs: input.overlapDurationMs,
    lastSuccessfulSyncAt: input.syncedAt,
  };
}

export function unchangedCursorSnapshot(input: {
  cursorValue: string | null;
  lastSeenUpdatedAt: string | null;
  overlapDurationMs: number;
  lastSuccessfulSyncAt: string | null;
}) {
  return {
    cursorValue: input.cursorValue,
    lastSeenUpdatedAt: input.lastSeenUpdatedAt,
    overlapDurationMs: input.overlapDurationMs,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
  };
}
