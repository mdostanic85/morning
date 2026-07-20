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

export const GITHUB_REPO_CURSOR_TYPE = "github_repo_prs";

export function githubRepoCursorKey(connectionId: number, repository: string): ConnectionCursorKey {
  return connectionCursorKey({
    connectionId,
    provider: "github",
    scopeType: "resource",
    scopeKey: resourceScopeKey(repository),
    cursorType: GITHUB_REPO_CURSOR_TYPE,
  });
}

export async function loadGitHubRepoSinceIso(
  connectionId: number,
  repository: string
): Promise<string> {
  const cursor = await getConnectionCursor(githubRepoCursorKey(connectionId, repository));
  const window = resolveIncrementalSinceIso({
    lastSuccessfulSyncAt: cursor?.lastSuccessfulSyncAt ?? null,
    overlapDurationMs: cursor?.overlapDurationMs ?? DEFAULT_OVERLAP_MS,
    initialLookbackMs: DEFAULT_INITIAL_LOOKBACK_MS,
  });
  return window.sinceIso;
}

export async function commitGitHubRepoCursorOnSuccess(input: {
  connectionId: number;
  repository: string;
  candidates: ConnectorSourceCandidate[];
  syncedAt: string;
}): Promise<void> {
  const key = githubRepoCursorKey(input.connectionId, input.repository);
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
