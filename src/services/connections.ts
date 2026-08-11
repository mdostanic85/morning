import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connections as connectionsTable } from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning, execute } from "@/db/query";
import type { Connection, ConnectionPatch, NewConnection } from "@/domain/connection";
import { requireAppUserId } from "@/lib/auth/appUser";

function toConnection(row: typeof connectionsTable.$inferSelect): Connection {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    authType: row.authType,
    scopes: row.scopes ?? [],
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createConnection(input: NewConnection, explicitUserId?: number): Promise<Connection> {
  const userId = await requireAppUserId(explicitUserId);
  const [row] = await fetchReturning(
    db
      .insert(connectionsTable)
      .values({
        userId,
        provider: input.provider,
        status: input.status ?? "disconnected",
        authType: input.authType,
        scopes: input.scopes ?? [],
        metadata: input.metadata ?? null,
      })
      .returning()
  );
  return toConnection(row);
}

export async function getConnections(explicitUserId?: number): Promise<Connection[]> {
  const userId = await requireAppUserId(explicitUserId);
  const rows = await fetchAll(
    db.select().from(connectionsTable).where(eq(connectionsTable.userId, userId))
  );
  return rows.map(toConnection);
}

export async function getConnectionById(id: number, explicitUserId?: number): Promise<Connection | null> {
  const userId = await requireAppUserId(explicitUserId);
  const row = await fetchOne(
    db
      .select()
      .from(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)))
  );
  return row ? toConnection(row) : null;
}

export async function getConnectionByProvider(provider: string, explicitUserId?: number): Promise<Connection | null> {
  const userId = await requireAppUserId(explicitUserId);
  const row = await fetchOne(
    db
      .select()
      .from(connectionsTable)
      .where(and(eq(connectionsTable.userId, userId), eq(connectionsTable.provider, provider)))
  );
  return row ? toConnection(row) : null;
}

export async function upsertConnection(input: NewConnection, explicitUserId?: number): Promise<Connection> {
  const userId = await requireAppUserId(explicitUserId);
  const existing = await getConnectionByProvider(input.provider, userId);
  const status = input.status ?? existing?.status ?? "disconnected";
  const scopes = input.scopes ?? existing?.scopes ?? [];
  const metadata = input.metadata ?? existing?.metadata ?? null;
  const updatedAt = new Date().toISOString();
  const [row] = await fetchReturning(
    db
      .insert(connectionsTable)
      .values({
        userId,
        provider: input.provider,
        status,
        authType: input.authType,
        scopes,
        metadata,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [connectionsTable.userId, connectionsTable.provider],
        set: { status, authType: input.authType, scopes, metadata, updatedAt },
      })
      .returning()
  );
  return toConnection(row);
}

export async function updateConnection(
  id: number,
  patch: ConnectionPatch,
  explicitUserId?: number
): Promise<Connection | null> {
  const userId = await requireAppUserId(explicitUserId);
  const [row] = await fetchReturning(
    db
      .update(connectionsTable)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)))
      .returning()
  );
  return row ? toConnection(row) : null;
}

export async function deleteConnection(id: number, explicitUserId?: number): Promise<void> {
  const userId = await requireAppUserId(explicitUserId);
  await execute(
    db
      .delete(connectionsTable)
      .where(and(eq(connectionsTable.id, id), eq(connectionsTable.userId, userId)))
  );
}
