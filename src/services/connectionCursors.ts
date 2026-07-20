import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connectionCursors } from "@/db/tables";
import { fetchOne, fetchReturning } from "@/db/query";
import type {
  ConnectionCursor,
  ConnectionCursorAdvance,
  ConnectionCursorKey,
} from "@/domain/connectionCursor";

function nowIso(): string {
  return new Date().toISOString();
}

function toConnectionCursor(row: typeof connectionCursors.$inferSelect): ConnectionCursor {
  return {
    id: row.id,
    connectionId: row.connectionId,
    provider: row.provider,
    scopeType: row.scopeType,
    scopeKey: row.scopeKey,
    cursorType: row.cursorType,
    cursorValueType: row.cursorValueType,
    cursorValue: row.cursorValue ?? null,
    lastSeenUpdatedAt: row.lastSeenUpdatedAt ?? null,
    overlapDurationMs: row.overlapDurationMs,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function cursorWhere(key: ConnectionCursorKey) {
  return and(
    eq(connectionCursors.connectionId, key.connectionId),
    eq(connectionCursors.provider, key.provider),
    eq(connectionCursors.scopeType, key.scopeType),
    eq(connectionCursors.scopeKey, key.scopeKey),
    eq(connectionCursors.cursorType, key.cursorType)
  );
}

export async function getConnectionCursor(
  key: ConnectionCursorKey
): Promise<ConnectionCursor | null> {
  const row = await fetchOne(db.select().from(connectionCursors).where(cursorWhere(key)));
  return row ? toConnectionCursor(row) : null;
}

export async function commitConnectionCursorOnSuccess(
  key: ConnectionCursorKey,
  advance: ConnectionCursorAdvance
): Promise<ConnectionCursor> {
  const existing = await getConnectionCursor(key);
  const timestamp = nowIso();

  if (existing) {
    const [row] = await fetchReturning(
      db
        .update(connectionCursors)
        .set({
          cursorValueType: advance.cursorValueType,
          cursorValue: advance.cursorValue,
          lastSeenUpdatedAt: advance.lastSeenUpdatedAt,
          overlapDurationMs: advance.overlapDurationMs,
          lastSuccessfulSyncAt: advance.lastSuccessfulSyncAt,
          updatedAt: timestamp,
        })
        .where(eq(connectionCursors.id, existing.id))
        .returning()
    );
    return toConnectionCursor(row);
  }

  const [row] = await fetchReturning(
    db
      .insert(connectionCursors)
      .values({
        connectionId: key.connectionId,
        provider: key.provider,
        scopeType: key.scopeType,
        scopeKey: key.scopeKey,
        cursorType: key.cursorType,
        cursorValueType: advance.cursorValueType,
        cursorValue: advance.cursorValue,
        lastSeenUpdatedAt: advance.lastSeenUpdatedAt,
        overlapDurationMs: advance.overlapDurationMs,
        lastSuccessfulSyncAt: advance.lastSuccessfulSyncAt,
      })
      .returning()
  );
  return toConnectionCursor(row);
}
