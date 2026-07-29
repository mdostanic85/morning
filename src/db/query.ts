import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type AppDb = PostgresJsDatabase<typeof schema>;

type AllCapable<T> = { all(): T[] } | PromiseLike<T[]>;
type GetCapable<T> = { get(): T | undefined } | PromiseLike<T[]>;
type RunCapable = { run(): unknown } | PromiseLike<unknown>;
type ReturningCapable<T> = { all(): T[] } | PromiseLike<T[]>;

/**
 * postgres.js rejects the in-flight query when a pooled connection dies (laptop
 * sleep, database restart, terminated backend) and opens a fresh connection for
 * the next one, so the first query after the outage is the only casualty. These
 * failures happen before the statement runs, which makes reads safe to replay;
 * writes are not, because a connection can also die after the server committed.
 *
 * Socket-level codes come from postgres.js, the SQLSTATEs from PostgreSQL.
 */
const RETRYABLE_DRIVER_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "57P01", // admin_shutdown — backend terminated
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now — server still starting
]);

/**
 * A dead connection surfaces twice: postgres.js rejects the in-flight query when
 * the socket drops, then delivers the server's own termination error to the next
 * query on that connection. A read therefore needs two replays to get past it.
 */
const MAX_READ_ATTEMPTS = 3;
const RETRY_DELAY_MS = 150;

function driverError(error: unknown): Error | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof Error ? cause : undefined;
}

function isRetryableConnectionError(error: unknown): boolean {
  const code = (driverError(error) as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && RETRYABLE_DRIVER_ERROR_CODES.has(code);
}

/**
 * Drizzle's `Failed query: …` message keeps the driver failure in `cause`, which
 * error overlays and logs drop. Lift it into the message so a failed query is
 * diagnosable from the reported error alone.
 */
function withDriverDetail(error: unknown): unknown {
  const driver = driverError(error);
  if (!driver || !(error instanceof Error)) return error;

  const code = (driver as { code?: unknown }).code;
  const label = typeof code === "string" ? `${code}: ${driver.message}` : driver.message;
  return new Error(`${label}\n${error.message}`, { cause: error });
}

async function runRead<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= MAX_READ_ATTEMPTS || !isRetryableConnectionError(error)) {
        throw withDriverDetail(error);
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

async function runWrite<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw withDriverDetail(error);
  }
}

export async function fetchAll<T>(query: AllCapable<T>): Promise<T[]> {
  if (typeof (query as { all?: () => T[] }).all === "function") {
    return (query as { all: () => T[] }).all();
  }
  return runRead(() => query as Promise<T[]>);
}

export async function fetchOne<T>(query: GetCapable<T>): Promise<T | undefined> {
  if (typeof (query as { get?: () => T | undefined }).get === "function") {
    return (query as { get: () => T | undefined }).get();
  }
  const rows = await runRead(() => query as Promise<T[]>);
  return rows[0];
}

export async function execute(query: RunCapable): Promise<void> {
  if (typeof (query as { run?: () => unknown }).run === "function") {
    (query as { run: () => unknown }).run();
    return;
  }
  await runWrite(() => query as Promise<unknown>);
}

export async function fetchReturning<T>(query: ReturningCapable<T>): Promise<T[]> {
  if (typeof (query as { all?: () => T[] }).all === "function") {
    return (query as { all: () => T[] }).all();
  }
  return runWrite(() => query as Promise<T[]>);
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
