# Worklight Accuracy Implementation Plan (Phased)

> Companion to [`worklight-accuracy-and-improvement-audit.md`](./worklight-accuracy-and-improvement-audit.md).
> The audit is the *why* and the evidence; this document is the *how* and the *order*.
> It turns recommendations **WL-01 … WL-16** into six execution phases with entry
> conditions, work items, migrations, acceptance gates, and exit criteria.
>
> **Guiding principle (from the audit):** extend, don't rewrite. Run deterministic
> code first; use the LLM only for genuine semantic interpretation; never let the
> LLM produce the final priority number; and **ship no accuracy claim without a
> fixture**.

---

## Phase Map at a Glance

| Phase | Theme | Items | Migration? | Gates on |
|-------|-------|-------|------------|----------|
| **0** | Measurement & safety baseline | WL-09, WL-11 | Additive (WL-09) | — |
| **1** | Sync honesty & data integrity | WL-01, WL-02, WL-04, WL-03 | Enum (WL-01), cleanup+index (WL-04), additive cols (WL-03) | Phase 0 |
| **2** | Trustworthy confidence & conflicts | WL-05, WL-06 | Additive (WL-05), schema redesign (WL-06) | Phase 1 |
| **3** | LLM quality & correction loop | WL-07, WL-08, WL-10 | Additive (WL-08, WL-10) | Phase 0 (WL-07), Phase 2 (WL-10) |
| **4** | Presentation & trust surfacing | WL-12 | None | Phases 1–3 data |
| **5** | Advanced / deferred | WL-13, WL-14, WL-15, WL-16 | Additive | Measured accuracy from P0/P1 |

**Dependency spine** (must respect ordering within a phase):
`WL-09 → (everything measurable)`, `WL-01 → WL-02`, `WL-11 → WL-07`,
`WL-03 + WL-05 → WL-06`, `WL-05 → WL-10`, `WL-01 + WL-05 + WL-06 → WL-12`,
`WL-03 + WL-06 → WL-13`.

---

## Phase 0 — Measurement & Safety Baseline

**Objective:** land the two low-risk, no-behavior-change items that every later
accuracy claim depends on. Nothing after this should be "measured by eyeball."

**Entry:** none.

### Work items

- **WL-09 — LLM telemetry + cost audit log.** Add an `llm_telemetry` table; write
  one row per `runLlmJob` from `src/lib/llm/router.ts` (job type, provider, model,
  prompt version, input hash, tokens, latency, status, cost). This is the
  evaluation backbone for WL-05/WL-07 and all later accuracy comparisons.
  - Files: `src/lib/llm/router.ts`, `src/db/schema.ts`; new
    `src/services/llmTelemetry.ts`, `drizzle/postgres/PROPOSED_llm_telemetry.sql`.
- **WL-11 — Pre-LLM secret redaction.** Shared sanitizer (regex `_SECRET_PATTERNS`
  from Workstream) applied to untrusted `body`/diff text *before* it reaches
  `runLlmJob`. Preserve the existing `wrapUntrustedContent` wrapper.
  - Files: `src/lib/llm/prompts/shared.ts`, `src/lib/tasks/extractor.ts`; new
    `src/lib/llm/redact.ts`.

### Migration
- WL-09: additive table only. WL-11: none.

### Acceptance gates
- Every `runLlmJob` writes exactly one telemetry row (mock-provider test).
- Known secret patterns (e.g. fake AWS key in a source body) are `[REDACTED]`
  before the router receives them.

### Exit criteria
- Telemetry rows queryable for cost/latency/status; a retention note captured
  (see Open Question 3).
- Redaction covered by a unit test and enabled on the extraction path.

---

## Phase 1 — Sync Honesty & Data Integrity (highest-priority accuracy work)

**Objective:** stop the system from *silently* believing it has processed data it
has not. This is the audit's single largest source of inaccuracy.

**Entry:** Phase 0 complete (telemetry available to observe sync/LLM outcomes).

### Work items (in order)

1. **WL-01 — Honest provider sync status.** Return `ok: importResult.ok`; gate
   `completeSyncProviderRun` on `itemsFailed === 0` **and** zero
   extraction/knowledge/embedding failures (add a separate `itemsExtractionFailed`
   counter — extraction failures never touch `itemsFailed` today). Feed aggregated
   failures into `deriveSyncRunCompletionStatus`. Keep cancelled runs `cancelled`.
   - Files: `src/lib/imports/syncProvider.ts`,
     `src/inngest/functions/syncMyDay.ts`, `src/lib/imports/syncRunCompletion.ts`,
     `src/lib/imports/sourceImportPipeline.ts`, `src/services/syncRuns.ts`,
     `src/db/schema.ts` (enum).
2. **WL-02 — Gate cursor advance on item success.** Move the provider-cursor
   commits (`syncProvider.ts:152-191`) behind `importResult.ok`, matching the
   stricter `syncResourceScopes.ts` behavior. **Depends on WL-01.**
   - Files: `src/lib/imports/syncProvider.ts`, `src/lib/imports/*ConnectionCursor.ts`.
3. **WL-04 — Unique index on external ID.** Partial unique index on
   `(source_type, source_external_id) WHERE source_external_id IS NOT NULL`;
   conflict-aware upsert. **Requires de-duplicating existing rows before the index.**
   - Files: `src/db/schema.ts`, `src/services/sourceItems.ts`; new
     `drizzle/postgres/PROPOSED_source_items_unique.sql`.
4. **WL-03 — Content hash + revision on task-path sources.** Add first-class
   `content_hash` + `updated_at`; add a persisted task-path revision (extend the
   Hydra `source_documents` shape, reconciling with — not duplicating — the
   existing `sourceProcessingFingerprint`). Wire the hash into the import-path skip
   so a failed prior extraction re-runs next sync rather than only via the 8/run
   backfill.
   - Files: `src/db/schema.ts`, `src/lib/imports/sourceImportPipeline.ts`,
     `src/lib/imports/sourceProcessing.ts`, `src/services/sourceItems.ts`; new
     `drizzle/postgres/PROPOSED_source_items_hash.sql`, `src/lib/imports/sourceRevision.ts`.

### Migration
- **WL-01:** enum change — `SYNC_PROVIDER_RUN_STATUSES` today is
  `running|completed|failed|cancelled`; add a `partial`/`partially_completed`
  value and/or the `itemsExtractionFailed` counter.
- **WL-04:** de-dup existing `(source_type, source_external_id)` rows *first*,
  then add the partial unique index.
- **WL-03:** additive nullable columns + a revision store (backfillable).

### Acceptance gates
- A provider whose import throws (`itemsFailed>0`) never records `completed`.
- A provider whose **extraction/embedding** fails but persist succeeds also does
  not record `completed`; the run becomes `partially_completed`.
- A cancelled provider stays `cancelled`.
- On item failure the cursor does not advance; the failed window re-fetches next run.
- Duplicate insert with same `(type, external_id)` is prevented/updated, not duplicated.
- Editing a source creates a revision, retains the prior body, and re-extracts;
  an identical re-sync creates no revision.

### Evaluation fixtures
- New `src/lib/imports/syncProvider.test.mts` (does not exist today): two cases,
  each first pinning today's buggy `completed` outcome, then the fixed partial —
  (1) persist throw → `itemsFailed=1`; (2) forced extraction failure →
  `itemsFailed=0` but `_worklightProcessing.taskStatus==="failed"`.
- Cursor test: item failure → cursor unchanged; success → cursor advances.
- WL-04: two concurrent imports of the same external id → one row.
- WL-03: import → edit body → new revision + re-extraction; re-import identical → none.

### Exit criteria
- Sync runs report their true status; no green run hides a failed extraction.
- Failed items are re-fetched; duplicate rows are structurally impossible.
- Task-path sources carry durable revision identity.

---

## Phase 2 — Trustworthy Confidence & Conflicts

**Objective:** make trust explainable and stop hiding disagreement between sources.

**Entry:** Phase 1 (needs revisions from WL-03 and honest sync state).

### Work items (in order)

1. **WL-05 — Decomposed, deterministic confidence.** Compute components
   (assignment / identity / project / authority / freshness / corroboration /
   conflict) from signals Worklight **already** computes; the LLM supplies only
   `extractionConfidence`. Aggregate deterministically; keep the
   `plannerConfidence.ts` contamination guard. **Explicitly replace** the
   `resolvePlannerConfidence` default of `1.0` (unscored ≠ fully trusted).
   - Files: `src/lib/tasks/plannerConfidence.ts`, `src/lib/tasks/sourceAuthority.ts`,
     `src/lib/tasks/extractor.ts`, `src/lib/llm/prompts/taskExtractor.ts`; new
     `src/lib/tasks/confidenceModel.ts`.
2. **WL-06 — Surface conflicts, stop silent resolution.** Persist task-path
   relations and render unresolved conflicts on Today. **Caveat:**
   `evidence_relations` is **not** drop-in reusable — its FKs require `run_id` +
   `hydra_evidence_items` IDs, so extending it to the task path is a **schema
   redesign**. Key transcript evidence to the same canonical/Jira key before
   attaching it to a conflict.
   - Files: `src/db/schema.ts`, `src/lib/tasks/sourceAuthority.ts`,
     `src/lib/dailyBrief/composer.ts`, `src/components/HumanReadableTodayView.tsx`,
     `src/services/*`; new `src/lib/tasks/conflictDetection.ts`.

### Migration
- **WL-05:** additive component storage; **recalibration required** — the 0.5/0.7
  thresholds and UI copy change meaning and must be re-tuned/re-tested.
- **WL-06:** task-path relation schema is a redesign (not table reuse).

### Acceptance gates
- **WL-05 (a) Determinism:** same inputs → identical confidence + stored component
  breakdown. **(b) Accuracy must be *measured*, not assumed:** on a fixed labeled
  corpus the decomposed score must beat the current model scalar on a calibration/
  ownership metric (Brier score or threshold precision/recall). Determinism alone
  is not an accuracy win.
- **WL-06:** a Jira-Done-vs-newer-meeting conflict is **shown in
  `HumanReadableTodayView`** (not merely produced), with labeled precision/recall
  and an explicit negative case where unrelated meeting evidence is **not** attached.

### Evaluation fixtures
- WL-05: golden component-vector test **plus** a labeled ownership/calibration set
  (extend `plannerConfidence.test.mts`), including the `resolvePlannerConfidence`
  default-1.0 case.
- WL-06: a dedicated conflict/rendering fixture including a two-ticket negative
  case (not `completionEvidence.test.mts`, which covers self-reported completion).

### Exit criteria
- Confidence is explainable per component and stable across runs, with a measured
  accuracy gain over the old scalar.
- Meaningful conflicts are recorded as task-path relations and rendered, not
  silently auto-resolved.

---

## Phase 3 — LLM Quality & Correction Loop

**Objective:** reduce extraction instability and let user corrections and durable
identities improve future runs.

**Entry:** Phase 0 (WL-07 needs WL-09 baseline + WL-11 redaction); WL-10 needs
Phase 2 WL-05 as its `identityConfidence` consumer.

### Work items

- **WL-07 — Decompose the kitchen-sink extraction call.** Split `task_extraction`
  into 2–3 `runLlmJob` stages (extract → cheap reflect/noise-filter → classify),
  reusing existing Zod schemas as per-stage validators; pass deterministic facts
  *into* the prompt rather than asking the model. **Depends on WL-09, WL-11.**
  - Files: `src/lib/tasks/extractor.ts`, `src/lib/llm/prompts/taskExtractor.ts`,
    `src/lib/llm/router.ts`; new `src/lib/llm/prompts/factReflect.ts`.
- **WL-08 — Per-source ingestion rules (correction feedback, part 1).** Add an
  `ingestion_rules` table (per connector/project) and inject rules into the
  extraction/normalization system prompt. Wrap/constrain rule text (untrusted-adjacent).
  - Files: `src/db/schema.ts`, `src/lib/tasks/extractor.ts`,
    `src/lib/llm/prompts/taskExtractor.ts`, new settings UI; new
    `src/services/ingestionRules.ts`, `drizzle/postgres/PROPOSED_ingestion_rules.sql`.
- **WL-10 — Durable person entities.** Add `people` + `person_aliases`; resolve/
  store identities; use in `classifyTaskOwnership` and confidence. Require
  confirmation for merges (ai-safety). **Depends on WL-05.**
  - Files: `src/db/schema.ts`, `src/lib/filters/ownerFilter.ts`,
    `src/lib/tasks/extractor.ts`; new `src/services/people.ts`,
    `drizzle/postgres/PROPOSED_people.sql`.

### Migration
- All additive tables (`ingestion_rules`, `people`, `person_aliases`).

### Acceptance gates
- WL-07: extraction stability improves on a fixed transcript set (fewer spurious
  tasks / merge flips across N runs), measured against the WL-09 baseline.
- WL-08: a rule (e.g. "ignore GitHub CI") measurably changes extraction output for
  its scope.
- WL-10: repeated mentions of the same person resolve to one entity across syncs.

### Evaluation fixtures
- WL-07: stability harness running extraction ×N on a fixed transcript set (new
  fixture in `test/fixtures/`).
- WL-08: rule "ignore GitHub CI" → CI source yields no task.
- WL-10: two sources naming "Matt" → single person entity, stable ownership.

### Exit criteria
- Extraction is staged, cheaper on noise, and per-stage validated/telemetered.
- Corrections and identities persist and re-enter future runs.

---

## Phase 4 — Presentation & Trust Surfacing

**Objective:** restore the trust signals the `HumanReadableTodayView` redesign
dropped — without violating the calm, single-focus UI rule.

**Entry:** the data behind each signal is honest (WL-01 sync health, WL-05
confidence, WL-06 conflicts).

### Work item

- **WL-12 — Restore Today-view trust signals.** Show confidence on the focus card
  (reuse `ConfidenceBadge`, styled so uncertain never looks certain); render
  conflicts/blockers/coverage warnings; show partial-provider failure on Today
  chrome; give the secondary card its three pillars (or a clear link); make
  corrections reachable from Today → task detail using the existing
  write-confirmation pattern, persisted as correction feedback.
  - Files: `src/components/HumanReadableTodayView.tsx`, `src/app/page.tsx`,
    `src/app/tasks/[id]/page.tsx`.

### Migration
- None (behavior/UI only).

### Acceptance gate
- Focus card shows confidence; conflicts/blockers/failed providers are visible;
  a correction is reachable from Today. Progressive disclosure keeps the view calm.

### Evaluation fixture
- Component/snapshot test asserting these elements render when data is present.

### Exit criteria
- Every task element on Today shows evidence / next-action / done-criteria; trust
  signals are visible and corrections actionable.

---

## Phase 5 — Advanced / Deferred (only after accuracy is objectively measured)

**Objective:** the higher-effort or "investigate" items. **Do not start until P0/P1
accuracy is measured via WL-09 + labeled corpora.**

- **WL-13 — Temporal fact invalidation & memory retrieval.** Adapt CORE
  `validAt`/`invalidAt` statements onto `evidence_relations` (no Neo4j). High
  accuracy / high complexity. **Depends on WL-03, WL-06.**
- **WL-14 — Week-priority hierarchy + stall detection.** Dex
  `get_week_progress_data`. Medium complexity / medium user-value.
- **WL-15 — Role-aware config.** Dex `role_group`/`ROLES`; select prompt emphasis
  in the router. Medium complexity / medium user-value.
- **WL-16 — Deterministic action-policy layer.** continuum `app/policy/*`.
  *Investigate only* — risk of a second decision system; pursue only if a
  "what to do when unavailable" need emerges.

### Exit criteria
- Any advanced item ships with the same fixture discipline; none introduces
  autonomy, a second task system, opaque agents, or weaker traceability.

---

## Cross-Cutting: Test & Evaluation Strategy

- Worklight already runs a `tsx --test` suite (`npm test`). **Every P0
  recommendation ships with a fixture; no accuracy claim is accepted without one.**
- Build a **cross-cutting eval dataset** on top of WL-09 telemetry + a small
  labeled corpus (template: `test/fixtures/jul20DailyBriefScenario.mts`) measuring
  extraction precision, ownership accuracy, project-match accuracy, and confidence
  calibration over time.
- Each phase's fixtures (above) must be green before its exit criteria are met.

## Cross-Cutting: Migration Risk Ledger

| Item | Migration class | Pre-work |
|------|-----------------|----------|
| WL-02, WL-07, WL-11, WL-12 | None (behavior/UI) | — |
| WL-01 | Enum + counter | Add `partial` status / `itemsExtractionFailed` |
| WL-03, WL-05, WL-08, WL-09, WL-10 | Additive columns/tables | Nullable/backfillable |
| WL-04 | Cleanup + unique index | **De-dup existing rows first** |
| WL-06 | Schema redesign | Task-path relations (not `evidence_relations` reuse) |
| WL-05 | Recalibration | Re-tune 0.5/0.7 thresholds + UI copy |

## Open Questions to Resolve Before/During Execution

Carried from the audit (§22); resolve at the phase where they bite:

1. **WL-05:** store confidence components per-task, per-evidence, or both?
   (Audit leans: per-task aggregate + per-component JSON now; per-evidence later.)
2. **WL-06:** conflict severity threshold that avoids over-surfacing trivia while
   never hiding a real Jira-Done-vs-meeting conflict.
3. **WL-09 / WL-03:** retention policy for telemetry and source revisions
   (local-first disk growth).
4. **WL-07:** retire the legacy `today_briefing` + `focus_action_plan` LLM path
   immediately, or keep behind a flag until `dailyBriefV2` covers focus copy?
5. **WL-10:** auto-merge person entities on high similarity, or always require
   user confirmation (safer; aligns with ai-safety)?
6. **WL-13:** is there appetite for a temporal fact store given it is the largest
   single effort, or rely on source revisions + conflict relations as a lighter
   substitute?
