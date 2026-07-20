# PostgreSQL + Inngest Migration Audit — Sync My Day

Audit of the current database and Sync My Day implementation in preparation for:

- local development with PostgreSQL;
- production deployment on Vercel with Neon PostgreSQL;
- local Inngest development;
- production Inngest workflows.

No code was changed. Every finding is labeled **Confirmed from code**, **Strong inference**, or **Unknown**.

---

## 1. Current database stack and exact files

**Confirmed from code**

| Layer | Implementation | Files |
|---|---|---|
| Driver | `better-sqlite3` | `package.json`, `src/db/connection.ts` |
| ORM | Drizzle (`drizzle-orm/better-sqlite3`) | `src/db/connection.ts`, `src/db/client.ts` |
| Schema | `sqliteTable` / SQLite column types | `src/db/schema.ts` |
| Config | `dialect: "sqlite"`, URL `./data/worklight.db` | `drizzle.config.ts` |
| Migrations | SQLite SQL `0000`–`0010` | `drizzle/*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/*_snapshot.json` |
| Runtime path | Fixed `data/worklight.db`; creates `data/` on boot; WAL + foreign_keys | `src/db/connection.ts` |
| App entry | Re-export only | `src/db/client.ts` |

**Confirmed from code — not in DB, but on same local FS**

- Briefing: `data/today-briefing.json` via `src/lib/tasks/todayBriefing.ts`
- Queue summary: `data/today-queue-summary.json` via `src/lib/tasks/prioritizer.ts`
- Secrets / LLM settings / OAuth / MCP / connection secrets under `data/` via `src/services/settings.ts`, `src/services/connectionSecrets.ts`, `src/lib/connectors/oauth.ts`, `src/lib/connectors/mcp/oauthProvider.ts`

**Confirmed from code — no Postgres/Neon/Inngest yet**

- No `DATABASE_URL` usage; no `inngest` dependency; Neon appears only as an optional peer of `drizzle-orm` in the lockfile, not app code.

---

## 2. Sync My Day execution path (≤12 steps)

**Confirmed from code**

1. UI (`SyncMyDayButton` in `TodayFilteredView` / `TodayWelcome`) `POST`s `/api/day/sync` (progress overlay is timer-simulated).
2. Route auto-approves pending extractions (`approveAllPendingExtractions`).
3. Loads connected providers from `connections` ∩ `CONNECTION_PROVIDERS`.
4. Runs project discovery (`discoverProjectsFromSignals`).
5. For each provider sequentially: `syncProvider` → connector `listItems` → `importConnectorSources`.
6. Import pipeline: dedupe by `(sourceType, sourceExternalId)` → insert/update `source_items` → project match → embeddings → task/knowledge extraction → persist.
7. Updates connection sync metadata (`lastSync`, counts, errors).
8. Backfills up to 8 unprocessed sources (`backfillUnextractedSources`).
9. Fetches Jira pending snapshot; optionally rediscovers projects if Jira wasn’t in the provider loop.
10. Rebuilds Today queue (`rebuildTodayQueue` → DB + `today-queue-summary.json`).
11. Builds Today briefing (`buildTodayBriefing` → `today-briefing.json`) + Jira-done / What’s New.
12. Returns aggregate JSON; UI toasts + `router.refresh()`.

---

## 3. Confirmed local-development assumptions

**Confirmed from code**

- Single-node Next process; DB is a local file at `data/worklight.db`.
- Migrations are manual (`npm run db:migrate`); nothing auto-migrates on boot.
- `better-sqlite3` sync API is used throughout services (`.get()` / `.all()` / `.run()` / sync `db.transaction`).
- Sync My Day is one blocking HTTP request doing all provider I/O + LLM work.
- LLM keys: env first, else `data/secrets.json`.
- OAuth/MCP state and briefing/queue artifacts assume a writable local `data/` directory.
- `WORKLIGHT_APP_URL` defaults to `http://localhost:3000` when unset.
- No app auth; any local caller can hit sync/mutation routes.

**Strong inference**

- Intended workflow is install → migrate → `npm run dev` on one machine with a persistent working directory (matches README).

---

## 4. Confirmed Vercel incompatibilities or risks

**Confirmed from code**

| Risk | Why |
|---|---|
| SQLite file DB | Hardcoded local path + `better-sqlite3` native module; not a hosted Neon/Postgres client. |
| Writable filesystem for core state | DB + briefing/queue/secrets/OAuth JSON all under `process.cwd()/data`. Ephemeral on serverless. |
| Long sync in one request | `/api/day/sync` runs discovery → all providers → extract → queue → briefing inline; no `maxDuration`, no job queue. |
| Client abort ≠ server cancel | UI `AbortController` only aborts fetch; server work continues. |
| Raw SQLite DDL at runtime | `ensureKnowledgeEmbeddingsTable()` runs SQLite `CREATE TABLE IF NOT EXISTS` SQL. |
| Sync Drizzle API | Services use sync SQLite executors; Neon/serverless Postgres is async. |
| Cron-only background hint | `vercel.json` schedules Hydra cron, not Sync My Day; no Inngest/serve route. |

**Strong inference**

- Production durability of `data/*` on Vercel is broken unless replaced; the architecture doc already marks that as unknown in deployment, and code has no alternate storage adapter.

**Unknown**

- Whether any Vercel project is currently deployed / which plan timeouts apply.
- Observed wall-clock duration of a full Sync My Day with real connectors + LLM.

---

## 5. Exact files that must change

### PostgreSQL compatibility

**Confirmed from code**

- `src/db/connection.ts`
- `src/db/schema.ts`
- `drizzle.config.ts`
- `package.json` / `package-lock.json`
- Existing SQLite migrations under `drizzle/` (replace or regenerate for Postgres)
- Sync DB call sites:
  `src/services/{sourceItems,workTasks,evidence,knowledgeItems,projects,connections,userProfile,dailyMemories,hydra,verificationReports,syncReviewReports}.ts`
  `src/lib/knowledge/{embeddings,search}.ts`
  `src/lib/imports/backfillExtractions.ts`
- Sync transactions: `src/services/{workTasks,evidence,knowledgeItems}.ts`

**Strong inference**

- `src/db/client.ts` stays a thin export but may gain env-based driver wiring comments/guards.

### Local PostgreSQL development

**Confirmed from code (must be remapped off fixed SQLite path)**

- `src/db/connection.ts` (read `DATABASE_URL`)
- `drizzle.config.ts` (Postgres dialect + credentials)
- `package.json` scripts (`db:migrate` / generate against Postgres)

**Strong inference — not present today, needed to make local PG practical**

- Env template / docs for `DATABASE_URL` (no `.env*` in repo today)
- Optional compose/local Postgres bootstrap (none in repo)

### Neon deployment

**Confirmed from code (must leave local-file assumptions)**

- `src/db/connection.ts` (Neon/serverless or pooled Postgres driver)
- `package.json` (add Neon/Postgres client deps; drop or gate `better-sqlite3`)
- Migration apply path used in CI/deploy (currently local `drizzle-kit migrate` only)

**Strong inference**

- Vercel env config for `DATABASE_URL` / Neon connection string (not in repo)
- Decision on whether briefing/secrets JSON also leave local FS (`todayBriefing.ts`, `prioritizer.ts`, `settings.ts`, OAuth secret files) — required for durable Neon+Vercel, even if “DB dialect” work alone isn’t enough

### Inngest integration

**Confirmed from code (no Inngest exists; these are the Sync My Day seams)**

- `src/app/api/day/sync/route.ts` (enqueue vs execute)
- `src/components/SyncMyDayButton.tsx` (status polling / completion UX)
- `package.json` (add `inngest`)
- New serve route (not present; typically `src/app/api/inngest/route.ts`)
- New function module(s) wrapping the current sync pipeline (`syncProvider`, backfill, queue, briefing)

**Strong inference**

- Possibly split helpers out of the route into a pure orchestrator module so Inngest steps can call them without HTTP coupling
- Hydra cron (`src/app/api/cron/hydra/route.ts`, `src/lib/hydra/scheduler.ts`, `vercel.json`) if “production Inngest workflows” includes scheduled Hydra, not only Sync My Day

---

## 6. Migration plan (small phases)

**Phase A — Inventory & contract freeze**
**Confirmed from code as prerequisite**
Freeze Sync My Day step list and identify every sync `.get()/.all()/.run()/transaction` call site and every `data/*.json` reader/writer.

**Phase B — Postgres schema + client (local only)**
**Confirmed from code**
Port `schema.ts` to `pgTable`, point `connection.ts` + `drizzle.config.ts` at `DATABASE_URL`, regenerate Postgres migrations, convert service DB APIs to async, remove SQLite-only DDL in embeddings.

**Phase C — Local Postgres developer path**
**Strong inference**
Document/run local Postgres, migrate empty DB, verify `db:migrate` + `npm run dev` + one Sync My Day against local PG.

**Phase D — Durable non-DB files decision**
**Confirmed from code that FS JSON exists; target store Unknown**
Choose where secrets, OAuth state, briefing, and queue summary live under Neon/Vercel (DB tables vs other durable store). Until this lands, Neon alone does not make Sync My Day production-safe.

**Phase E — Neon on Vercel**
**Strong inference**
Wire Neon client, set Vercel `DATABASE_URL`, run migrations against Neon, smoke-test read paths (Today) before long sync.

**Phase F — Inngest local**
**Confirmed seam from code**
Add Inngest serve route + function that runs today’s sync orchestrator in steps; change `/api/day/sync` to enqueue; update UI to poll/complete; run with Inngest Dev Server locally.

**Phase G — Inngest production**
**Strong inference**
Connect Inngest cloud to Vercel deployment; move long Sync My Day (and optionally Hydra schedules) off single request/cron timeouts; keep explicit user-triggered sync start.

**Phase H — Cutover / SQLite retirement**
**Unknown until data-migration choice**
Export existing `worklight.db` if needed, validate, remove `better-sqlite3` path.

---

## 7. Unknowns that must be resolved from code before implementation

| Unknown | Why it blocks |
|---|---|
| Full list of SQLite-specific SQL / pragmas / `db.run(sql\`...\`)` beyond embeddings | **Partially confirmed** (`embeddings.ts`); need exhaustive grep of raw SQL before PG cutover. |
| Exact async conversion surface outside `src/services` + knowledge/import helpers | **Confirmed set is large**; any missed `.get()/.all()` breaks build. |
| Whether Sync My Day should become multi-step Inngest (per provider / extract / plan) or one function | Code is monolithic in the route; step boundaries are logical only. |
| Target store for `today-briefing.json`, `today-queue-summary.json`, secrets, OAuth/MCP files | **Confirmed FS today**; Neon does not cover them. |
| Data migration requirement for existing local `worklight.db` | No export tooling in repo. |
| Whether Hydra cron is in scope for the same Inngest migration | Separate long-running path; only Sync My Day audited in detail here. |
| Driver choice implied by runtime | Code does not choose Neon serverless vs `postgres`/`pg` pool; must be decided against Vercel Fluid/Node constraints. |
| Real sync duration / timeout budget | No timing instrumentation or `maxDuration` in sync route. |
| Dual-dialect support vs hard switch | Current schema/config are SQLite-only; no adapter abstraction exists. |
