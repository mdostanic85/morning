# Worklight — High-level Architecture

A concise architecture overview of **Worklight (Daily Work Operator)**: stack, layer boundaries, and how the app works from signals to Today focus.

Use this document as a FigJam / diagramming prompt, or as an onboarding map. It is intentionally high-level — no SQL schemas or full API catalogs.

> **Note:** `docs/current-app-architecture.md` is a deeper code-derived audit and may lag on storage details. Runtime database is **PostgreSQL** (Drizzle). SQLite is no longer supported at runtime.

---

## 1. What the product is

Worklight is a **local-first personal app for one person** (product designer/developer).

Every morning it answers four questions:

1. What should I do first?
2. Why does it matter?
3. What is the next concrete action?
4. How do I know it’s truly done?

It is **not** a project-management tool, team dashboard, or sprint planner.

Two functional surfaces live in one Next.js app:

| Surface | Role |
|---|---|
| **Worklight** | Daily operator — Sync my day → tasks → Today focus |
| **Hydra** | Morning/evening report operator — evidence-backed report |

---

## 2. Stack

### Frontend / app shell

- Next.js 16 (App Router) + React 19 + TypeScript
- Server Components for page load
- Client Components for interactions (sync, task actions, chat)
- HeroUI + Tailwind v4 + CSS Modules + Framer Motion

### Backend (same process — not a separate server)

- Next.js Route Handlers (`/api/*`)
- Domain services (`src/services`) — only layer that touches the DB
- Domain types (`src/domain`) — no I/O
- Business logic (`src/lib/tasks`, `dailyBrief`, `knowledge`, `imports`, `hydra`)

### Data

- **PostgreSQL** (only runtime database) via Drizzle ORM
- Local: Docker Postgres; hosted: Neon
- Secrets / LLM keys: local JSON files (never in the browser bundle)

### Background jobs

- **Inngest** — `sync-my-day` pipeline, stale-run recovery
- **Vercel Cron** tick for Hydra schedules

### AI

- Central **LLM router** (`src/lib/llm/router.ts`)
- Providers: Groq, OpenAI, Anthropic, Google Gemini, local OpenAI-compatible
- Nothing calls a provider directly — everything goes through the router
- Zod schemas for structured output

### Integrations (connectors, read-only by default)

- Granola, Gmail, Google Calendar, Google Drive
- Jira, Confluence
- GitHub, Figma, Discord, local git
- Each connector is an isolated module; **UI never imports them**

---

## 3. Layers

```
[ Browser UI ]
  Today | Projects | Knowledge | How we decide | Settings
  (+ Reports / Schedule / Sources / Audit via Settings hub)
        ↓
[ Next.js pages + API routes ]
  Pages call services directly (Server Components)
  Client mutations: fetch → API → services → router.refresh
        ↓
[ Services / Domain ]
  workTasks, sourceItems, evidence, knowledge, syncRuns,
  projects, connections, hydra, dailyMemories...
        ↓
[ Lib pipelines ]
  connectors → extract → merge → rank → brief
  + LLM router
        ↓
[ PostgreSQL + local secrets JSON ]
        ↔
[ External APIs / MCP ]
```

### Boundary rules

| Allowed | Forbidden |
|---|---|
| UI → services → db | UI → connectors |
| Services → connectors / LLM router | UI → LLM providers |
| Connectors → external APIs | Connectors → UI |

---

## 4. How the app works

### Flow A — Sync my day (core loop)

1. User clicks **Sync my day**
2. API creates `sync_run` → Inngest event `worklight/sync.requested`
3. Inngest `sync-my-day` function:
   1. **FETCH** — connectors pull signals (incremental cursors)
   2. **STORE** — `source_items` (hash/version, immutable evidence trail)
   3. **EXTRACT** — LLM router extracts tasks + knowledge (with evidence)
   4. **MERGE** — deterministic merge onto existing `work_tasks`
   5. **RANK** — score + limited AI priority decision
   6. **BRIEF** — Today briefing / daily brief (one primary focus)
4. UI polls sync status (per-provider health)
5. Today shows: focus + queue + meetings + unclear

Every task always has **three pillars**:

- **Evidence** — source / quote that justifies the task
- **Next action** — one concrete step
- **Done criteria** — how completion is verified

Ambiguity → **Unclear** bucket (do not guess).

### Flow B — Hydra report

1. Schedule (09:30 / 19:15 Europe/Belgrade) or **Run now**
2. Gather sources → schema-bound report (Zod)
3. Sections include: today first, after that, told to you, blocked, Jira state, conflicts, suggested message, Figma audit
4. Every claim cites evidence
5. Persist run + feedback + audit trail

### Flow C — Task lifecycle (after sync)

User actions: start / done / later / tomorrow / waiting / unclear

- Manual status is **never** overwritten by the planner
- Optional: AI “check if done” (verification)
- Optional write: Jira transition **only** with explicit in-the-moment confirmation
- End day → AI daily memory

### Flow D — Q&A

Global / task chat → LLM router + local context (sources, knowledge).  
Answers are ephemeral UI state (not persisted chat history).

---

## 5. Core data entities

```
External signal
  → source_items
  → evidence (+ relations)
  → work_tasks
       statuses: now | next | later | waiting | tomorrow | unclear | done
  → knowledge_items (optionally project-linked)
  → daily brief / focus
  → sync_runs / sync_provider_runs / cursors
  → projects (matching hints: keywords, jira keys, repos, figma)
  → people / aliases
  → connections
  → llm_telemetry / audit_logs
  → hydra report_runs
```

Schema lives in `src/db/schema.ts`; each table has a matching CRUD module in `src/services/`.

---

## 6. Key principles

- **Local-first** — app works without cloud sync
- **Single user** — no auth roles (implicit operator)
- **Read-only connectors** by default
- **No silent external writes** — always confirm the specific action
- **Evidence over assertion** — no task without a source
- **Deterministic ranking before AI** generation
- **Central LLM router** — only AI boundary
- **Secrets server-side only**

---

## 7. FigJam board layout (optional)

If turning this into a board:

| Region | Content |
|---|---|
| Top left | Product one-liner + two surfaces (Worklight / Hydra) |
| Top right | Stack boxes |
| Middle | Layer stack (UI → API → Services → Lib → DB / Externals) |
| Bottom | Horizontal Sync my day flow (1→6) |
| Right of flow | Hydra side-flow |
| Bottom right | Core entities + three-pillar task model |
| Bottom left | Principles (stickies) |

**Style:** clean, few colors, labeled arrows, no dashboard clutter.  
**Title:** Worklight — High-level Architecture

---

## 8. Audit snapshot

| Layer | State |
|---|---|
| Stack | Next.js monolith + Postgres + Inngest + central LLM router — clean |
| Boundaries | UI → services → DB respected; connectors isolated |
| Core loop | Sync → extract → merge → rank → Today — clear |
| Dual product | Worklight (ops) + Hydra (report) share sources, different outputs |
| Auth / multi-user | None — single-operator local tool |
| Docs drift | Deeper audit doc may still mention SQLite; runtime is Postgres |

---

## Related docs

- [README](../../README.md) — setup, stack, pages, sync overview
- [Current app architecture](../current-app-architecture.md) — deep code-derived audit (may lag)
- Product / architecture rules: `.cursor/rules/product.mdc`, `.cursor/rules/architecture.mdc`
