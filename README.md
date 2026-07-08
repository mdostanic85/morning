# Morning — Daily Work Operator

A local-first app that tells you what to do first, why it matters, the next
concrete action, and how you'll know it's done.

This is the MVP scaffold: Next.js + TypeScript + Tailwind on top of a local
SQLite database, with no external integrations wired up yet.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind v4)
- **SQLite** via `better-sqlite3`, accessed through **Drizzle ORM**
- All data lives in `data/morning.db` — nothing leaves your machine

## Getting started

```bash
npm install
npm run db:migrate   # create data/morning.db from the schema
npm run db:seed      # optional — adds a few example tasks/projects/sources
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/          Pages and API routes (the only UI/HTTP boundary)
  components/   Reusable UI: TaskCard, ProjectCard, EvidencePanel, ...
  domain/       Core types (Project, SourceItem, WorkTask, Evidence, ...) — no I/O
  services/     CRUD + domain logic the UI talks to — the only thing that touches the db
  db/           Drizzle schema, connection, seed script, and seed verification script
```

Pages: **Today** (the daily queue), **Projects**, **Inbox** (raw source items —
paste a transcript here), **Knowledge** (search over ingested source items), and
**Settings** (OpenAI / Anthropic API keys).

## Data model

Seven tables, defined in `src/db/schema.ts`:

- **`projects`** — name, description, and matching hints (`keywords`, `people`,
  `jiraKeys`, `repoPaths`, `figmaFileKeys`) used to route incoming signals.
- **`source_items`** — any ingested signal (transcript, email, ticket, PR, ...),
  connector-agnostic. `manual_transcript` is the only source type populated today.
- **`work_tasks`** — the daily queue. `status` is one of
  `now | next | later | waiting | tomorrow | unclear | done`, plus `priorityScore`,
  `confidence`, `reason`, `nextAction`, and `doneCriteria`.
- **`evidence`** — links a task back to the source item(s) that justify it.
- **`knowledge_items`** — durable facts extracted from sources (requirements,
  decisions, open questions, risks, deadlines, stakeholder preferences,
  acceptance criteria) that outlive any single task.
- **`verification_reports`** — the record of checking a task's done criteria
  against reality; `verdict` is `done | mostly_done | missing_work | cannot_verify`.
- **`connections`** — status of external integrations once they exist (Gmail,
  Jira, GitHub, ...); unused until a real connector is wired up.

Each table has a corresponding CRUD module in `src/services/` (e.g.
`projects.ts`, `workTasks.ts`, `evidence.ts`).

## Database commands

- `npm run db:generate` — generate a new migration after editing `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations
- `npm run db:seed` — reset and reseed with example data (1 project, 1 source
  item, 3 tasks)
- `npm run db:verify` — sanity-check that seed data loaded (prints row counts
  + a sample row per table, exits non-zero if empty)
- `npm run db:studio` — open Drizzle Studio to browse the local database

## Notes

- API keys are saved to `data/secrets.json` (gitignored, `chmod 600`) and are
  never returned to the browser except as a masked preview.
- LLM extraction, connectors (Gmail, Jira, Confluence, Granola, GitHub, Figma,
  Discord, git) are not implemented yet — this scaffold only stores what you
  paste manually.
