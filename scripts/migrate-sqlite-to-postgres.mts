/**
 * One-time SQLite → PostgreSQL data migration.
 * Reads the local SQLite file (read-only) and inserts into DATABASE_URL.
 * Not invoked by the application — run manually via npm script.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";

type TableCounts = {
  read: number;
  inserted: number;
  skipped: number;
  failed: number;
};

/** FK-safe insert order. */
const TABLE_ORDER = [
  "workspaces",
  "projects",
  "user_profiles",
  "connections",
  "daily_memories",
  "source_items",
  "work_tasks",
  "evidence",
  "knowledge_items",
  "knowledge_embeddings",
  "verification_reports",
  "sync_review_reports",
  "report_tasks",
  "task_schedules",
  "sync_cursors",
  "source_documents",
  "report_runs",
  "hydra_evidence_items",
  "evidence_relations",
  "reports",
  "notification_deliveries",
  "audit_logs",
  "report_feedback",
] as const;

const BOOLEAN_COLUMNS = new Set([
  "work_tasks.status_manually_set",
  "report_tasks.active",
  "task_schedules.enabled",
]);

const JSON_COLUMNS = new Set([
  "projects.keywords",
  "projects.people",
  "projects.jira_keys",
  "projects.repo_paths",
  "projects.github_repositories",
  "projects.confluence_spaces",
  "projects.confluence_page_urls",
  "projects.discord_channels",
  "projects.figma_file_keys",
  "source_items.metadata",
  "work_tasks.done_criteria",
  "work_tasks.work_context",
  "knowledge_items.evidence_quotes",
  "knowledge_embeddings.embedding",
  "verification_reports.matches",
  "verification_reports.missing",
  "verification_reports.risks",
  "sync_review_reports.ok",
  "sync_review_reports.not_ok",
  "sync_review_reports.conflicts",
  "connections.scopes",
  "connections.metadata",
  "daily_memories.what_worked_on",
  "daily_memories.completed",
  "daily_memories.still_open",
  "daily_memories.waiting_on",
  "daily_memories.risks",
  "report_tasks.config",
  "report_tasks.delivery_settings",
  "source_documents.metadata",
  "report_runs.source_health",
  "report_runs.warnings",
  "report_runs.timings",
  "report_runs.config_snapshot",
  "hydra_evidence_items.participants",
  "hydra_evidence_items.score_reasons",
  "hydra_evidence_items.metadata",
  "reports.structured_json",
  "audit_logs.metadata",
]);

function resolveSqlitePath(): string {
  const raw =
    process.env.SQLITE_PATH?.trim() ||
    process.env.SQLITE_DATABASE_URL?.trim()?.replace(/^file:/, "") ||
    null;

  const fallbackCandidates = ["./data/worklight.db", "./data/morning.db"];
  const chosen =
    raw ||
    fallbackCandidates.find((candidate) => {
      const absolute = path.isAbsolute(candidate)
        ? candidate
        : path.join(process.cwd(), candidate);
      return fs.existsSync(absolute);
    }) ||
    "./data/worklight.db";

  const normalized = chosen.startsWith("file:") ? chosen.slice("file:".length) : chosen;
  if (path.isAbsolute(normalized)) return normalized;
  return path.join(process.cwd(), normalized);
}

function resolvePostgresUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required (PostgreSQL destination). Example: postgresql://worklight:worklight@127.0.0.1:5433/worklight"
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
  }
  return url;
}

function parseJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function transformRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const key = `${table}.${column}`;
    if (value === null) {
      out[column] = null;
    } else if (BOOLEAN_COLUMNS.has(key)) {
      out[column] = Boolean(Number(value));
    } else if (JSON_COLUMNS.has(key)) {
      out[column] = parseJsonValue(value);
    } else {
      out[column] = value;
    }
  }
  return out;
}

function printCountsLine(table: string, counts: TableCounts): void {
  console.log(
    `${table.padEnd(24)} read=${String(counts.read).padStart(5)}  inserted=${String(counts.inserted).padStart(5)}  skipped=${String(counts.skipped).padStart(5)}  failed=${String(counts.failed).padStart(5)}`
  );
}

async function migrateTable(
  sqlite: Database.Database,
  pg: postgres.Sql,
  table: string
): Promise<TableCounts> {
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  const counts: TableCounts = { read: rows.length, inserted: 0, skipped: 0, failed: 0 };

  if (rows.length === 0) {
    return counts;
  }

  await pg.begin(async (tx) => {
    for (const row of rows) {
      try {
        const payload = transformRow(table, row);
        const inserted = await tx`
          INSERT INTO ${tx(table)} ${tx(payload)}
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `;
        if (inserted.length > 0) {
          counts.inserted += 1;
        } else {
          counts.skipped += 1;
        }
      } catch (error) {
        counts.failed += 1;
        if (counts.failed <= 3) {
          const id = row.id ?? "?";
          const message = error instanceof Error ? error.message : String(error);
          console.error(`  ${table} id=${id}: ${message}`);
        }
      }
    }

    await tx.unsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`
    );
  });

  return counts;
}

async function compareCounts(
  sqlite: Database.Database,
  pg: postgres.Sql
): Promise<{ table: string; sqlite: number; postgres: number; match: boolean }[]> {
  const results = [];
  for (const table of TABLE_ORDER) {
    const sqliteRow = sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as {
      count: number;
    };
    const pgRows = await pg<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${pg(table)}
    `;
    const sqliteCount = sqliteRow.count;
    const postgresCount = pgRows[0]?.count ?? 0;
    results.push({
      table,
      sqlite: sqliteCount,
      postgres: postgresCount,
      match: sqliteCount === postgresCount,
    });
  }
  return results;
}

async function main(): Promise<void> {
  const sqlitePath = resolveSqlitePath();
  const postgresUrl = resolvePostgresUrl();

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite database not found: ${sqlitePath}`);
  }

  console.log(`SQLite source: ${sqlitePath} (read-only)`);
  console.log(`PostgreSQL destination: ${postgresUrl.replace(/:[^:@/]+@/, ":***@")}`);

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pg = postgres(postgresUrl, {
    max: 1,
    ssl: postgresUrl.includes("neon.tech") ? "require" : undefined,
    prepare: false,
  });

  try {
    await pg`SELECT 1`;

    const existing = await pg<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'projects'
    `;
    if ((existing[0]?.count ?? 0) === 0) {
      throw new Error(
        "Destination PostgreSQL schema is missing. Run db:pg:migrate against DATABASE_URL first."
      );
    }

    console.log("\nMigrating tables (FK-safe order):\n");

    const allCounts: Record<string, TableCounts> = {};
    for (const table of TABLE_ORDER) {
      allCounts[table] = await migrateTable(sqlite, pg, table);
      printCountsLine(table, allCounts[table]);
    }

    const totals = Object.values(allCounts).reduce(
      (acc, row) => ({
        read: acc.read + row.read,
        inserted: acc.inserted + row.inserted,
        skipped: acc.skipped + row.skipped,
        failed: acc.failed + row.failed,
      }),
      { read: 0, inserted: 0, skipped: 0, failed: 0 }
    );

    console.log("\nTotals:");
    printCountsLine("ALL", totals);

    console.log("\nRow count comparison (SQLite vs PostgreSQL):\n");
    const comparison = await compareCounts(sqlite, pg);
    let mismatches = 0;
    for (const row of comparison) {
      const flag = row.match ? "ok" : "MISMATCH";
      if (!row.match) mismatches += 1;
      console.log(
        `${row.table.padEnd(24)} sqlite=${String(row.sqlite).padStart(5)}  postgres=${String(row.postgres).padStart(5)}  ${flag}`
      );
    }

    if (totals.failed > 0) {
      console.error(`\nMigration finished with ${totals.failed} failed row(s).`);
      process.exitCode = 1;
    } else if (mismatches > 0) {
      console.error(`\n${mismatches} table(s) have row count mismatches (see above).`);
      process.exitCode = 1;
    } else {
      console.log("\nMigration complete — all table counts match.");
    }
  } finally {
    sqlite.close();
    await pg.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
