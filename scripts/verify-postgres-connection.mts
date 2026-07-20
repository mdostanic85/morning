import { resetDatabaseConfigCache } from "../src/lib/env/database";

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://worklight:worklight@127.0.0.1:5433/worklight";
  resetDatabaseConfigCache();

  const { sql } = await import("drizzle-orm");
  const { db } = await import("../src/db/connection");

  const rows = await db.execute(sql`select 1 as ok`);
  const tables = await db.execute(sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `);

  console.log("postgres connection: ok", rows);
  console.log(`public tables: ${Array.isArray(tables) ? tables.length : (tables as { rows?: unknown[] }).rows?.length ?? "unknown"}`);

  const { getDatabaseDialect } = await import("../src/db/dialect");
  if (getDatabaseDialect() === "postgres") {
    const { getPostgresClient } = await import("../src/db/connection.postgres");
    await getPostgresClient().end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
