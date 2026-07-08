// Sanity check that the seed data actually loaded. Run with `npm run db:verify`.
// Prints a row count per table plus a preview of the first row, and exits
// non-zero if any table that should have seed data is empty.
import { db } from "./connection";
import {
  projects,
  sourceItems,
  workTasks,
  evidence,
  knowledgeItems,
  verificationReports,
  connections,
} from "./schema";

interface TableCheck {
  name: string;
  rows: unknown[];
  /** If true, an empty table fails the check (seed.ts always populates these). */
  expectData: boolean;
}

function preview(row: unknown): string {
  const json = JSON.stringify(row);
  return json.length > 140 ? `${json.slice(0, 140)}…` : json;
}

function run() {
  const checks: TableCheck[] = [
    { name: "projects", rows: db.select().from(projects).all(), expectData: true },
    { name: "source_items", rows: db.select().from(sourceItems).all(), expectData: true },
    { name: "work_tasks", rows: db.select().from(workTasks).all(), expectData: true },
    { name: "evidence", rows: db.select().from(evidence).all(), expectData: true },
    { name: "knowledge_items", rows: db.select().from(knowledgeItems).all(), expectData: true },
    {
      name: "verification_reports",
      rows: db.select().from(verificationReports).all(),
      expectData: false,
    },
    { name: "connections", rows: db.select().from(connections).all(), expectData: false },
  ];

  console.log("Table".padEnd(22), "Rows".padEnd(6), "Sample");
  console.log("-".repeat(80));

  let ok = true;
  for (const check of checks) {
    console.log(
      check.name.padEnd(22),
      String(check.rows.length).padEnd(6),
      check.rows[0] ? preview(check.rows[0]) : ""
    );
    if (check.expectData && check.rows.length === 0) {
      ok = false;
    }
  }

  console.log("-".repeat(80));

  if (!ok) {
    console.error("\n✗ One or more expected tables are empty. Run `npm run db:seed` first.");
    process.exit(1);
  }

  console.log("\n✓ Seed data verified — all expected tables have rows.");
}

run();
