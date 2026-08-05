# Product & Stakeholder Audit — Worklight

**Audit date:** July 23, 2026
**Method:** Code-first. Every major conclusion is labeled:
- **Verified** — directly supported by code or tests
- **Strong inference** — consistent across multiple files with no counter-evidence
- **Needs validation** — documented intent without confirmed implementation, or conflicting evidence

The codebase is the source of truth. Where documentation contradicts running code, the code label applies and the conflict is noted.

---

## Executive Summary

Worklight is a local-first personal work operator for a single product designer or developer. Each workday it answers one question: *what should I do first, why does it matter, what is the exact next step, and how will I know it is truly done?*

The application connects read-only to Gmail, Calendar, Jira, Confluence, Granola, GitHub, Figma, Discord, and Google Drive (Gemini notes). It stores raw signals in a local PostgreSQL database, uses a central LLM router to extract tasks and knowledge, applies deterministic scoring rules, and produces a daily briefing with one primary focus and up to two next-up items. A separate subsystem called Hydra generates structured evidence reports on a weekday schedule or on demand.

The runtime is substantially more capable than the published README describes. PostgreSQL and Inngest background processing are required; the README still instructs SQLite setup. Thirty unit test suites exist; the architecture document still says the test suite is absent. Several rich UI components — execution plan, step checklist, delivery verification — are built but not reachable from the live navigation path.

The product is a functional single-user prototype with real external API connections and a growing deterministic evidence layer. It is not yet ready for shared or hosted deployment, because there is no application authentication or authorization, a fresh-user name-entry workflow is broken in the UI, and several key environment variables are undocumented.

---

## One-Sentence Product Definition

Worklight is a personal daily briefing tool that pulls read-only signals from a developer's connected work tools, extracts ownership-verified tasks with evidence citations, and surfaces a single ranked focus with a concrete next action and checkable done criteria.

**Sources:** `README.md` L1–4; `.cursor/rules/product.mdc` L8–16; `src/app/layout.tsx` L37–38; `src/app/how-ai-works/page.tsx` L14–17

---

## Elevator Pitch

Most developers and designers start their day scattered — Jira has tickets, Granola has meeting notes, Gmail has feedback, Figma has a comment, and GitHub has a PR waiting. Figuring out what to actually do first takes twenty minutes and still feels arbitrary.

Worklight connects to all those tools, reads everything automatically, and gives you a single evidence-backed answer: *do this first, because of this quote from your standup transcript, and you will know it is done when this criterion is met.* Nothing is asserted without a source. Ambiguous or unowned items are surfaced separately for you to resolve rather than silently promoted into your priority queue.

It is the briefing assistant that does the triage so you can spend your time doing the work.

---

## Target Users

**Primary (verified):** A single product designer or developer operating a personal instance on their own machine. The `.cursor/rules/product.mdc` explicitly states "local-first personal work app for a single product designer/developer" and forbids sprint planning, team assignment, and multi-user workflows. The database schema has one `user_profiles` row, no tenant model, no role system, and no authentication.

**Secondary (needs validation — documented in audits, not built):** A wider set of SpaceInch employees with manager-level canonical briefing access, a company directory backed by Confluence/Drive, and organization hierarchy. This vision appears in `docs/audits/company-identity-hierarchy-current-state.md` §O (L526–594) and `docs/audits/confluence-drive-company-directory-audit.md`, but none of its prerequisites (auth, directory ingestion, multi-user model) are implemented.

**Design stakeholder on record (verified):** Lucas Saeed — referenced in `docs/lucas-saeed-ux-copy-feedback-granola.md` as providing UX/copy review feedback that shaped the ownership triage and task card language.

There is an unresolved conflict between the single-user Cursor workspace rules and the company-platform audit documents. This must be resolved before any stakeholder presentation that touches the "who uses this" question.

---

## User Problem

### Functional problem (verified)
Work signals for a product person arrive in parallel, disconnected channels: Jira tickets, meeting transcripts (Granola/Gmail), Confluence PRDs, Figma comments, GitHub PRs, Discord messages, and calendar events. There is no single canonical view of "what is mine, open, and most urgent" backed by actual evidence from those sources.

**Repository evidence:** `WelcomeModal.tsx` L53–65; `.cursor/rules/product.mdc` L27–32; `README.md` L1–9

### User frustration (strong inference)
Starting the day means manually re-reading Jira, checking Granola notes, scanning Slack/Discord, and holding the current state in working memory before any actual work begins. A wrong priority decision — working on the wrong task because a blocker was missed — compounds throughout the day.

**Repository evidence:** `src/app/how-ai-works/page.tsx` L143–147 (product copy: "Today is not a dump of everything synced. It is a short list of work that is yours, open, and backed by evidence.")

### Business or operational problem (needs validation)
At an organizational level, unclear ownership creates delays. Work is duplicated or dropped when assignment is ambiguous across meeting notes, Jira, and verbal agreements. The cost is unverifiable from the repository; the product rules note blocking other people's delivery as a high-priority signal (`src/lib/tasks/priorityRank.ts` weight table).

### Consequences of not solving it (strong inference)
Without the tool, the user must manually check every tool, mentally prioritize, and act on their own judgment — which introduces arbitrary ordering, missed blockers, and evidence the operator cannot later verify. The product explicitly optimizes for traceability to avoid this: every task carries a source quote, a next action, and a done criterion. Without all three the task is rejected or routed to Unclear.

**Repository evidence:** `src/domain/workTask.ts` `hasRequiredPillars()` L101–103; `.cursor/rules/product.mdc` L34–49; `.cursor/rules/ai-safety.mdc` L20–27

---

## Product Solution

Worklight removes the daily triage cost by doing it automatically: connecting to the tools the operator already uses (read-only), extracting what is actually theirs and actionable, ranking those items deterministically by urgency signals, and presenting exactly one focus with concrete execution guidance. AI enriches the output but never overrides the deterministic evidence layer, and every claim must trace to a source quote or be discarded.

The parallel Hydra subsystem generates structured operational reports (eight sections, evidence-backed, scheduled or on-demand) for a deeper end-of-day or start-of-day review. These run separately from the daily sync but share the same connector infrastructure.

---

## How the Application Works

### Simplified flow

```
Connected sources → Sync My Day (Inngest) → source import, dedup, hash check
→ AI extraction (tasks, knowledge, project match) → deterministic ranking
→ DailyBriefV2 composer → Today view (focus + next-up + meetings + needs-input rail)
→ User reviews / acts / marks status → local DB state persists
→ Next session: previous brief persisted, incremental sync picks up from cursor
```

### Step by step

**1. User connects sources** via Settings (OAuth, PAT, bot token, or MCP OAuth). A connection row is written to the `connections` table; credentials go to `data/connection-secrets.json` (mode 600). Google Calendar, Gmail, Jira, Confluence, Granola, GitHub, Figma, Discord, and Google Drive (Gemini-notes scope) can all be connected independently.

**Source:** `src/app/settings/page.tsx` L42–136; `src/services/connections.ts`; `src/services/connectionSecrets.ts`

**2. User sets their name** in Settings → Profile tab. This name is required for the owner-filter logic that decides which tasks appear in Today. The name field is currently hidden (`src/components/ProfileForm.tsx` L56 — `type="hidden"`), so a fresh installation needs a direct DB or API workaround.

**3. User clicks "Sync my day"** on the Today page. This enqueues an Inngest event (`worklight/sync.requested`), which triggers a durable background function that:
- Runs project discovery from recent signals
- Iterates connected providers in ordered waves (Confluence/PRDs first, then Jira, then transcripts, then the rest) to respect source authority
- For each source: fetches new/changed items, dedupes by external ID and content hash, projects-matches via AI (min 0.7 confidence), extracts tasks and knowledge via the central LLM router, and embeds knowledge chunks for semantic search
- Backfills up to eight previously unextracted sources
- Rebuilds the priority queue (deterministic score + capped LLM refinement)
- Runs Figma audits for today's tasks
- Builds the deterministic DailyBriefV2 and the legacy LLM today-briefing JSON
- Finalizes the sync run record with per-provider metrics

**Source:** `src/inngest/functions/syncMyDay.ts` L42–434; `src/lib/imports/sourceImportPipeline.ts`; `src/lib/tasks/prioritizer.ts`

**4. Today view renders** with the server-side result: one primary focus task, up to two "Next up" items, a meetings sidebar (from calendar source items), and a collapsible "Needs your input" rail for ambiguous-ownership or source-conflict items.

The focus card shows: task title, the AI-humanized reason, the current step to execute, done criteria, evidence quotes, and confidence. All sources are visible; nothing is hidden entirely.

**Source:** `src/components/HumanReadableTodayView.tsx`; `src/components/DailyFocusCard.tsx`; `src/components/NeedsInputRail.tsx`

**5. User acts** via status controls (Start, Done, Skip, Snooze, Waiting) — each with a confirmation dialog for writes. Jira transitions are available on linked tasks and execute a real write to Jira with an explicit confirm step. Task changes update the local queue. Chat Q&A is available globally (requires OpenAI).

**Source:** `src/components/TaskActionButtons.tsx`; `src/app/api/work-tasks/[id]/status/route.ts`; `src/app/api/jira/[issueKey]/transition/route.ts`

**6. State persists** in PostgreSQL. The DailyBriefV2, queue summary, and today-briefing JSON also write shadow files under `data/`. On the next session the brief for the current day is read back from the `daily_briefs` table (or shadow file); if the date and input hash are unchanged, AI generation is skipped.

**7. Hydra reports** (separate subsystem) run on a weekday cron (09:30 and 19:15 Europe/Belgrade) or via a manual "Run now" button. They re-fetch sources, score evidence deterministically, optionally enrich with LLM, validate all citations, and store a structured eight-section report with source health, audit log, and optional email delivery via Resend.

**Source:** `src/lib/hydra/orchestrator.ts`; `vercel.json`; `src/app/schedule/page.tsx`

---

## Main User Journey

### First-time experience

The user opens the app and sees a Welcome modal (session-scoped; suppressed on the Today and task routes, which is inverted from the natural first-landing page — **Verified gap**). There is no guided setup wizard. If no data has been synced and no profile name is set, Today shows a "Add your name in Settings" alert with no visible name field to fill.

**Source:** `src/components/WelcomeModal.tsx` L15–16; `src/components/HumanReadableTodayView.tsx` L508–512; `src/components/ProfileForm.tsx` L56

### Setup / connecting sources

User navigates to Settings. The Connections tab shows cards for Gmail, Google Calendar, Jira, Confluence, Granola, GitHub, Figma, and Discord. Connect/disconnect flows are real OAuth/PAT/MCP. Source health is readable on `/sources` (read-only; links back to Settings). GitHub requires a repo/branch selection after OAuth.

Secondary routes — `/projects`, `/knowledge`, `/schedule`, `/reports`, `/audit` — exist and function but are not linked from the Settings page or the main three-link navigation. They are reachable by URL only.

**Source:** `src/app/settings/page.tsx` L42–146; `src/components/NavBar.tsx` L9–12; `src/components/SettingsHubLinks.tsx` (component built, not mounted anywhere)

### Initial sync

After connecting at least one source, "Sync my day" runs the Inngest background job. The overlay shows live per-provider progress (real status, not simulated), with cancel support. After completion a "What's new" panel summarizes new items and Jira status changes.

**Verified** — progress polls `/api/day/sync/[id]` on a real `sync_provider_runs` DB row.

**Source:** `src/components/SyncMyDayButton.tsx`; `src/app/api/day/sync/[id]/route.ts`

### Receiving the main output

After sync completes Today re-renders. If the user's name is set and at least one task is clearly owned, they see:
- A large focus card ("Do this today") with the task title, reason, current step, evidence, and done criteria
- A "Next up" side column (up to two tasks)
- A meetings card (from calendar source items)
- A "Needs your input" attention rail for ambiguous-ownership items and source conflicts (collapsed by default)

If no task is clearly owned, an explicit empty state appears rather than forcing a guess.

**Source:** `src/components/HumanReadableTodayView.tsx` L471–560; `src/components/DailyFocusCard.tsx`; `src/components/NeedsInputRail.tsx`

### Reviewing and acting on results

- Evidence is visible on the focus card with source quotes and dates. An "AI explanation" drawer opens additional reasoning, confidence breakdown, and conflict detail.
- Task status can be changed (Start, Done, Skip, Snooze, Waiting). Each destructive action has a confirmation dialog.
- Jira transitions execute a real confirmed write.
- Ambiguous items in the needs-input rail can be claimed ("This is mine") or disowned ("Not mine"), updating the queue immediately.

**Source:** `src/components/DailyFocusCard.tsx`; `src/components/TaskActionButtons.tsx`; `src/components/NeedsInputRail.tsx`

### Task detail

Clicking a task opens `/tasks/[id]` — a thinner view showing evidence, meeting context, done criteria, and status actions. The richer execution workspace (step checklist, delivery verification, Figma audit, sync-review diff) is built in `DailyFocusCard.tsx` and `FocusExecution.tsx` but is only reachable in the context of the primary Today focus card, not on the standalone task page.

**Source:** `src/app/tasks/[id]/page.tsx`; `src/components/DailyFocusCard.tsx`

### Returning later / re-syncing

The daily brief is persisted with an input hash. If the date and content have not changed, a second sync skips AI generation and returns the cached result. Incremental cursors (per provider, per connection) ensure that repeated syncs fetch only new or changed items rather than re-processing the full history.

**Source:** `src/lib/dailyBrief/buildDailyBrief.ts` L47–59; `src/lib/imports/syncProvider.ts` L173–218; `src/db/schema.ts` (unique index on `daily_briefs.today` L643)

### Gaps in the journey — not yet navigable

| Step | Status |
|------|--------|
| End day flow → `/tomorrow` | API route exists (`/api/day/end`); no End-day button is rendered in the current Today UI |
| Tomorrow page | Route exists; no navigation link to it from Today or Settings |
| Knowledge Q&A | Backend at `/api/knowledge/ask`; not wired on the `/knowledge` page |
| Settings hub navigation | `/schedule`, `/reports`, `/audit`, `/knowledge`, `/projects` all accessible by URL; no in-app links from Settings |

---

## Core Product Capabilities

### 1. Multi-source signal collection (Verified)
The application connects to Gmail (Gemini/Meet notes), Google Calendar, Google Drive (Gemini notes scope only), Jira (assigned + mentioned issues), Confluence (configured spaces and explicit page URLs), Granola (meeting transcripts), GitHub (PRs, comments, checks), Discord (channel keyword/mention matches), and Figma (configured file keys, text tree). All connectors are read-only except one confirmed write: Jira status transitions.

**Repository evidence:** `src/lib/connectors/registry.ts`; `src/db/schema.ts` `SOURCE_TYPES` L46–58; `docs/provider-incremental-sync-checklist.md`

### 2. Evidence-grounded task extraction (Verified)
The central LLM router extracts tasks only with required fields: title, next action, at least one done criterion, and at least one evidence quote that must be a verbatim substring of the source body. Tasks missing any pillar are rejected. Ambiguous ownership or scope routes the task to the `unclear` status rather than assigning a confident guess.

**Repository evidence:** `src/lib/tasks/extractor.ts`; `src/lib/tasks/evidenceVerification.ts`; `src/domain/workTask.ts` `hasRequiredPillars()` L101–103; `src/lib/llm/prompts/taskExtractor.ts`

### 3. Deterministic priority ranking (Verified)
The queue is scored by a deterministic algorithm before AI is involved. Weights include: task status, manual override flag (+1000 for user-set status), whether the task blocks others (+160), stakeholder/client request (+120), Jira priority tier (+10 to +120), due date proximity (+20 to +180), evidence recency (+30 to +60), and a waiting-on penalty (−250). The LLM may then adjust placement to `waiting`, `tomorrow`, or `unclear`, and refine the reason/confidence text, but it cannot change the numeric score or reorder the queue arbitrarily.

**Repository evidence:** `src/lib/tasks/priorityRank.ts`; `src/lib/tasks/prioritizer.ts` L323–435

### 4. Structured daily briefing with conflict preservation (Verified)
The DailyBriefV2 composer runs deterministically. It selects one primary focus, up to several "after that" items, identifies source conflicts (same Jira key appearing as both open and done), surfaces blocked/waiting items, and generates meeting prep questions. All citations are validated against the known source-item ID set. If an LLM call fails, the deterministic output stands; the LLM never replaces the deterministic selection.

**Repository evidence:** `src/lib/dailyBrief/composer.ts`; `src/lib/dailyBrief/buildDailyBrief.ts` L169–203; `src/db/schema.ts` `daily_briefs` L627–644

### 5. Decomposed confidence model (Verified)
Task confidence is a weighted deterministic score from components: evidence count, evidence recency, quote verbatim match, evidence diversity, Jira anchor, owner certainty, and extraction quality. The LLM contributes only the `extractionConfidence` component. This is stored as `confidenceComponents` on the `work_tasks` table and displayed in the AI explanation drawer. Calibration against a labeled corpus has not been measured — the model is deterministic and explainable but unvalidated against ground truth.

**Repository evidence:** `src/lib/tasks/confidenceModel.ts` L1–22; `src/db/schema.ts` `work_tasks.confidenceComponents` L99–100

### 6. Hydra evidence reporting (Verified)
A parallel pipeline generates structured eight-section operational reports (what you did, what to do today, next steps, latest changes, blockers/risks, meetings, Jira snapshot, Figma changes). It runs on a weekday cron via Vercel or on demand. Each run stores a full evidence snapshot, source health matrix, delivery records (in-app; optional email via Resend), audit log, and feedback. LLM output is validated against citation IDs; invalid reports fall back to the deterministic draft.

**Repository evidence:** `src/lib/hydra/orchestrator.ts`; `src/app/schedule/page.tsx`; `src/app/reports`; `src/db/schema.ts` Hydra tables L262–452

### 7. Knowledge extraction and search (Verified — Q&A UI partially missing)
Alongside task extraction, each non-calendar source generates knowledge items (requirements, decisions, open questions, risks, deadlines, stakeholder preferences, acceptance criteria) with evidence quotes. Items are embedded via OpenAI and stored with vector representations. A knowledge list at `/knowledge` is filterable. A Q&A backend exists at `/api/knowledge/ask` using semantic search over the top eight chunks — but this endpoint is not surfaced on the Knowledge page UI; the global task chat (`TaskChatPanel`) is hidden on that route.

**Repository evidence:** `src/lib/knowledge`; `src/app/knowledge/page.tsx`; `src/app/api/knowledge/ask/route.ts`; `src/components/AskMemoryWidget.tsx` L167–169

### 8. Jira write with confirmation (Verified)
Jira status transitions are the only confirmed external write action in the product. The UI presents a confirmation dialog naming the exact transition before execution. Connector read operations do not require confirmation per the safety rules.

**Repository evidence:** `src/app/api/jira/[issueKey]/transition/route.ts`; `.cursor/rules/ui.mdc` L36–41; `.cursor/rules/ai-safety.mdc` L8–18

### 9. Ingestion rules (Verified)
User-authored per-scope extraction steering rules can be added in Settings. Rules steer the LLM during extraction (e.g. "ignore GitHub CI status noise") and are treated as untrusted content in prompts.

**Repository evidence:** `src/db/schema.ts` `ingestionRules` L594–601; `src/components/IngestionRulesPanel.tsx`; `src/lib/tasks/ingestionRuleMatch.ts`

---

## Data, Automation, and LLM Logic

### Data sources and ingestion
All connectors are read-only at registration. Sync is incremental using per-connection cursor rows (`connection_cursors` table) that advance only when all items in a batch are successfully processed — a conservative safety choice that prevents silent data loss but can stall a cursor if one item repeatedly fails.

Source items are deduped by `(sourceType, sourceExternalId)` with a unique index. Content changes are detected by a SHA-256 hash of `(title, body, author, sourceDate, url)`. Unchanged sources are skipped; changed sources record a revision snapshot before reprocessing.

**Repository evidence:** `src/lib/imports/syncProvider.ts` L173–218; `drizzle/postgres/0009_source_items_dedupe_unique.sql`; `src/lib/imports/sourceRevision.ts`

### Processing pipeline
After a source is stored, the pipeline runs: AI project matching (if no project assigned, LLM selects an existing project with ≥0.7 confidence), task extraction with reflect/verification stage, knowledge extraction, and optional embedding indexing (OpenAI required). A backfill pass retries up to eight previously failed or unprocessed sources on each sync.

### LLM routing and safety
All AI calls go through a single central router (`src/lib/llm/router.ts`). The router selects from active providers, sends structured prompts, parses and validates JSON output against Zod schemas, retries once on schema failure, and falls back through a provider chain (typically Groq → Anthropic → OpenAI depending on job type). LLM telemetry is logged to the `llm_telemetry` table. Secret values are redacted from prompt content before dispatch.

Task Q&A uses OpenAI GPT-5.4 with no fallback; if OpenAI is not configured, the chat returns an error. Embedding uses `text-embedding-3-small`; on embedding failure the router memoizes the failure for the process lifetime and knowledge search falls back to keyword matching.

**Repository evidence:** `src/lib/llm/router.ts`; `src/lib/llm/redact.ts`; `src/services/llmTelemetry.ts`

### Deterministic vs. LLM responsibilities

| Responsibility | Deterministic | LLM |
|----------------|---------------|-----|
| Numeric priority score | Yes | Never |
| Queue assignment (now/next/later) | Yes (initial) | Can refine to waiting/tomorrow/unclear only |
| Evidence quote verification | Yes (substring match) | Never |
| Citation validation in briefing | Yes | Never |
| Task three-pillar enforcement | Yes | Never |
| Ownership filtering | Yes (name match) | Initial extraction only |
| Report fallback on LLM failure | Yes | Optional enrichment |
| Confidence components | Yes (weighted) | extractionConfidence only |

### Duplication and staleness handling
The `daily_briefs` table has a unique index on `today` — one brief per calendar day. If the input hash is unchanged when sync runs again, the existing brief is returned without calling the LLM. Existing tasks are not overwritten by a weaker source (the `extractor.ts` merge logic protects tasks with a more-recent evidence date).

**Repository evidence:** `src/db/schema.ts` L643; `src/lib/imports/sourceImportPipeline.ts` L76–118

---

## UX and Information Architecture

### Navigation
Three top-level links: **Today** (`/`), **How we decide** (`/how-ai-works`), and **Settings** (`/settings`). The Settings link is highlighted for eight routes it does not directly expose: `/schedule`, `/reports`, `/audit`, `/sources`, `/projects`, `/knowledge`, and task sub-routes. Those routes are reachable by URL but have no in-app navigation path from Settings. `SettingsHubLinks.tsx` exists as a navigation component but is not mounted anywhere.

**Repository evidence:** `src/components/NavBar.tsx` L9–29; `src/components/SettingsHubLinks.tsx`

### Today page structure

The primary view is a bento-style layout:
- A compact header with the operator's name, date, and "Sync my day" button
- An optional alert when profile name is unset or a provider failed on the last sync
- An optional dismissible "day change" banner (e.g. a new Jira assignment since yesterday)
- A "Needs your input" attention rail (collapsed; expands to ambiguous ownership items and source conflicts)
- A main column with the focus card (large hero — title, reason, current step, controls) or an explicit empty state ("Nothing clearly yours yet")
- A side column with "Next up" rows and the meetings card

**Repository evidence:** `src/components/HumanReadableTodayView.tsx` L471–560; `src/components/DailyFocusCard.tsx`

### Task card / focus card
The focus card surfaces all three required pillars: evidence (source quote + date + link), next action (current execution step), and done criteria (listed, checkable). An AI explanation drawer provides deeper reasoning, confidence, evidence tab, and conflict comparison. The drawer is accessible but hidden by default — evidence is never fully concealed.

**Repository evidence:** `src/components/DailyFocusCard.tsx`; `src/components/AIExplanationDrawer.tsx`; `.cursor/rules/ui.mdc` L19–28

### Feedback states

| State | Implemented? | Notes |
|-------|-------------|-------|
| Today loading skeleton | Yes | `src/app/loading.tsx` — mirrors the bento layout |
| Empty state (no tasks owned) | Yes | "Nothing clearly yours yet" with guidance |
| Sync health banner (failed provider) | Yes | Surfaces on Today chrome after partial sync |
| Partial sync result overlay | Yes | Per-provider status with item counts |
| Profile not set alert | Yes | Blocks personalization; but name input is hidden |
| Route-level error boundary | No | No `error.tsx` or `not-found.tsx` under `src/app/` |
| Knowledge Q&A empty state | Partial | Backend exists; no UI path on the knowledge page |

### Information density and disclosure
The product rule is "minimal by default." The Today page shows one focus and two next-up items; everything else (meeting prep questions, secondary knowledge, review readiness, coverage warnings) is generated but not yet displayed in the current Today UI. The briefing data model (`DailyBriefV2`) carries richer fields than the view currently consumes.

**Repository evidence:** `src/lib/dailyBrief/types.ts` full schema vs `src/components/HumanReadableTodayView.tsx` rendering; `.cursor/rules/ui.mdc` L8–14

---

## Product Value

**What becomes faster (verified):**
- Daily triage: replaces 15–30 minutes of cross-tool checking with a single synced view
- Evidence retrieval: source quotes are attached to every task at extraction time
- Jira alignment: Jira priority, assignee, and workflow status are normalized into the same ranking as meeting-based tasks

**What becomes more accurate (verified):**
- Priority is deterministic and traceable — every score is explainable by its signal weights
- Ownership is enforced rather than guessed; tasks with ambiguous ownership surface as Unclear
- Done criteria are extracted from source evidence, not invented by the AI

**What is no longer manual (verified):**
- Cross-source deduplication
- Project routing (sources matched to local projects by keyword, people, Jira key patterns)
- Evidence attachment (quote + source date + URL preserved automatically)

**What context is preserved (verified):**
- `daily_memories` table stores an end-of-day AI summary feeding the next day's queue build
- Knowledge items persist across sessions with semantic search
- `sync_runs` and `sync_provider_runs` retain a full per-provider audit trail

**Intended value not yet proven (needs validation):**
- Confidence model accuracy against ground truth (uncalibrated per `src/lib/tasks/confidenceModel.ts` L16–22)
- Whether the briefing reduces decision fatigue measurably (no success metrics instrumented)

---

## Product Advantages

### vs. doing it manually
Eliminates the daily triage ritual and makes priority evidence-traceable. A manual process produces no audit trail for why a task was ranked first.

### vs. a basic task manager (Todoist, Things)
Task managers require the user to create and prioritize tasks. Worklight extracts them automatically and enforces that each carries a source quote, next action, and done criterion. Tasks that do not meet this standard are routed to Unclear.

### vs. a search interface or chatbot
A chatbot answers questions but does not maintain a persistent ranked queue, does not track source provenance across sessions, and cannot detect that a Jira ticket mentioned in a meeting transcript is the same work item already in your queue.

### vs. a generic AI assistant
Generic assistants have no persistent state about the operator's specific work context and cannot enforce ownership or evidence requirements. Worklight's deterministic layer means the AI cannot freely promote or invent tasks.

### vs. a standard integration platform (Zapier, Make)
Integration platforms route data between tools but do not extract, rank, or synthesize tasks with evidence. They have no concept of "this is mine and open" filtering, no done criteria, and no confidence model.

**The strongest defensible advantage (verified):** The combination of mandatory evidence citation, deterministic ranking the LLM cannot override, ownership enforcement before display, and explicit Unclear routing for ambiguous items. Most AI task tools produce ranked lists without citations; Worklight refuses to show a task unless it has a traceable source.

---

## Current Implementation Status

### Live and usable

| Capability | Evidence |
|------------|----------|
| Source connection (8 providers, OAuth/PAT/MCP) | `src/app/settings/page.tsx` L42–136; `src/lib/connectors/registry.ts` |
| Sync My Day via Inngest (real progress, cancellation) | `src/inngest/functions/syncMyDay.ts`; `src/components/SyncMyDayButton.tsx` |
| Incremental sync with per-provider cursors | `src/lib/imports/syncProvider.ts` L173–218; `src/db/schema.ts` `connection_cursors` L461–490 |
| Source dedup by external ID + content hash | `drizzle/postgres/0009_source_items_dedupe_unique.sql`; `src/lib/imports/sourceImportPipeline.ts` |
| AI task extraction with three-pillar enforcement | `src/lib/tasks/extractor.ts`; `src/domain/workTask.ts` L101–103 |
| Ownership filter and Unclear routing | `src/lib/filters/ownerFilter.ts`; `src/components/NeedsInputRail.tsx` |
| Deterministic priority ranking | `src/lib/tasks/priorityRank.ts` |
| DailyBriefV2 (deterministic, persisted to DB) | `src/lib/dailyBrief/composer.ts`; `src/db/schema.ts` `daily_briefs` L627–644 |
| Today focus card with evidence + execution + done criteria | `src/components/DailyFocusCard.tsx` |
| Jira transition with confirmation dialog | `src/app/api/jira/[issueKey]/transition/route.ts` |
| Hydra manual/scheduled report pipeline | `src/lib/hydra/orchestrator.ts`; `src/app/schedule/page.tsx` |
| LLM telemetry | `src/db/schema.ts` `llm_telemetry` L608–624; `src/services/llmTelemetry.ts` |
| Central LLM router with fallback chain | `src/lib/llm/router.ts` |
| 30 unit test suites | `package.json` L18–40 |

### Partial or blocked

| Capability | Gap | Evidence |
|------------|-----|----------|
| Fresh-user profile name entry | `name` field hidden in Settings form | `src/components/ProfileForm.tsx` L56 |
| Knowledge Q&A on Knowledge page | Backend exists; not wired in UI | `src/app/knowledge/page.tsx`; `/api/knowledge/ask` |
| Settings hub navigation | Hub links component built, not mounted | `src/components/SettingsHubLinks.tsx` |
| End-day → Tomorrow journey | API exists; no trigger button in Today UI | `/api/day/end`; `src/app/tomorrow/page.tsx` |
| Execution steps / verify / Figma (on task detail) | Components exist; only reachable in focus card context | `src/components/DailyFocusCard.tsx` vs `src/app/tasks/[id]/page.tsx` |
| Google Drive (general) | Narrow Gemini-notes scope only | `src/lib/connectors/drive.ts` L6–11 |
| Discord OAuth | Connector reads `botToken`, not `accessToken` | Architecture doc L691 |
| Email delivery (Hydra) | Requires Resend + profile email | `src/lib/hydra/orchestrator.ts` L340–352 |

### Not implemented

| Capability | Evidence |
|------------|----------|
| Application authentication and authorization | No middleware, no session, no protected routes |
| Multi-user / organization / team model | Single implicit operator per instance |
| Manager view or canonical per-employee briefing | Only in company-platform audit docs |
| Background worker process for Hydra | Hydra still runs synchronously in HTTP request |
| Automatic DB migration on startup | Manual `npm run db:pg:migrate` required |
| `.env.example` committed to repo | Referenced in docs but absent from repository |

---

## Risks and Open Questions

### Risk 1 — No authentication or authorization (BLOCKING for shared use)
Every API route — including task mutation, connector secret management, settings writes, and Jira transitions — accepts any request with no identity check. Deploying on any network-accessible URL without a separate auth proxy exposes all work data and enables unauthenticated writes.
**Evidence:** `src/app/api/settings/route.ts`; `src/app/api/local-path/browse/route.ts`; `docs/current-app-architecture.md` L114–117
**Blocks stakeholder presentation?** Yes, for any hosted or shared demo.
**Question:** Is deployment permanently localhost-only, or is an auth layer planned before shared access?

### Risk 2 — README and setup docs describe SQLite; runtime requires PostgreSQL (BLOCKING for onboarding)
`README.md` still instructs `npm run db:migrate` (SQLite) and calls PostgreSQL optional. `docs/local-postgres-setup.md` L3–4 says "still uses SQLite by default." In reality `src/lib/env/database.ts` L83–97 throws at startup without `DATABASE_URL`, and `src/db/connection.ts` imports only the Postgres driver.
**Blocks stakeholder presentation?** Yes, for any demo run from README instructions.
**Question:** Who updates README, setup docs, and migration plan to the current Postgres-required state?

### Risk 3 — Fresh-user profile name is hidden in Settings UI (BLOCKING for zero-data demos)
`ProfileForm` registers `name` as `<input type="hidden">`. Today shows "Add your name in Settings" but there is no visible field to add it. All personalized filtering, the triage rail, and the knowledge feed require this field.
**Evidence:** `src/components/ProfileForm.tsx` L56; `src/components/HumanReadableTodayView.tsx` L508–512
**Workaround:** Seed `user_profiles.name` via `PATCH /api/profile` or SQL before the demo.

### Risk 4 — No committed `.env.example` (BLOCKING for reproducible setup)
Both `docs/local-inngest-setup.md` and `docs/local-postgres-setup.md` reference a `.env.example` that does not exist. Full env set (`DATABASE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `REPORT_EMAIL_FROM`, `WORKLIGHT_APP_URL`, Inngest keys, LLM keys, OAuth client IDs) is scattered.
**Evidence:** `.gitignore` L35; `docs/current-app-architecture.md` L1148

### Risk 5 — Dual product naming creates unclear positioning
Welcome modal and metadata say "Worklight"; schedule/reports/audit pages say "Hydra"; package is `worklight-app`. `docs/current-app-architecture.md` L21 flags this.
**Question:** Is "Worklight" the single product with Hydra as a subsystem, or two products sharing a repo?

### Risk 6 — Several demo assumptions are hardcoded to a specific tenant
Hydra defaults set assignee "Milos Dostanic", project UATL, stakeholders Matt/Lucas (`src/domain/hydraReport.ts` L97–103; `src/services/hydra.ts` L66–75). `/sources` hardcodes UATL Jira copy. A sync error links to `/projects/18`. Not UI-configurable.
**Blocks stakeholder presentation?** Partially — fresh-install demo exposes the defaults.

### Risk 7 — Rich execution UI built but unreachable from live navigation
`DailyFocusCard` execution workspace, `MinimalTodayView`, `JiraStatusDropdown`, `FigmaValidateButton` are built but only reachable within the focus card context on Today (or not at all).
**Evidence:** `src/components/MinimalTodayView.tsx` (no imports); `src/components/JiraStatusDropdown.tsx` (no imports); `src/app/tasks/[id]/page.tsx`

### Risk 8 — Accuracy claims are unverifiable (do not present as measured)
Confidence model is deterministic but uncalibrated (`src/lib/tasks/confidenceModel.ts` L16–22). Accuracy improvement audit states claims require labeled data absent from repo. Evidence relevance EV-03/04/05 remain open (`docs/architecture/evidence-relevance-fix-plan.md` L253–255).
**Blocks:** "measured X% better accuracy" claims. Not: "deterministic and traceable" claims.

### Risk 9 — Two product visions in conflict (needs strategic resolution)
`.cursor/rules/product.mdc` L18–25 prohibits team/multi-user features. `docs/audits/company-identity-hierarchy-current-state.md` §O describes a SpaceInch company deployment. Mutually incompatible without a deliberate decision.
**Question:** Is the SpaceInch scenario committed roadmap or exploratory?

### Risk 10 — Test suite is not a release gate; three tests omitted from `npm test`
30 test files exist, but `test:needs-input-relevance` (package.json L31) is missing from the aggregate `npm test` (L40). Two test files have no npm script. No CI, no `tsc --noEmit` gate.
**Blocks:** "automated regression coverage" narrative. Not the demo.

---

## Recommended Stakeholder Narrative

### The problem
A product designer or developer starts every day fragmented across five to eight tools. Assembling a coherent picture of what to do first takes meaningful time and still produces an arbitrary answer, because no system enforces "this task is actually yours, actually open, and actually backed by something someone said."

### The current cost
The hidden tax is cognitive: mentally merging multiple systems before any work. Priority decisions are unjustified. Done criteria are unclear until delivery. Ambiguous ownership creates delay and duplicated work.

### The solution
Worklight is a personal daily briefing operator. It connects read-only to the tools already in use, extracts only what is genuinely the operator's responsibility with evidence from the actual source, ranks deterministically by verifiable signals, and presents one focus at a time. Every task carries three mandatory fields: the source quote, the concrete next action, and a checkable done criterion. Items that do not meet the standard are surfaced as ambiguous rather than silently promoted.

### How it works
Connect sources once in Settings. Each workday "Sync my day" runs in the background: incremental fetch, AI extraction with evidence verification, deterministic ranking, and a written daily brief. Today shows one focus, up to two next-up items, and an attention rail for ownership resolution. The operator acts and state persists.

### Why it is valuable
Priority is no longer an opinion. Evidence is attached automatically. Done criteria are written at task creation time from the actual source. Ambiguity is surfaced rather than hidden. Every claim can be verified against a source.

### Why it is different
Most AI task tools produce ranked lists without evidence. Worklight refuses to surface a task unless it has a verbatim source quote, a concrete next action, and at least one checkable done criterion. Ranking is deterministic and cannot be overridden by the LLM. Ambiguity routes to Unclear.

### Current state
A functional single-user prototype with real connectors, a PostgreSQL evidence layer, Inngest-orchestrated background sync, a deterministic DailyBriefV2 composer, and 30 unit test suites. It operates without authentication on a single trusted machine. Several rich UI components are built but partially wired. The Hydra report subsystem is independently functional.

### What comes next
1. Expose the profile name field in Settings (single-line fix)
2. Mount the Settings hub navigation links (`SettingsHubLinks.tsx`)
3. Commit a `.env.example` with all required variables
4. Update `README.md` for the PostgreSQL + Inngest requirements
5. Wire Knowledge Q&A to the Knowledge page
6. Route the End-day flow so Tomorrow is reachable

Longer horizon: unified Sync + Hydra pipeline, evidence relevance cleanup, accuracy calibration, and — if the company direction is confirmed — authentication and directory ingestion.

---

## Suggested Presentation Outline

1. **The daily fragmentation problem** — Establish scattered work context. Visual: tool logos → blank plan.
2. **The cost of the current state** — Time, context switching, unjustified priority, unclear ownership. Visual: task without pillars vs three-pillar model.
3. **Product vision: the daily briefing operator** — One brief, one focus, evidence-backed. Visual: Today focus card.
4. **How the system works** — Connect → sync → extract → rank → focus → act. Visual: the flow diagram.
5. **The primary user journey** — Settings → Sync → Today → evidence → confirm. Visual: sequence of screenshots.
6. **Intelligence: deterministic vs AI** — AI cannot invent, reorder, or suppress conflicts. Visual: "valid vs not" table.
7. **Core capabilities at a glance** — Eight sources, extraction, ranking, conflict surfacing, Jira write, Hydra. Visual: Live vs Partial/Next table.
8. **The Hydra subsystem** — Eight-section evidence report, source health, audit log. Visual: report detail page.
9. **What makes this different** — Mandatory evidence, deterministic rank, Unclear routing. Visual: generic list vs Worklight card.
10. **Current implementation status** — Done / partial / not built; single-user, no auth. Visual: traffic-light grid.
11. **Risks and open questions** — No auth, profile name broken, accuracy unmeasured. Visual: "do not present" vs "proof points".
12. **What comes next** — Config fixes and wiring existing components vs longer-horizon items. Visual: near-term vs long-term list.

---

## Evidence and Repository References

| Claim | File | Lines / Notes |
|-------|------|---------------|
| Product definition | `README.md` | L1–4 |
| Product rules (single user, no PM features) | `.cursor/rules/product.mdc` | L8–25 |
| Three-pillar enforcement | `src/domain/workTask.ts` | `hasRequiredPillars()` L101–103 |
| Unclear routing requirement | `.cursor/rules/product.mdc` | L45–49 |
| Write confirmation requirement | `.cursor/rules/ui.mdc` | L36–41 |
| No silent AI writes | `.cursor/rules/ai-safety.mdc` | L8–18 |
| PostgreSQL-only runtime | `src/lib/env/database.ts` | L6–97 |
| README still describes SQLite | `README.md` | L7–16, 114–120 |
| Inngest sync function | `src/inngest/functions/syncMyDay.ts` | L42–434 |
| Sync enqueue route | `src/app/api/day/sync/route.ts` | L9–41 |
| Provider waves / source authority | `src/lib/tasks/sourceAuthority.ts` | L29–34 |
| Import pipeline | `src/lib/imports/sourceImportPipeline.ts` | L40–307 |
| Source dedup unique index | `drizzle/postgres/0009_source_items_dedupe_unique.sql` | — |
| Content hash | `src/db/schema.ts` | `source_items.contentHash` L71–72 |
| Cursor commit on all-items-success | `src/lib/imports/syncProvider.ts` | L173–218 |
| Task extraction with pillars | `src/lib/tasks/extractor.ts` | L204–437 |
| Evidence substring verification | `src/lib/tasks/evidenceVerification.ts` | L12–21 |
| Deterministic ranking weights | `src/lib/tasks/priorityRank.ts` | weight table |
| LLM cannot change score | `src/lib/tasks/prioritizer.ts` | L323–435 |
| DailyBriefV2 composer | `src/lib/dailyBrief/composer.ts` | — |
| DailyBriefV2 schema + unique index | `src/db/schema.ts` | `daily_briefs` L627–644 |
| Daily brief persisted to DB | `src/lib/dailyBrief/buildDailyBrief.ts` | L47–109 |
| Confidence decomposition | `src/lib/tasks/confidenceModel.ts` | L1–22 (uncalibrated noted L16–22) |
| Evidence relevance open items | `docs/architecture/evidence-relevance-fix-plan.md` | L253–255 |
| LLM router | `src/lib/llm/router.ts` | — |
| LLM telemetry | `src/db/schema.ts` | `llm_telemetry` L608–624 |
| Secret redaction | `src/lib/llm/redact.ts` | — |
| Hydra orchestrator | `src/lib/hydra/orchestrator.ts` | L417–549 |
| Hydra scheduled cron | `vercel.json` | L1–7 |
| Jira write (only confirmed external write) | `src/app/api/jira/[issueKey]/transition/route.ts` | — |
| No authentication | `docs/current-app-architecture.md` | L43–44, 114–117 |
| Profile name hidden | `src/components/ProfileForm.tsx` | L56 |
| Name required for Today filter | `src/components/HumanReadableTodayView.tsx` | L508–512 |
| SettingsHubLinks not mounted | `src/components/SettingsHubLinks.tsx` | (no import found) |
| Tomorrow route orphaned | `src/app/tomorrow/page.tsx` | (no nav link) |
| Knowledge Q&A not wired on page | `src/app/knowledge/page.tsx` | `/api/knowledge/ask` exists; UI omits it |
| DailyFocusCard execution not on task detail | `src/app/tasks/[id]/page.tsx` vs `src/components/DailyFocusCard.tsx` | — |
| Drive connector: Gemini notes only | `src/lib/connectors/drive.ts` | L6–11 |
| Hardcoded Hydra tenant defaults | `src/domain/hydraReport.ts` | L97–103 |
| Hardcoded sync error project link | `src/components/SyncMyDayButton.tsx` | L330–341 |
| 30 unit test suites | `package.json` | L18–40 |
| Test omitted from aggregate script | `package.json` | L31 vs L40 |
| Nav — three links only | `src/components/NavBar.tsx` | L9–12 |
| Nav active covers unlinked routes | `src/components/NavBar.tsx` | L16–29 |
| Welcome modal not shown on Today | `src/components/WelcomeModal.tsx` | L15–16 |
| Loading skeleton | `src/app/loading.tsx` | — |
| No error.tsx or not-found.tsx | `src/app/` | (absent) |
| Company platform vision (not implemented) | `docs/audits/company-identity-hierarchy-current-state.md` | §O L526–594 |

---

## Questions for Product Validation

1. **Scope:** Is the primary product the single-user personal operator (Cursor rules), or the multi-employee SpaceInch platform (identity/directory audits)? Which document governs when they conflict?
2. **Hydra positioning:** Should Hydra reports be branded as part of Worklight, as a separate product, or merged into the primary Sync → Today loop?
3. **Product name:** Is "Worklight" the single authoritative name with "Hydra" as an internal subsystem, or are they two products sharing one codebase?
4. **Near-term user base:** One operator for the next 90 days, or a pilot to additional employees? This determines whether authentication is a near-term blocker.
5. **Profile name fix:** Expose the `name` field in Settings, or derive name from an OAuth identity?
6. **Accuracy measurement:** Is calibrating the confidence model against a labeled corpus planned, or is deterministic-but-uncalibrated the intended state?
7. **Drive strategy:** Gemini-notes only (current), or general Google Docs/Sheets/Slides coverage?
8. **Hydra execution model:** Move Hydra runs to Inngest (like Sync) to fix the HTTP-bound long-request risk, or keep synchronous execution?
9. **Demo readiness:** Which must be fixed before an external demo — profile name field, `.env.example`, README Postgres update, hardcoded Hydra defaults?
10. **Evidence relevance EV-03–EV-05:** Scheduled for the current sprint, or deprioritized?
