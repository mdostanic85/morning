# Daily Work Operator — Handoff Notes

Purpose: give a new agent (Codex) everything needed to keep working on this
repo without re-discovering context. Written after inspecting the actual
codebase on 2026-07-08 — not from memory.

## 0. What this app is (do not violate these constraints)

Local-first personal work app for a single user. On open, it tells the user:
what to do first, why it matters, the next concrete action, and how they'll
know it's truly done. It is explicitly **not** a team PM tool (no sprints, no
assignment, no dashboards/roadmaps).

Full rules live in `.cursor/rules/*.mdc` and apply to every change:

- **`product.mdc`** — every task must carry Evidence, Next action, Done
  criteria. Ambiguous ownership/requirements go to an explicit **Unclear**
  bucket instead of being guessed.
- **`architecture.mdc`** — local-first (SQLite, not a remote DB). Every
  external integration is an isolated connector behind a shared interface;
  UI never imports a connector SDK directly. All connectors default to
  read-only scopes. **All** LLM calls go through one central router — no
  feature/connector calls a provider API directly. Secrets only ever touch
  server-side code.
- **`ai-safety.mdc`** — no silent writes to external systems (explicit
  per-action user confirmation required for any write). AI-generated tasks
  must always link to evidence — no evidence, no display (route to Unclear
  instead). LLM must not guess ownership/scope under uncertainty.
- **`ui.mdc`** — minimal, single-view-first UI. Every task card must show its
  three pillars (evidence, next action, done criteria) — never hide any of
  them. Unclear items are visually distinct. Any UI action that writes
  externally needs an explicit confirmation step. Prefer plain typography
  over new widgets.

## 1. Repo / environment state

- **Not yet pushed anywhere new** beyond an initial GitHub repo created at
  `https://github.com/mdostanic85/morning` (private).
- Local git branch right now: **`step-7-manual-transcript-import`** (already
  created, no commits on it yet beyond the initial commit inherited from
  `main`).
- `git log`: single commit `27eaa91` — "Initial commit: Daily Work Operator
  MVP scaffold." (contains everything described below, i.e. Steps 0–6 were
  all part of the first commit; there is no per-step commit history).
- `npx tsc --noEmit` and `npm run lint` both pass clean as of this
  inspection.
- Local SQLite DB at `data/morning.db` (gitignored) is migrated and seeded
  (1 project, 1 source item, 3 tasks, 3 evidence rows, 1 knowledge item —
  see `npm run db:seed` / `npm run db:verify`).
- API keys: none configured in this environment (`data/secrets.json` exists
  but is `{}`); real LLM calls will fail with `missing_api_key` until a key
  is set via env var (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) or the
  Settings page.

## 2. Stack

- Next.js App Router (TypeScript, Tailwind v4), `next dev`/`build` via
  Turbopack.
- SQLite via `better-sqlite3`, accessed only through Drizzle ORM.
- Zod for all LLM output validation.
- No test framework wired up yet (no Jest/Vitest). Verification so far has
  been manual: typecheck, lint, build, `db:verify`, and one-off temporary API
  routes used to smoke-test server-only modules, always deleted afterward.

## 3. Folder structure

```
src/
  app/            Pages + API routes — the only UI/HTTP boundary
  components/     TaskCard, ProjectCard, EvidencePanel, IngestForm, ...
  domain/         Plain types (Project, SourceItem, WorkTask, Evidence, KnowledgeItem, VerificationReport, Connection) — no I/O
  services/       CRUD + domain logic — the ONLY layer that touches the db (all files start with "server-only")
  db/             Drizzle schema, connection, seed + verify scripts
  lib/llm/        Central LLM router, provider adapters, prompts/*
  lib/tasks/      Orchestrators that combine LLM router output + services (extractor.ts so far)
drizzle/          Generated SQL migrations + snapshots
.cursor/rules/    Product/architecture/ai-safety/ui rules (see §0)
```

Import boundary already enforced by convention: `db/client.ts` and every
`services/*.ts` file starts with `import "server-only"`, so accidental
client-side imports fail the build. Standalone Node scripts (seed, verify)
import `db/connection.ts` directly instead, since that file has no
`server-only` guard.

## 4. Data model — `src/db/schema.ts` (7 tables)

| Table | Key columns | Notes |
|---|---|---|
| `projects` | `name`, `description`, `keywords[]`, `people[]`, `jiraKeys[]`, `repoPaths[]`, `figmaFileKeys[]` | Matching hints for routing incoming signals to a project. |
| `source_items` | `projectId?`, `sourceType` (enum, see below), `sourceExternalId?`, `title`, `body`, `author?`, `sourceDate`, `url?`, `metadata (json)?` | Connector-agnostic raw signal. `manual_transcript` is the only type actually produced today. |
| `work_tasks` | `projectId?`, `title`, `status` (enum: `now\|next\|later\|waiting\|tomorrow\|unclear\|done`), `priorityScore?`, `confidence?`, `reason`, `nextAction`, `doneCriteria[]`, `dueDate?`, `owner?`, `waitingOn?` | The daily queue. `reason`/`nextAction`/`doneCriteria` are NOT NULL — every task must have them. |
| `evidence` | `taskId`, `sourceItemId`, `quote?`, `summary`, `sourceDate`, `url?` | Links a task back to the source(s) that justify it. |
| `knowledge_items` | `projectId?`, `type` (enum: `requirement\|decision\|open_question\|risk\|deadline\|stakeholder_preference\|acceptance_criteria`), `title`, `content`, `sourceItemId?`, `confidence?` | Durable facts that outlive a single task. |
| `verification_reports` | `taskId`, `verdict` (enum: `done\|mostly_done\|missing_work\|cannot_verify`), `matches[]`, `missing[]`, `risks[]`, `recommendedNextAction`, `confidence?` | Not used by any code path yet — schema only, for the future `delivery_verification` job. |
| `connections` | `provider`, `status` (`connected\|disconnected\|error`), `authType`, `scopes[]`, `metadata?` | Not used by any code path yet — schema only, for future real connectors. |

Domain types mirroring each table 1:1 live in `src/domain/*.ts` (`Project`,
`SourceItem`, `WorkTask`, `Evidence`, `KnowledgeItem`, `VerificationReport`,
`Connection`). Each has a `New*` insert type and, where relevant, a `*Patch`
update type. `src/domain/workTask.ts` also exports `hasRequiredPillars()` —
the one invariant every task-creation path (manual or LLM) must satisfy
(non-empty `nextAction` + at least one `doneCriteria`).

`SOURCE_TYPES` (in both `schema.ts` and `domain/sourceItem.ts`):
`manual_transcript | gmail | jira | confluence | granola | github | figma | discord | git`.
Only `manual_transcript` has an actual producer today.

Services (`src/services/*.ts`) — one CRUD module per table, e.g.:
- `sourceItems.ts` — `createSourceItem`, `getSourceItems`, `getSourceItemById`, `searchSourceItems`, `updateSourceItem`, `deleteSourceItem`, and **`ingestManualTranscript`** (see §7).
- `workTasks.ts` — `createWorkTask`, `getTodayQueue` (grouped by status, sorted by `priorityScore`), `getWorkTaskById`, `getOpenTasksForProject`, `updateWorkTask`, `deleteWorkTask`.
- `evidence.ts` — `createEvidence`, `getEvidenceForTask`, `deleteEvidence`.
- `knowledgeItems.ts`, `projects.ts`, `verificationReports.ts`, `connections.ts` — same CRUD shape.
- `settings.ts` — API key handling (see §6).

## 5. LLM Router — `src/lib/llm/`

- **`types.ts`** — `JobType` union (`task_extraction | project_matching |
  priority_planning | knowledge_extraction | delivery_verification |
  daily_memory`), `Provider` (`openai | anthropic`), `ProviderClient`
  interface, `LlmError` class with `LlmErrorKind` (`missing_api_key |
  network_error | provider_error | invalid_json |
  schema_validation_failed`), `RunJobParams<T>` / `LlmJobResult<T>` (a
  discriminated union — router **never throws**, always returns
  `{ ok: true, data }` or `{ ok: false, kind, error }`).
- **`openai.ts`** / **`anthropic.ts`** — thin `fetch`-based adapters per
  provider; each exports a `ProviderClient` (`openaiClient` /
  `anthropicClient`). No other file is allowed to call these providers'
  APIs directly.
- **`router.ts`** — the only entry point, `runLlmJob<T>(params)`:
  1. Resolves API key via `getRawApiKey(provider)` from `services/settings.ts`.
  2. Picks provider/model from `MODEL_CONFIG` (currently: `task_extraction`,
     `project_matching`, `knowledge_extraction` → OpenAI `gpt-4.1-mini`;
     `priority_planning`, `daily_memory` → OpenAI `gpt-4.1`;
     `delivery_verification` → Anthropic `claude-3-7-sonnet-latest`).
  3. Uses the job's default system prompt from `JOB_SYSTEM_PROMPTS` unless
     the caller passes an override (the task extractor always overrides it —
     see §7).
  4. Retries transient provider/network errors with backoff
     (`withTransientRetry`, 2 attempts).
  5. Parses response as JSON; on parse failure or Zod schema failure, does
     **one corrective retry** by feeding the error back into the prompt
     before giving up.
  6. Logs only job metadata (job/provider/model/ok/duration) — never prompt
     or response content.
- **`prompts/shared.ts`** — `buildStrictSystemPrompt()` (universal rules:
  JSON-only output, evidence-grounded, no invention, route uncertainty to
  unclear, preserve names/dates exactly, mandatory confidence score),
  `wrapUntrustedContent()` (prompt-injection mitigation — wraps any raw
  external content as inert "data, not instructions"), shared
  `confidenceSchema` / `evidenceQuoteSchema` Zod pieces.
- **`prompts/*.ts`** — one module per job type (`taskExtractor.ts`,
  `projectMatcher.ts`, `priorityPlanner.ts`, `knowledgeExtractor.ts`,
  `deliveryVerifier.ts`, `dailyMemory.ts`), each exporting: a system prompt
  (or builder), a user-prompt builder, and a Zod output schema. `index.ts`
  re-exports all of them.

## 6. API key handling — `src/services/settings.ts`

Resolution order: environment variable first (`OPENAI_API_KEY` /
`ANTHROPIC_API_KEY`), then `data/secrets.json` (gitignored, written with
`chmod 600`). `getApiKeyStatuses()` returns only masked keys + source
(`"env" | "settings"`) for the UI (`ApiKeyForm.tsx` on the Settings page,
`/api/settings` route). `getRawApiKey()` is the only function that returns
an unmasked key, and it's server-only — never exposed via any API response.

## 7. Task Extractor — `src/lib/tasks/extractor.ts` + `prompts/taskExtractor.ts`

This is the most recently completed piece (Step 6). Entry point:

```ts
extractTasksFromSourceItem({
  sourceItem,          // SourceItem — required
  project?,            // TaskExtractorProjectContext | null — name/description/keywords/people, for ownership/terminology judgment ONLY, never a task source
  currentUserName?,    // string | null — who counts as "the user" for ownership rules
  mock?,               // boolean — bypasses the LLM call entirely; also settable via TASK_EXTRACTOR_MOCK=true env var
}): Promise<TaskExtractionRunResult>
```

Behavior:
- Calls `runLlmJob({ jobType: "task_extraction", ... })` with a
  request-tailored system prompt from `buildTaskExtractorSystemPrompt()`
  (bakes in `currentUserName` for ownership judgment) and
  `buildTaskExtractorUserPrompt()` (embeds source + optional project
  context, wraps source body via `wrapUntrustedContent`).
- Output schema (`taskExtractionOutputSchema`) covers **tasks** plus four
  extra knowledge-signal buckets: **decisions, openQuestions, risks,
  deadlines, acceptanceCriteria** — each entry requires ≥1 verbatim evidence
  quote and its own confidence score; empty arrays are valid and expected
  when nothing of that kind exists (never invented to fill a bucket).
- Task-level rules enforced by prompt + Zod `.superRefine`:
  - `status: "actionable" | "waiting" | "unclear"`; `waitingOn` required iff
    `waiting`, `unclearReason` required iff `unclear`.
  - Every task requires `nextAction`, `doneCriteria[]` (≥1), and ≥1 evidence
    quote — tasks without a supporting quote must not be emitted at all.
  - Ownership: if a named owner isn't clearly `currentUserName`, confidence
    is lowered; if someone else sounds responsible, status must be
    `waiting`/`unclear`, never `actionable`.
  - Vague tasks (no derivable concrete `nextAction`/`doneCriteria`) →
    `unclear`, not invented specificity.
- Persistence: `tasks` → `createWorkTask` + `createEvidence` per task.
  `actionable` maps to work-task status `"later"` (not `"now"`/`"next"` —
  prioritization is explicitly deferred to the not-yet-built
  `priority_planning` job). `unclearReason` has no dedicated DB column, so
  it's folded into `reason` as `"<reason> (Unclear: <unclearReason>)"`.
  The five knowledge buckets → `createKnowledgeItem` with matching `type`.
- Every failure mode (`missing_api_key`, `invalid_json`,
  `schema_validation_failed`, etc.) returns `{ ok: false, error }` with
  **nothing** written to the DB — never a partial save.
- **Mock mode**: returns one deterministic, schema-valid `unclear` task
  (quoting the real source body) without any network call or API key — used
  to test the full save pipeline. Verified working in this session via a
  temporary (now-deleted) `/api/dev-extractor-smoke-test` route.

## 8. What already exists relevant to Step 7 (manual transcript import) — READ CAREFULLY

**Important finding:** raw ingestion of a pasted transcript into a
`SourceItem` **already exists and works** — it predates this handoff and is
not something Step 7 needs to build from scratch. Specifically:

- `src/services/sourceItems.ts` → `ingestManualTranscript({ title, body,
  projectId? })`:
  - Hashes `body` (`sha256`) and stores it in `metadata.contentHash`.
  - Dedupes: if a `manual_transcript` row with the same content hash already
    exists, returns `{ sourceItem, deduped: true }` instead of inserting
    again.
  - Otherwise creates a new `source_items` row (`sourceType:
    "manual_transcript"`, `sourceDate: new Date().toISOString()`) and
    returns `{ sourceItem, deduped: false }`.
  - Explicit doc-comment: *"This is the manual-transcript connector's only
    job — it never touches the LLM router or creates tasks."*
- `src/app/api/source-items/route.ts` — `POST` handler: validates `body` is
  a non-empty string, calls `ingestManualTranscript`, returns the result
  as-is (`{ sourceItem, deduped }`).
- `src/components/IngestForm.tsx` — client form (title optional + textarea),
  POSTs to `/api/source-items`, calls `router.refresh()` on success. It
  **explicitly says in the UI copy**: *"Stored as-is. Extraction into tasks
  isn't wired up yet."*
- `src/app/inbox/page.tsx` — renders `IngestForm` plus a list of all
  `source_items` (title, `SourceBadge`, body preview, date). This is the
  "Inbox" page in the nav.

**What Step 7 therefore actually still needs** (the gap): connecting this
already-working ingestion path to the already-working Task Extractor from
Step 6, plus giving the user visibility/control over that step per the UI
rules (extraction is not free of confirmation implications — see §9 risks).
Do not re-build ingestion; wire it to extraction and surface the result.

## 9. Confirmed implemented vs. missing vs. risky

### Implemented (verified in this session — typecheck/lint clean, files read)

- **Step 0 — Cursor rules**: `.cursor/rules/{product,architecture,ai-safety,ui}.mdc`, all present and substantive.
- **Step 1/2 — MVP architecture + app scaffold**: Next.js App Router app, Tailwind, pages for Today (`app/page.tsx`), Projects (`app/projects/page.tsx` + `[id]/page.tsx`), Inbox (`app/inbox/page.tsx`), Knowledge (`app/knowledge/page.tsx`), Settings (`app/settings/page.tsx`), shared `NavBar`. All list/detail pages forced dynamic (`export const dynamic = "force-dynamic"`) so they read live SQLite state.
- **Step 3 — Database schema**: `src/db/schema.ts` (7 tables, described in §4), migrated (`drizzle/0000_odd_nicolaos.sql`) and seeded; `db:verify` passes.
- **Step 4 — LLM router**: `src/lib/llm/router.ts` + `types.ts` + `openai.ts`/`anthropic.ts`, described in §5. Structured errors, retries, corrective re-prompting all present.
- **Step 5 — Prompt modules**: all six job types have a dedicated prompt module under `src/lib/llm/prompts/` wired into `router.ts`'s `JOB_SYSTEM_PROMPTS`/`MODEL_CONFIG`.
- **Step 6 — Task Extractor**: `src/lib/tasks/extractor.ts`, described in §7, including mock mode. Manually smoke-tested end-to-end in this session (mock path created real DB rows; real path correctly failed with `missing_api_key` rather than throwing).

### Missing (not started)

- **Step 7 proper**: wiring `ingestManualTranscript` output → `extractTasksFromSourceItem`, and any UI for triggering/showing extraction from the Inbox.
- `project_matching`, `priority_planning`, `knowledge_extraction`,
  `delivery_verification`, `daily_memory` jobs have prompts + schemas
  (Step 5) but **no orchestrator module** analogous to
  `lib/tasks/extractor.ts` calls them yet. `getTodayQueue()` sorts by
  `priorityScore`, but nothing currently sets `priorityScore` on a task
  except manual seed data — there's no code path that ever calls the
  `priority_planning` job.
- `verification_reports` and `connections` tables exist in the schema with
  zero rows and no service call sites beyond basic CRUD — expected, since
  no real connector or delivery-verification flow exists yet.
- No automated tests (no test runner configured at all).

### Risky / unclear (worth flagging, not necessarily blocking Step 7)

- **README.md is stale**: it still says *"LLM extraction, connectors ... are
  not implemented yet"* — true for connectors, no longer true for LLM
  extraction (Step 6 exists). Low risk, but will mislead a fresh reader who
  doesn't check the actual code; worth a doc fix at some point (not part of
  Step 7 per the user's "don't refactor unrelated files" instruction, but
  flagging it here since it's exactly the kind of drift this handoff doc is
  meant to prevent).
- **`ingestManualTranscript`'s dedupe scan is O(n) in Node** (`.all().find(...)`
  over every `manual_transcript` row) rather than an indexed/SQL-level
  lookup on `contentHash`. Fine at current scale (single user, local file),
  but worth knowing if Step 7 adds bulk import.
- **No UI confirmation step exists yet for triggering extraction.**
  `ui.mdc` requires "any UI control that triggers a write action ... show an
  explicit confirmation." Running the task extractor writes `WorkTask`/
  `Evidence`/`KnowledgeItem` rows — these are *local* writes (not to an
  external system), so `ai-safety.mdc`'s "no silent write actions" rule (which
  is scoped to *external* systems: Jira/GitHub/Gmail/git push/etc.) does not
  strictly require confirmation here. Treat this as a product judgment call
  for Step 7, not a pre-existing bug — decide explicitly whether triggering
  extraction should be automatic-on-ingest or a separate user-initiated
  action, and document the choice.
- **`extractTasksFromSourceItem` always re-runs extraction** — there's no
  guard today against calling it twice on the same `sourceItem` (e.g. if
  wired to auto-run on every ingest, a deduped/re-submitted transcript could
  still be worth guarding against double-extraction). Not yet an issue
  because nothing calls it from the ingest path yet.
- **Current git branch name** (`step-7-manual-transcript-import`) already
  anticipates this work but has no commits of its own yet — everything
  described above is still sitting on the single initial commit.

## 10. Step 7 implementation plan (manual transcript import → tasks)

Scope reminder: wire existing ingestion to existing extraction; do not build
new connectors, do not touch unrelated files, do not implement Steps 8+
(project matching, priority planning, knowledge extraction beyond what the
extractor already writes, delivery verification, daily memory).

1. **Decide + implement the trigger point** (product decision to make
   explicitly, see §9 risk): either (a) `ingestManualTranscript`'s caller
   (the `POST /api/source-items` route) calls `extractTasksFromSourceItem`
   right after a successful, non-deduped ingest, or (b) ingestion stays
   as-is and a separate explicit "Extract tasks" action/button triggers it
   per source item. Given `ui.mdc`'s minimalism preference and the fact this
   is a local (non-external) write, (a) is the simpler default — but confirm
   with the user before assuming, since `IngestForm`'s current copy
   ("Extraction into tasks isn't wired up yet") suggests the original intent
   may have been an automatic wire-up.
2. **Skip extraction on dedupe.** When `ingestManualTranscript` returns
   `deduped: true`, do not re-run extraction — the source item (and
   presumably its tasks) already exists.
3. **Resolve `project` context for the extractor call.** If the source item
   has a `projectId`, load the `Project` via `getProjectById` and map it to
   `TaskExtractorProjectContext` (name/description/keywords/people) before
   calling `extractTasksFromSourceItem`. If no project, pass `null`.
4. **Resolve `currentUserName`.** No user-identity concept exists anywhere
   in the app yet (no user table/setting). Needs a decision: either add a
   minimal single-user "your name" field to Settings (small, local-only,
   fits the single-user model) or pass `null` for now and accept the
   prompt's more conservative "no user name provided" ownership behavior.
   Prefer the smallest change that unblocks correct ownership handling.
5. **Surface the extraction result in the UI.** At minimum, the Inbox
   page/route response should let the user see what got created (e.g. "3
   tasks, 1 open question extracted" or link through to Today/Inbox detail).
   Must not violate `ui.mdc`: any tasks shown must still carry their
   evidence/next-action/done-criteria trio, and anything landing in
   `unclear` must be visually distinct — this should already be handled by
   existing `TaskCard`/Today page components, so verify rather than rebuild.
6. **Handle extraction failure gracefully in the UI.** `ok: false` results
   (e.g. `missing_api_key`) must not look like "no tasks found" — surface
   the actual error so the user knows to configure a key, without leaking
   secrets.
7. **Update `IngestForm.tsx` copy** once wired up — the current "Extraction
   into tasks isn't wired up yet" line will become false.
8. **Manual verification plan** (mirrors how Steps 4–6 were verified in this
   codebase so far — no test runner exists):
   - `npm run db:verify` before/after to confirm row counts change as
     expected.
   - A temporary, deleted-after-use dev API route (pattern already used
     twice in this repo, e.g. the removed
     `/api/dev-extractor-smoke-test`) to exercise the full
     ingest→extract→persist flow with `mock: true` (no API key needed) and
     confirm `deduped: true` skips extraction.
   - `npx tsc --noEmit` and `npm run lint` clean.
   - `npm run build` clean.
9. Keep the change scoped to: `src/app/api/source-items/route.ts`,
   `src/services/sourceItems.ts` (only if the trigger point needs to move
   there instead of the route), `src/components/IngestForm.tsx` (copy /
   result display), `src/app/inbox/page.tsx` (result display), and
   optionally `src/services/settings.ts` + a Settings UI field if
   `currentUserName` is added. Do not touch `lib/llm/*`, `lib/tasks/extractor.ts`,
   or the schema — Step 6's contract is already correct for this use case.
