# Worklight — Daily Work Operator

A local-first app that tells you what to do first, why it matters, the next
concrete action, and how you'll know it's done.

The app syncs read-only work signals from Granola, Google Calendar, Drive, Jira,
Confluence, and Figma into a local SQLite database. Deterministic ranking runs
before AI generation, so every priority and report statement stays traceable to
immutable evidence.

## Stack

- **Next.js** (App Router, TypeScript, Tailwind v4)
- **SQLite** via `better-sqlite3`, accessed through **Drizzle ORM**
- Evidence, reports, run history, source health, and audit events live in
  `data/worklight.db`
- Report generation can call the model provider configured in Settings; source
  connectors remain read-only

## Getting started

```bash
npm install
npm run db:migrate   # create data/worklight.db from the schema
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
  db/           Drizzle schema and connection
```

Core pages are **Today**, **Reports**, **Sources**, **Schedule**, and **Audit**.
The existing **Projects**, **Knowledge**, and **Settings** workflows remain
available.

## Hydra report operator

Hydra creates a morning report at 09:30 and an evening report at 19:15 on
weekdays in `Europe/Belgrade`. Both schedules can be enabled, disabled, or
rescheduled from the Schedule page. **Run now** starts the same pipeline
manually.

Each run moves through these observable states:

`queued → fetching_sources → normalizing → ranking → generating → validating → delivering → completed`

Terminal alternatives are `partial`, `failed`, and `cancelled`. A core source
failure produces a partial report with visible source health rather than hiding
the gap.

The pipeline performs incremental source sync, content hashing and versioning,
deterministic scoring, conflict preservation, evidence validation, schema-bound
report generation, and idempotent delivery. Reports always contain the eight
sections defined in the architecture document:

1. What you did
2. What you do today
3. Next steps
4. Latest changes
5. Blockers and risks
6. Meetings
7. Jira snapshot
8. Figma changes

### HTTP endpoints

- `POST /api/reports/run` — enqueue a manual morning or evening run
- `GET /api/reports/run/:id` — poll run state and retrieve its report
- `POST /api/reports/run/:id/execute` — execute an enqueued run
- `GET/PATCH /api/hydra/config` — report configuration and source priority
- `PATCH /api/hydra/schedules/:id` — update a schedule
- `GET /api/cron/hydra` — schedule tick used by `vercel.json`
- `POST /api/reports/:id/feedback` — save report feedback

For hosted scheduling, configure `CRON_SECRET` and have the platform invoke the
cron endpoint every 15 minutes. Provider credentials and delivery settings are
configured through the existing Settings page.

## Data model

The original task/knowledge tables remain intact. Hydra adds workspace, task,
schedule, cursor, source-document, run, evidence, relation, report, delivery,
audit, and feedback tables in `src/db/schema.ts`.

- **`projects`** — name, description, and matching hints (`keywords`, `people`,
  `jiraKeys`, `repoPaths`, `figmaFileKeys`) used to route incoming signals.
- **`source_items`** — any ingested signal (transcript, email, meeting, ticket,
  PR, ...), updated in place when the external source changes.
- **`work_tasks`** — the daily queue. `status` is one of
  `now | next | later | waiting | tomorrow | unclear | done`, plus `priorityScore`,
  `confidence`, `reason`, `nextAction`, and `doneCriteria`.
- **`evidence`** — links a task back to the source item(s) that justify it.
- **`knowledge_items`** — newest learnings extracted from sources (requirements,
  decisions, open questions, risks, deadlines, stakeholder preferences,
  acceptance criteria), each tied to its source. Project linkage is optional.
- **`verification_reports`** — the record of checking a task's done criteria
  against reality; `verdict` is `done | mostly_done | missing_work | cannot_verify`.
- **`connections`** — status and sync metadata for read-only integrations.

Each table has a corresponding CRUD module in `src/services/` (e.g.
`projects.ts`, `workTasks.ts`, `evidence.ts`).

## Database commands

- `npm run db:generate` — generate a new migration after editing `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations (SQLite)
- `npm run db:studio` — open Drizzle Studio to browse the local database

Optional local PostgreSQL (Docker, pgvector-ready): see
[docs/local-postgres-setup.md](docs/local-postgres-setup.md). The app still uses
SQLite by default.

Optional Inngest (local Dev Server + Vercel production): see
[docs/local-inngest-setup.md](docs/local-inngest-setup.md).

## Notes

- API keys are saved to `data/secrets.json` (gitignored, `chmod 600`) and are
  never returned to the browser except as a masked preview.
- Task and knowledge extraction uses the model provider configured in Settings.
- Google Calendar requires a separate read-only Calendar connection so its
  OAuth grant stays scoped independently from Gmail.
