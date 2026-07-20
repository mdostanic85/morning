import type { DatabaseDialect } from "@/lib/env/database";

/** PostgreSQL is the only supported application database. */
export function getDatabaseDialect(): DatabaseDialect {
  return "postgres";
}

export function isPostgresDatabase(): boolean {
  return true;
}
