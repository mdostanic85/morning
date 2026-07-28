/**
 * Read-only membership derivation for
 * docs/audits/org-hierarchy-project-classification-audit.md.
 *
 * Deterministic only: no LLM, no fuzzy scoring. Every emitted row carries a
 * source_items id, a date, and a quoted evidence string. Rows whose person or
 * project cannot be resolved deterministically are emitted as Unresolved.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split("\n").find((entry) => entry.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

interface RosterEntry {
  name: string;
  title: string;
  managerName: string | null;
  depth: number;
}

const roster: RosterEntry[] = JSON.parse(
  readFileSync("docs/org/si-org-chart.json", "utf8")
).roster;
const byFullName = new Map(roster.map((p) => [normalizePersonName(p.name), p]));
const byFirstName = new Map<string, RosterEntry[]>();
for (const person of roster) {
  const first = normalizePersonName(person.name).split(" ")[0];
  if (!byFirstName.has(first)) byFirstName.set(first, []);
  byFirstName.get(first)!.push(person);
}

const EXTERNAL_NAMES = new Set(["brian dailey", "erin rose"]);

type PersonResolution =
  | { status: "roster"; person: RosterEntry; via: string }
  | { status: "external"; name: string }
  | { status: "ambiguous"; raw: string; candidates: string[] }
  | { status: "unknown"; raw: string };

function stripWrapper(raw: string): string {
  let value = raw.trim().replace(/^["']|["']$/g, "");
  const wrapped = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (wrapped) {
    const label = wrapped[1].trim().replace(/^["']|["']$/g, "");
    if (label) return label.replace(/\s*\(via [^)]*\)$/i, "").trim();
    value = wrapped[2];
  }
  return value.replace(/\s*\(via [^)]*\)$/i, "").trim();
}

function localPartToName(value: string): string | null {
  const local = value.includes("@") ? value.slice(0, value.indexOf("@")) : value;
  if (!/^[a-z]+([._-][a-z]+)+$/i.test(local)) return null;
  return local.split(/[._-]/).join(" ");
}

function resolvePerson(raw: string): PersonResolution {
  const display = stripWrapper(raw);
  const normalized = normalizePersonName(display);
  if (!normalized) return { status: "unknown", raw };

  const exact = byFullName.get(normalized);
  if (exact) return { status: "roster", person: exact, via: "full_name" };

  const expanded = localPartToName(display);
  if (expanded) {
    const viaEmail = byFullName.get(normalizePersonName(expanded));
    if (viaEmail) return { status: "roster", person: viaEmail, via: "email_local_part" };
  }

  if (EXTERNAL_NAMES.has(normalized)) return { status: "external", name: display };

  const singleToken = normalized.split(" ").length === 1;
  const candidates = byFirstName.get(normalized.split(" ")[0]) ?? [];
  if (singleToken && candidates.length === 1) {
    return { status: "roster", person: candidates[0], via: "unique_first_name" };
  }
  if (candidates.length > 1) {
    return { status: "ambiguous", raw, candidates: candidates.map((p) => p.name) };
  }
  return { status: "unknown", raw };
}

interface MembershipRow {
  name: string;
  rosterName: string | null;
  projectName: string;
  jiraKey: string;
  role: string;
  evidenceSourceId: number;
  evidenceDate: string;
  evidenceQuote: string;
  resolvedVia: string;
  isExternal: boolean;
}

interface UnresolvedRow {
  raw: string;
  reason: string;
  signal: string;
  evidenceSourceId: number | null;
  detail: string;
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), { max: 1, prepare: false });

  const projects = await sql<
    { id: number; name: string; jira_keys: string[]; status: string }[]
  >`SELECT id, name, jira_keys, status FROM projects ORDER BY id`;
  const projectById = new Map(projects.map((p) => [p.id, p]));

  /** Jira key prefix -> projects claiming it. Ambiguous when more than one. */
  const projectsByJiraKey = new Map<string, typeof projects>();
  for (const project of projects) {
    for (const key of project.jira_keys) {
      if (!projectsByJiraKey.has(key)) projectsByJiraKey.set(key, [] as unknown as typeof projects);
      projectsByJiraKey.get(key)!.push(project);
    }
  }

  const membership: MembershipRow[] = [];
  const unresolved: UnresolvedRow[] = [];

  function projectFor(
    projectId: number | null,
    jiraKey: string | null
  ): { name: string; key: string; note: string } | null {
    if (projectId != null) {
      const project = projectById.get(projectId);
      if (project) {
        // Only a Jira-derived key is quoted; never fabricate one from jira_keys[0].
        return { name: project.name, key: jiraKey ?? "", note: "source_items.project_id" };
      }
    }
    if (!jiraKey) return null;
    const claiming = projectsByJiraKey.get(jiraKey) ?? [];
    if (claiming.length === 1) return { name: claiming[0].name, key: jiraKey, note: "projects.jiraKeys (unique)" };
    return null;
  }

  function record(
    raw: string,
    projectId: number | null,
    jiraKey: string | null,
    role: string,
    sourceId: number,
    date: string,
    quote: string,
    signal: string
  ) {
    const project = projectFor(projectId, jiraKey);
    const person = resolvePerson(raw);

    if (!project) {
      unresolved.push({
        raw,
        reason: jiraKey ? "project_ambiguous_or_unlinked" : "no_project_signal",
        signal,
        evidenceSourceId: sourceId,
        detail: jiraKey
          ? `Jira key ${jiraKey} claimed by ${(projectsByJiraKey.get(jiraKey) ?? []).length} project(s); source_items.project_id is NULL`
          : "source_items.project_id is NULL and no Jira key is present in url",
      });
      return;
    }
    if (person.status === "ambiguous") {
      unresolved.push({
        raw,
        reason: "person_ambiguous",
        signal,
        evidenceSourceId: sourceId,
        detail: `${person.candidates.length} roster candidates: ${person.candidates.join(", ")}`,
      });
      return;
    }
    if (person.status === "unknown") {
      unresolved.push({
        raw,
        reason: "person_not_in_roster",
        signal,
        evidenceSourceId: sourceId,
        detail: `No roster full-name, email-local-part, or unique-first-name match for ${JSON.stringify(raw)}`,
      });
      return;
    }

    membership.push({
      name: person.status === "roster" ? person.person.name : person.name,
      rosterName: person.status === "roster" ? person.person.name : null,
      projectName: project.name,
      jiraKey: project.key,
      role,
      evidenceSourceId: sourceId,
      evidenceDate: date.slice(0, 10),
      evidenceQuote: quote.replace(/\s+/g, " ").slice(0, 140),
      resolvedVia: person.status === "roster" ? person.via : "external_allowlist",
      isExternal: person.status === "external",
    });
  }

  // --- Signal 1 & 2: Jira reporter (author) and the `Assignee:` body line ---
  const jira = await sql<
    {
      id: number;
      author: string | null;
      project_id: number | null;
      url: string | null;
      title: string;
      source_date: string;
      body_assignee: string | null;
      jira_key_prefix: string | null;
    }[]
  >`
    SELECT id, author, project_id, url, title, source_date,
           btrim(substring(body from 'Assignee:[ \t]*([^\n\r]+)')) AS body_assignee,
           substring(url from '([A-Z][A-Z0-9]+)-[0-9]+') AS jira_key_prefix
    FROM source_items WHERE source_type = 'jira' ORDER BY id
  `;
  for (const row of jira) {
    if (row.author?.trim()) {
      record(row.author, row.project_id, row.jira_key_prefix, "reporter", row.id, row.source_date, `Reporter of ${row.title}`, "source_items.author (jira)");
    }
    const assignee = row.body_assignee?.trim();
    if (assignee && assignee !== "unknown" && assignee !== "unassigned") {
      record(assignee, row.project_id, row.jira_key_prefix, "assignee", row.id, row.source_date, `Assignee: ${assignee} — ${row.title}`, "jira body 'Assignee:' line");
    }
  }

  // --- Signal 4a: Granola transcript participants ---
  const granola = await sql<
    { id: number; project_id: number | null; title: string; source_date: string; participants: string[] | null }[]
  >`
    SELECT id, project_id, title, source_date, metadata->'participants' AS participants
    FROM source_items WHERE source_type = 'granola' AND metadata ? 'participants' ORDER BY id
  `;
  // A company-wide meeting (all-hands, whole-engineering daily) says nothing
  // about project membership, so it is recorded under a distinct weak role.
  const BROADCAST_PARTICIPANT_THRESHOLD = 20;
  for (const row of granola) {
    const participants = row.participants ?? [];
    const broadcast = participants.length >= BROADCAST_PARTICIPANT_THRESHOLD;
    for (const participant of participants) {
      record(
        participant,
        row.project_id,
        null,
        broadcast ? "broadcast_meeting_attendee" : "meeting_participant",
        row.id,
        row.source_date,
        `Participant in “${row.title}” (${participants.length} participants)`,
        "granola metadata.participants"
      );
    }
  }

  // --- Signal 4b: Calendar attendees and organizer (emails) ---
  const calendar = await sql<
    { id: number; project_id: number | null; title: string; source_date: string; organizer: string | null; attendees: string[] | null }[]
  >`
    SELECT id, project_id, title, source_date,
           metadata->>'organizer' AS organizer, metadata->'attendees' AS attendees
    FROM source_items WHERE source_type = 'calendar' ORDER BY id
  `;
  for (const row of calendar) {
    if (row.organizer) {
      record(row.organizer, row.project_id, null, "meeting_organizer", row.id, row.source_date, `Organizer of “${row.title}”`, "calendar metadata.organizer");
    }
    for (const attendee of row.attendees ?? []) {
      record(attendee, row.project_id, null, "meeting_attendee", row.id, row.source_date, `Attendee of “${row.title}”`, "calendar metadata.attendees");
    }
  }

  // --- Signal 5: Gmail sender (stored in author; metadata.from does not exist) ---
  const gmail = await sql<
    { id: number; author: string | null; project_id: number | null; title: string; source_date: string }[]
  >`
    SELECT id, author, project_id, title, source_date
    FROM source_items WHERE source_type = 'gmail' AND author IS NOT NULL ORDER BY id
  `;
  for (const row of gmail) {
    record(row.author as string, row.project_id, null, "email_sender", row.id, row.source_date, `Sender of “${row.title}”`, "source_items.author (gmail)");
  }

  // --- Figma comment authors ---
  const figma = await sql<
    { id: number; author: string | null; project_id: number | null; title: string; source_date: string }[]
  >`
    SELECT id, author, project_id, title, source_date
    FROM source_items WHERE source_type = 'figma' AND author IS NOT NULL ORDER BY id
  `;
  for (const row of figma) {
    record(row.author as string, row.project_id, null, "figma_commenter", row.id, row.source_date, `Figma comment author on “${row.title}”`, "source_items.author (figma)");
  }

  // --- Legacy projects.people arrays ---
  const legacy = await sql<{ id: number; name: string; people: string[]; jira_keys: string[] }[]>`
    SELECT id, name, people, jira_keys FROM projects WHERE jsonb_array_length(people) > 0 ORDER BY id
  `;

  // Collapse to one row per (person, project, role), keeping the newest evidence.
  const collapsed = new Map<string, MembershipRow & { occurrences: number }>();
  for (const row of membership) {
    const key = `${normalizePersonName(row.name)}|${row.projectName}|${row.role}`;
    const existing = collapsed.get(key);
    if (!existing) {
      collapsed.set(key, { ...row, occurrences: 1 });
      continue;
    }
    existing.occurrences += 1;
    if (row.evidenceDate > existing.evidenceDate) {
      existing.evidenceSourceId = row.evidenceSourceId;
      existing.evidenceDate = row.evidenceDate;
      existing.evidenceQuote = row.evidenceQuote;
    }
  }

  const unresolvedCollapsed = new Map<string, UnresolvedRow & { occurrences: number }>();
  for (const row of unresolved) {
    const key = `${normalizePersonName(row.raw)}|${row.reason}|${row.signal}`;
    const existing = unresolvedCollapsed.get(key);
    if (!existing) unresolvedCollapsed.set(key, { ...row, occurrences: 1 });
    else existing.occurrences += 1;
  }

  process.stdout.write(
    JSON.stringify(
      {
        rawMembershipRows: membership.length,
        collapsedMembershipRows: collapsed.size,
        rawUnresolvedRows: unresolved.length,
        collapsedUnresolvedRows: unresolvedCollapsed.size,
        membership: [...collapsed.values()].sort(
          (a, b) =>
            a.projectName.localeCompare(b.projectName) ||
            a.name.localeCompare(b.name) ||
            a.role.localeCompare(b.role)
        ),
        unresolved: [...unresolvedCollapsed.values()].sort(
          (a, b) => b.occurrences - a.occurrences || a.raw.localeCompare(b.raw)
        ),
        legacyPeopleArrays: legacy.map((project) => ({
          projectId: project.id,
          projectName: project.name,
          jiraKeys: project.jira_keys,
          people: project.people.map((name) => {
            const resolution = resolvePerson(name);
            return {
              name,
              status: resolution.status,
              rosterName: resolution.status === "roster" ? resolution.person.name : null,
            };
          }),
        })),
      },
      null,
      2
    )
  );
  await sql.end();
}

main().catch(async (error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
