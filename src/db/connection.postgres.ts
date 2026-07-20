import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDatabaseConfig, getPostgresDriverOptions } from "@/lib/env/database";
import * as schema from "./schema";
import { createLazyProxy } from "./lazyProxy";

declare global {
  var __postgresClient: ReturnType<typeof postgres> | undefined;
  var __postgresDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function createPostgresClient(): ReturnType<typeof postgres> {
  const databaseConfig = getDatabaseConfig();
  const client =
    globalThis.__postgresClient ??
    postgres(databaseConfig.url, getPostgresDriverOptions(databaseConfig.url));
  globalThis.__postgresClient = client;
  return client;
}

function createPostgresDb() {
  return drizzle(createPostgresClient(), { schema });
}

export function getPostgresClient(): ReturnType<typeof postgres> {
  return createPostgresClient();
}

export function getPostgresDb() {
  if (!globalThis.__postgresDb) {
    globalThis.__postgresDb = createPostgresDb();
  }
  return globalThis.__postgresDb;
}

export const postgresClient = createLazyProxy(getPostgresClient);
export const db = createLazyProxy(getPostgresDb);
