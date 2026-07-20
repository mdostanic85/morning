export const CONNECTION_CURSOR_SCOPE_TYPES = ["connection", "provider", "resource"] as const;
export type ConnectionCursorScopeType = (typeof CONNECTION_CURSOR_SCOPE_TYPES)[number];

export const CONNECTION_CURSOR_VALUE_TYPES = [
  "updated_since",
  "page_token",
  "opaque",
] as const;
export type ConnectionCursorValueType = (typeof CONNECTION_CURSOR_VALUE_TYPES)[number];

export interface ConnectionCursor {
  id: number;
  connectionId: number;
  provider: string;
  scopeType: ConnectionCursorScopeType;
  scopeKey: string;
  cursorType: string;
  cursorValueType: ConnectionCursorValueType;
  cursorValue: string | null;
  lastSeenUpdatedAt: string | null;
  overlapDurationMs: number;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionCursorKey {
  connectionId: number;
  provider: string;
  scopeType: ConnectionCursorScopeType;
  scopeKey: string;
  cursorType: string;
}

export interface ConnectionCursorAdvance {
  cursorValue: string | null;
  cursorValueType: ConnectionCursorValueType;
  lastSeenUpdatedAt: string | null;
  overlapDurationMs: number;
  lastSuccessfulSyncAt: string;
}
