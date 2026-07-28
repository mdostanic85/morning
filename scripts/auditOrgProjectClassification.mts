/**
 * Read-only audit query helper for
 * docs/audits/org-hierarchy-project-classification-audit.md.
 *
 * Every statement is a SELECT. Nothing is written to the database.
 * Output is JSON on stdout so the audit can quote exact counts.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const raw = readFileSync(".env.local", "utf8");
  const line = raw
    .split("\n")
    .find((entry) => entry.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(loadDatabaseUrl(), { max: 1, prepare: false });

function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

interface RosterEntry {
  figmaNodeId: string;
  name: string;
  title: string;
  location: string;
  managerName: string | null;
  depth: number;
}

const roster: RosterEntry[] = JSON.parse(
  readFileSync("docs/org/si-org-chart.json", "utf8")
).roster;
const rosterByNormalized = new Map(roster.map((p) => [normalizePersonName(p.name), p]));
const rosterByFirstName = new Map<string, RosterEntry[]>();
for (const person of roster) {
  const first = normalizePersonName(person.name).split(" ")[0];
  const list = rosterByFirstName.get(first) ?? [];
  list.push(person);
  rosterByFirstName.set(first, list);
}

/** Strips the `Name <email>` wrapper and quoting that Gmail/Jira display names carry. */
function unwrapDisplayName(raw: string): string {
  let value = raw.trim().replace(/^["']|["']$/g, "");
  const wrapped = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (wrapped) {
    const label = wrapped[1].trim();
    if (label) return label;
    value = wrapped[2];
  }
  return value.trim();
}

/** `lucas.saeed@spaceinch.com` / `connor.mclaren` -> `Lucas Saeed` / `Connor Mclaren`. */
function expandUsername(raw: string): string | null {
  const local = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  if (!/^[a-z]+([._-][a-z]+)+$/i.test(local)) return null;
  return local
    .split(/[._-]/)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type Resolution =
  | { kind: "full_name"; person: RosterEntry }
  | { kind: "username"; person: RosterEntry }
  | { kind: "first_name_unique"; person: RosterEntry }
  | { kind: "first_name_ambiguous"; candidates: string[] }
  | { kind: "unresolved" };

function resolveAgainstRoster(raw: string): Resolution {
  const display = unwrapDisplayName(raw);
  const normalized = normalizePersonName(display);
  if (!normalized) return { kind: "unresolved" };

  const exact = rosterByNormalized.get(normalized);
  if (exact) return { kind: "full_name", person: exact };

  const expanded = expandUsername(display);
  if (expanded) {
    const viaUsername = rosterByNormalized.get(normalizePersonName(expanded));
    if (viaUsername) return { kind: "username", person: viaUsername };
  }

  const first = normalized.split(" ")[0];
  const byFirst = rosterByFirstName.get(first) ?? [];
  if (byFirst.length === 1) return { kind: "first_name_unique", person: byFirst[0] };
  if (byFirst.length > 1) {
    return { kind: "first_name_ambiguous", candidates: byFirst.map((p) => p.name) };
  }
  return { kind: "unresolved" };
}

async function main() {
  const out: Record<string, unknown> = {};

  out.tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
    ORDER BY table_name
  `;

  out.metadataKeysBySourceType = await sql`
    SELECT source_type, k AS metadata_key, COUNT(*)::int AS rows
    FROM source_items s, jsonb_object_keys(s.metadata) k
    WHERE s.metadata IS NOT NULL
    GROUP BY 1, 2 ORDER BY source_type, rows DESC
  `;

  out.calendarAttendees = await sql`
    SELECT id, project_id, title, source_date,
           metadata->>'organizer' AS organizer, metadata->'attendees' AS attendees
    FROM source_items WHERE source_type = 'calendar' ORDER BY source_date DESC
  `;

  out.sourceCountsByType = await sql`
    SELECT source_type, COUNT(*)::int AS rows,
           COUNT(author)::int AS with_author,
           COUNT(project_id)::int AS with_project
    FROM source_items GROUP BY source_type ORDER BY rows DESC
  `;

  out.projects = await sql`
    SELECT id, name, status, jira_keys, github_repositories, people,
           confluence_spaces, figma_file_keys
    FROM projects ORDER BY id
  `;

  out.distinctAuthors = await sql`
    SELECT author, COUNT(*)::int AS rows,
           COUNT(DISTINCT source_type)::int AS source_types,
           MIN(source_date) AS first_seen, MAX(source_date) AS last_seen
    FROM source_items WHERE author IS NOT NULL AND btrim(author) <> ''
    GROUP BY author ORDER BY rows DESC
  `;

  out.assigneeLines = await sql`
    SELECT DISTINCT btrim(substring(body from 'Assignee:[ \t]*([^\n\r]+)')) AS assignee,
           COUNT(*)::int AS rows
    FROM source_items
    WHERE body ~ 'Assignee:'
    GROUP BY 1 ORDER BY rows DESC
  `;

  out.involvementRows = await sql`
    SELECT metadata->>'involvement' AS involvement, COUNT(*)::int AS rows
    FROM source_items WHERE metadata ? 'involvement'
    GROUP BY 1 ORDER BY rows DESC
  `;

  out.peopleTable = await sql`SELECT id, display_name, merged_into_id FROM people ORDER BY id`;
  out.personAliases = await sql`SELECT person_id, alias FROM person_aliases ORDER BY person_id, alias`;

  out.taskOwners = await sql`
    SELECT owner, COUNT(*)::int AS rows
    FROM work_tasks WHERE owner IS NOT NULL AND btrim(owner) <> ''
    GROUP BY owner ORDER BY rows DESC
  `;

  out.participantsSample = await sql`
    SELECT id, source_type, title, source_date, project_id,
           metadata->'participants' AS participants
    FROM source_items
    WHERE metadata ? 'participants'
    ORDER BY source_date DESC LIMIT 40
  `;

  out.gmailFromTo = await sql`
    SELECT id, source_type, source_date, project_id,
           metadata->>'from' AS mail_from, metadata->>'to' AS mail_to
    FROM source_items
    WHERE metadata ? 'from' OR metadata ? 'to'
    ORDER BY source_date DESC LIMIT 60
  `;

  // Per-project membership evidence: Jira reporter (author) joined via jiraKeys prefix in url.
  out.jiraAuthorByProject = await sql`
    SELECT s.id, s.author, s.project_id, s.url, s.title, s.source_date,
           s.metadata->>'involvement' AS involvement,
           btrim(substring(s.body from 'Assignee:[ \t]*([^\n\r]+)')) AS body_assignee,
           substring(s.url from '([A-Z][A-Z0-9]+)-[0-9]+') AS jira_key_prefix
    FROM source_items s
    WHERE s.source_type = 'jira'
    ORDER BY s.source_date DESC
  `;

  out.githubAuthorByProject = await sql`
    SELECT id, author, project_id, url, title, source_date
    FROM source_items WHERE source_type = 'github' ORDER BY source_date DESC
  `;

  // Resolve every distinct author string against the roster (deterministic only).
  const authors = out.distinctAuthors as { author: string; rows: number }[];
  out.authorResolution = authors.map((row) => {
    const resolution = resolveAgainstRoster(row.author);
    return {
      author: row.author,
      rows: row.rows,
      kind: resolution.kind,
      resolvedTo: "person" in resolution ? resolution.person.name : null,
      depth: "person" in resolution ? resolution.person.depth : null,
      title: "person" in resolution ? resolution.person.title : null,
      candidates: "candidates" in resolution ? resolution.candidates : null,
    };
  });

  const assignees = (out.assigneeLines as { assignee: string | null; rows: number }[]).filter(
    (row) => row.assignee
  );
  out.assigneeResolution = assignees.map((row) => {
    const resolution = resolveAgainstRoster(row.assignee as string);
    return {
      assignee: row.assignee,
      rows: row.rows,
      kind: resolution.kind,
      resolvedTo: "person" in resolution ? resolution.person.name : null,
      candidates: "candidates" in resolution ? resolution.candidates : null,
    };
  });

  const owners = (out.taskOwners as { owner: string; rows: number }[]) ?? [];
  out.ownerResolution = owners.map((row) => {
    const resolution = resolveAgainstRoster(row.owner);
    return {
      owner: row.owner,
      rows: row.rows,
      kind: resolution.kind,
      resolvedTo: "person" in resolution ? resolution.person.name : null,
      candidates: "candidates" in resolution ? resolution.candidates : null,
    };
  });

  process.stdout.write(JSON.stringify(out, null, 2));
  await sql.end();
}

main().catch(async (error) => {
  console.error("QUERY FAILED:", error instanceof Error ? error.message : error);
  await sql.end({ timeout: 1 });
  process.exit(1);
});
