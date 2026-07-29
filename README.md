# Worklight — Daily Work Operator

A local-first app for one person that answers a single question each morning:
what to do first, why it matters, the next concrete action, and how you'll know
it's truly done.

Worklight syncs read-only signals from Granola, Gmail, Google Calendar, Google
Drive, Jira, Confluence, Figma, GitHub, Discord, and local git repositories into
a local PostgreSQL database. Deterministic ranking runs before AI generation, so
every priority and report statement stays traceable to immutable evidence.

## Stack

- **Next.js 16** (App Router) with **React 19** and TypeScript
- **Tailwind v4** plus per-component CSS Modules, **HeroUI**, Framer Motion
- **PostgreSQL** through **Drizzle ORM** — local via Docker, hosted via Neon
- **Inngest** for the background sync pipeline and stale-run recovery
- A central **LLM router** (`src/lib/llm/router.ts`) in front of OpenAI,
  Anthropic, Groq, and local OpenAI-compatible models. Nothing calls a provider
  directly.
- **Zod** for schema-bound model output and environment validation

## Requirements

PostgreSQL is the only supported runtime database. `DATABASE_URL` must be set or
the app refuses to start. SQLite is no longer supported at runtime; existing
SQLite data can be moved over with `npm run db:migrate:sqlite-to-postgres`.

## Getting started

```bash
npm install
npm run docker:pg:up        # local PostgreSQL on port 5433
npm run db:pg:migrate       # apply migrations from drizzle/postgres
npm run dev                 # Next.js + the Inngest dev server together
```

Add `DATABASE_URL` to `.env.local` so the app and Drizzle Studio agree on one
database:

```
DATABASE_URL=postgresql://worklight:worklight@127.0.0.1:5433/worklight
```

Then open [http://localhost:3000](http://localhost:3000). See
[docs/local-postgres-setup.md](docs/local-postgres-setup.md) and
[docs/local-inngest-setup.md](docs/local-inngest-setup.md) for the longer setup
notes.

## Project structure

```
src/
  app/          Pages and API routes (the only UI/HTTP boundary)
  components/   Reusable UI: TaskCard, EvidencePanel, ConfidenceBadge, ...
  domain/       Core types (WorkTask, SourceItem, Evidence, SyncRun, ...) — no I/O
  services/     CRUD + domain logic the UI talks to — the only layer touching the db
  lib/
    connectors/ One isolated module per external source, read-only
    llm/        The central router, providers, prompts, redaction
    tasks/      Extraction, merging, ranking, confidence, verification
    dailyBrief/ Composing the Today view from ranked tasks
  inngest/      Background functions (syncMyDay, recoverStaleSyncRuns)
  db/           Drizzle schema, connection, query helpers
```

UI code never imports a connector or an SDK directly — it talks to `services/`,
which is the only layer that touches the database.

## Pages

Primary navigation is **Today**, **Projects**, **Knowledge**, **How we decide**,
and **Settings**. Settings is a hub linking to Automation (`/schedule`), Report
history (`/reports`), Source health (`/sources`), and the Trust trail
(`/audit`). Task detail lives at `/tasks/[id]`, with per-correction views under
`/tasks/[id]/corrections/[index]`.

Every task surface shows the same three pillars: the evidence that justifies the
task, the single next action, and the done criteria. Ambiguous items are routed
to an explicit **Unclear** state instead of being guessed into the queue.

## Sync my day

"Sync my day" runs the ingestion pipeline as an Inngest function (`sync-my-day`)
and reports progress per provider. A run moves through `running` and ends in
`completed`, `partially_completed`, `failed`, or `cancelled`; requesting a stop
puts it in `cancelling` first. One provider failing degrades the run to
`partially_completed` with visible source health rather than hiding the gap.

The pipeline fetches incrementally per connector cursor, hashes and versions
source content, extracts tasks and knowledge through the LLM router, merges
extracts onto existing tasks deterministically, scores priority, and validates
that every claim cites evidence.

Work tasks carry a status of `now`, `next`, `later`, `waiting`, `tomorrow`,
`unclear`, or `done`, plus `priorityScore`, `confidence`, `nextAction`, and
`doneCriteria`. A status the user sets by hand is never overwritten by the
planner.

## Hydra report operator

Hydra is the second, report-oriented pipeline. It creates a morning report at
09:30 and an evening report at 19:15 on weekdays in `Europe/Belgrade`. Schedules
can be enabled, disabled, or rescheduled from the Schedule page, and **Run now**
starts the same pipeline manually.

Reports are schema-bound (`hydraReportSchema`) and always contain these
sections: today first, after that, directly told to you, blocked, Jira state,
source conflicts, suggested message, and Figma audit. Every action item cites
the evidence it came from.

### HTTP endpoints

- `POST /api/day/sync` — start a sync run
- `GET /api/day/sync/:id` — poll a run; `POST /api/day/sync/:id/cancel` stops it
- `POST /api/reports/run` — enqueue a manual morning or evening report run
- `GET /api/reports/run/:id` — poll run state and retrieve its report
- `POST /api/reports/run/:id/execute` — execute an enqueued run
- `GET/PATCH /api/hydra/config` — report configuration and source priority
- `PATCH /api/hydra/schedules/:id` — update a schedule
- `GET /api/cron/hydra` — schedule tick used by `vercel.json`
- `POST /api/reports/:id/feedback` — save report feedback

For hosted scheduling, set `CRON_SECRET` and have the platform call the cron
endpoint every 15 minutes.

## Data model

Schema lives in `src/db/schema.ts`; each table has a matching CRUD module in
`src/services/`.

- **`projects`** — name, description, and matching hints (`keywords`, `people`,
  `jiraKeys`, `repoPaths`, `figmaFileKeys`) used to route incoming signals
- **`source_items`** — any ingested signal (transcript, email, meeting, ticket,
  PR, Figma comment, ...), updated in place when the external source changes
- **`work_tasks`** — the daily queue, with confidence components and ownership
  and conflict decisions the user has made
- **`evidence`** / **`evidence_relations`** — link a task back to the sources
  that justify it
- **`knowledge_items`** / **`knowledge_embeddings`** — newest learnings tied to
  their source; project linkage is optional
- **`verification_reports`** — the record of checking done criteria against
  reality; `verdict` is `done | mostly_done | missing_work | cannot_verify`
- **`sync_runs`** / **`sync_provider_runs`** / **`sync_cursors`** — run history,
  per-provider outcome, and incremental cursors
- **`people`** / **`person_aliases`** — identity resolution across sources
- **`ingestion_rules`** — user rules that filter or route incoming signals
- **`connections`** — status and sync metadata for read-only integrations
- **`llm_telemetry`** / **`audit_logs`** — what was sent to a model and what the
  app decided, for the Trust trail

## Commands

- `npm run dev` — Next.js and the Inngest dev server together
- `npm test` — the full suite (Node's test runner via `tsx`)
- `npm run lint` — ESLint plus the CSS architecture check
- `npm run db:generate` — new migration after editing `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations against `DATABASE_URL`
- `npm run db:pg:migrate` — start Docker PostgreSQL and migrate it
- `npm run db:studio` — browse the database in Drizzle Studio
- `npm run docker:pg:up` / `docker:pg:down` — local PostgreSQL lifecycle

## Notes

- Connectors are read-only. Any write to an external system requires an explicit
  confirmation for that specific action, in the moment it happens.
- API keys are saved to `data/secrets.json` and `data/connection-secrets.json`
  (both gitignored) and are never returned to the browser except as a masked
  preview.
- Google Calendar needs its own read-only connection so its OAuth grant stays
  scoped separately from Gmail.
- The AI-facing rules the app is built against live in `.cursor/rules/`, and a
  code-derived description of the current implementation is in
  [docs/current-app-architecture.md](docs/current-app-architecture.md).
