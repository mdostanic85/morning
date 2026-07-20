import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { connections as connectionsTable } from "@/db/tables";
import { fetchAll, fetchOne, fetchReturning, execute } from "@/db/query";
import type { Connection, ConnectionPatch, NewConnection } from "@/domain/connection";

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

export async function createConnection(input: NewConnection): Promise<Connection> {
  const [row] = await fetchReturning(
    db
      .insert(connectionsTable)
      .values({
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

export async function getConnections(): Promise<Connection[]> {
  const rows = await fetchAll(db.select().from(connectionsTable));
  return rows.map(toConnection);
}

export async function getConnectionById(id: number): Promise<Connection | null> {
  const row = await fetchOne(db.select().from(connectionsTable).where(eq(connectionsTable.id, id)));
  return row ? toConnection(row) : null;
}

export async function getConnectionByProvider(provider: string): Promise<Connection | null> {
  const row = await fetchOne(db.select().from(connectionsTable).where(eq(connectionsTable.provider, provider)));
  return row ? toConnection(row) : null;
}

export async function upsertConnection(input: NewConnection): Promise<Connection> {
  const existing = await getConnectionByProvider(input.provider);
  if (existing) {
    return (
      (await updateConnection(existing.id, {
        status: input.status ?? existing.status,
        authType: input.authType,
        scopes: input.scopes ?? existing.scopes,
        metadata: input.metadata ?? existing.metadata,
      })) ?? existing
    );
  }

  return createConnection(input);
}

export async function updateConnection(
  id: number,
  patch: ConnectionPatch
): Promise<Connection | null> {
  const [row] = await fetchReturning(
    db.update(connectionsTable).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(connectionsTable.id, id)).returning()
  );
  return row ? toConnection(row) : null;
}

export async function deleteConnection(id: number): Promise<void> {
  await execute(db.delete(connectionsTable).where(eq(connectionsTable.id, id)));
}
