/**
 * One-off repair for Figma comment rows that were classified before the
 * pipeline inherited a thread's project (see
 * `src/lib/figma/commentThreadStore.ts`). Those rows were project-matched one
 * reply at a time, so a single thread could drift across projects and its
 * replies dropped out of the merge candidate set.
 *
 * Reuses the same deterministic thread rules as the pipeline: the oldest
 * classified member of a thread owns the thread's project. Rows whose project
 * already matches their thread are left untouched.
 *
 * Clearing `_worklightProcessing` is belt-and-braces — the processing
 * fingerprint already covers `projectId`, so a re-projected row re-extracts on
 * the next sync either way.
 *
 * Usage: npx tsx scripts/backfillFigmaCommentThreadProjects.mts [--apply]
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  figmaCommentThreadKey,
  resolveFigmaCommentThreadProjectId,
  selectFigmaCommentThread,
  type FigmaCommentSourceLike,
} from "../src/lib/figma/commentThread.js";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split("\n").find((entry) => entry.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const apply = process.argv.includes("--apply");
const sql = postgres(loadDatabaseUrl(), { max: 1 });

const rows = await sql`
  select id, project_id, source_type, author, source_date, body, metadata
  from source_items
  where source_type = 'figma'`;

const items: (FigmaCommentSourceLike & { metadata: Record<string, unknown> | null })[] =
  rows.map((row) => ({
    id: row.id as number,
    projectId: row.project_id as number | null,
    sourceType: row.source_type as string,
    author: row.author as string | null,
    sourceDate: row.source_date as string,
    body: row.body as string,
    metadata: row.metadata as Record<string, unknown> | null,
  }));

let repaired = 0;

for (const item of items) {
  const key = figmaCommentThreadKey(item);
  if (!key) continue;

  const siblings = selectFigmaCommentThread(items, key, { excludeSourceItemId: item.id });
  const inherited = resolveFigmaCommentThreadProjectId(siblings);
  if (!inherited || inherited.projectId === item.projectId) continue;
  // The thread's oldest classified member defines the project; if that is this
  // row itself there is nothing older to inherit from.
  if (inherited.fromSourceItemId === item.id) continue;

  repaired += 1;
  console.log(
    `#${item.id} (${item.author ?? "unknown"}, ${item.sourceDate}) project ${item.projectId} → ${inherited.projectId} (thread root #${inherited.fromSourceItemId})`
  );

  if (!apply) continue;

  const nextMetadata: Record<string, unknown> = { ...(item.metadata ?? {}) };
  delete nextMetadata._worklightProcessing;
  nextMetadata.projectFromThread = {
    projectId: inherited.projectId,
    fromSourceItemId: inherited.fromSourceItemId,
    resolvedAt: new Date().toISOString(),
    backfill: true,
  };

  await sql`
    update source_items
    set project_id = ${inherited.projectId},
        metadata = ${sql.json(nextMetadata)},
        updated_at = ${new Date().toISOString()}
    where id = ${item.id}`;
}

console.log(
  repaired === 0
    ? "No Figma comment rows drifted from their thread's project."
    : apply
      ? `Repaired ${repaired} row(s). They re-extract on the next Figma sync.`
      : `${repaired} row(s) would be repaired. Re-run with --apply to write.`
);

await sql.end();
