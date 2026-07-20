import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type AppDb = PostgresJsDatabase<typeof schema>;

type AllCapable<T> = { all(): T[] } | PromiseLike<T[]>;
type GetCapable<T> = { get(): T | undefined } | PromiseLike<T[]>;
type RunCapable = { run(): unknown } | PromiseLike<unknown>;
type ReturningCapable<T> = { all(): T[] } | PromiseLike<T[]>;

export async function fetchAll<T>(query: AllCapable<T>): Promise<T[]> {
  if (typeof (query as { all?: () => T[] }).all === "function") {
    return (query as { all: () => T[] }).all();
  }
  return query as Promise<T[]>;
}

export async function fetchOne<T>(query: GetCapable<T>): Promise<T | undefined> {
  if (typeof (query as { get?: () => T | undefined }).get === "function") {
    return (query as { get: () => T | undefined }).get();
  }
  const rows = (await query) as T[];
  return rows[0];
}

export async function execute(query: RunCapable): Promise<void> {
  if (typeof (query as { run?: () => unknown }).run === "function") {
    (query as { run: () => unknown }).run();
    return;
  }
  await query;
}

export async function fetchReturning<T>(query: ReturningCapable<T>): Promise<T[]> {
  return fetchAll(query);
}

export function syncRun(query: RunCapable): void {
  if (typeof (query as { run?: () => unknown }).run === "function") {
    (query as { run: () => unknown }).run();
    return;
  }
  throw new Error("syncRun is only valid inside a SQLite transaction.");
}

export function syncAll<T>(query: AllCapable<T>): T[] {
  if (typeof (query as { all?: () => T[] }).all === "function") {
    return (query as { all: () => T[] }).all();
  }
  throw new Error("syncAll is only valid inside a SQLite transaction.");
}

export async function withTransaction<T>(fn: (tx: AppDb) => T | Promise<T>): Promise<T> {
  const { db } = await import("./connection");
  return (db as AppDb).transaction(async (tx) => fn(tx));
}
