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

export const DISCORD_CHANNEL_CURSOR_TYPE = "discord_channel_messages";

export function discordChannelCursorKey(
  connectionId: number,
  channelId: string
): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "discord",
    scopeType: "resource",
    scopeKey: resourceScopeKey(channelId),
    cursorType: DISCORD_CHANNEL_CURSOR_TYPE,
  });
}

export async function loadDiscordChannelAfterSnowflake(
  connectionId: number,
  channelId: string
): Promise<string | null> {
  const cursor = await getConnectionCursor(discordChannelCursorKey(connectionId, channelId));
  return cursor?.cursorValue ?? null;
}

export async function commitDiscordChannelCursorOnSuccess(input: {
  connectionId: number;
  channelId: string;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = discordChannelCursorKey(input.connectionId, input.channelId);
  const existing = await getConnectionCursor(key);
  const observed = maxIsoTimestamp(...input.candidates.map((candidate) => candidate.sourceDate));
  const newestSnowflake = input.candidates
    .map((candidate) => candidate.sourceExternalId)
    .sort()
    .at(-1) ?? existing?.cursorValue ?? null;
  const advance = buildCursorAdvanceFromSync({
    existingLastSeenUpdatedAt: existing?.lastSeenUpdatedAt ?? null,
    observedLastSeenUpdatedAt: observed,
    overlapDurationMs: existing?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    syncedAt: input.syncedAt,
    cursorValue: newestSnowflake,
    cursorValueType: "opaque",
  });
  await commitConnectionCursorOnSuccess(key, advance);
}
