# Worklight P1-3 terminal sync — independent adversarial review

Reviewed artifact: uncommitted working tree on branch `new_arch` (base `463d2d1`).
Review basis: repository code, installed `inngest@4.13.0` sources, executed tests,
and an empirical simulation of the Inngest failure round trip. The
implementation report was treated as an unverified claim throughout.

---

## 1. Verdict

**APPROVED WITH REQUIRED CHANGES**

The central design is sound and, at the database level, genuinely proven: an
SDK-registered exhausted-only failure callback drives a single transactional,
monotonic finalizer that terminalizes the parent run and every still-`running`
provider row, preserves cancellation, and cannot downgrade a completed run. I
independently confirmed the Inngest lifecycle semantics the design depends on —
they are real, not invented.

It is not approvable as-is. The single most important line in the change — the
`onFailure` wiring in `src/inngest/functions/syncMyDay.ts` — has **zero**
automated coverage; deleting it leaves all 24 new tests green. The only test
that proves provider cleanup and idempotency is not reachable from any npm
script and is excluded from `npm test`. One plausible regression converts a
fully successful sync into a terminal failure across a deploy, and two
behaviour changes (queue-summary policy, provider rows left `running` after
terminal success) are either undocumented or documented incorrectly.

Blocker thresholds were checked and **not** met: retrying vs. exhausted failure
is safely distinguished, the failure hook is real and correctly configured,
successful runs cannot be downgraded, provider rows do not remain `running`
after terminal *failure*, a failed mandatory rebuild cannot publish a brief, and
DB-level idempotency is demonstrated against real PostgreSQL.

---

## 2. Executive review summary

What holds up under independent verification:

- `onFailure` in `inngest@4.13.0` is documented and implemented as
  exhausted-retries-only, and is compiled into a **separate** function
  (`<id>-failure`) triggered by `inngest/function.failed` with an expression
  matching the parent `function_id`. I reproduced the generated config myself.
- The phase-encoding mechanism works end-to-end. I simulated the full
  wrap → `serializeError` → JSON → `StepError` → `serializeError` → JSON →
  `jsonErrorSchema.parse` → `deserializeError` path used by
  `engine.js:createFnArg()`. The custom error `name` **is** normalized to
  `Error` and `StepError.stepId` **is** dropped, exactly as the report claims —
  but the fixed message survives, so `failurePhaseFromError` correctly returns
  `rebuild-queue`.
- The DB write stores only a validated phase in a fixed sentence. No prompt,
  payload, credential, or source text is persisted.
- `finalizeFailedSyncRun` runs one real PostgreSQL transaction with a guarded
  conditional `UPDATE`, so duplicate and delayed delivery are safe.
- No P1-4 work leaked in: no `concurrency`, `idempotency`, `singleton`,
  `cancelOn`, `rateLimit`, `debounce`, and no non-atomic "existing running sync"
  pre-check in `POST /api/day/sync`.

What does not hold up:

- The test suite proves the *helpers*, not the *system*. Several new tests are
  tautological (they assert that `await a; await b` skips `b` when `a` throws,
  or that a five-line try/catch catches). None of them can fail if the
  production finalizer or its wiring is removed.
- `planTerminalSyncFailure`'s provider branch is dead code. Production
  re-derives provider status independently, and the two disagree in one
  reachable-in-principle state. Unit tests therefore certify a code path the
  runtime does not use.
- No pre-fix reproduction exists. The recorded "pre-fix failure" is a
  `SyntaxError: does not provide an export named 'failurePhaseFromError'` — a
  missing module export, not a behavioural reproduction.
- The report's justification for the rebuild-contract change is factually
  wrong at `HEAD` (see REV-09), and its API-polling claim is wrong for
  terminal-success runs (see REV-07).

---

## 3. Changed-file scope review

### 3.1 Complete change inventory

| File | Status | Necessary for P1-3? |
|---|---|---|
| `src/inngest/functions/syncMyDay.ts` | modified (+146/−…) | Yes — the only place `onFailure` can be attached and phases tagged. |
| `src/services/syncRuns.ts` | modified (+130) | Yes — transactional failure finalizer + monotonic terminal writes. |
| `src/lib/imports/syncRunCompletion.ts` | modified (+327) | Yes for phase parsing / retry helper. Partly no: `runAfterMandatorySyncPhase` and `runNonEssentialSyncDiagnostic` are new policy, not lifecycle. |
| `src/lib/imports/syncRunCompletion.test.mts` | modified (+250) | Yes, but see §9. |
| `src/services/syncRuns.p1-3.test.ts` | new, untracked | Yes — the only real proof of DB behaviour. Not wired in (REV-02). |
| `src/lib/tasks/prioritizer.ts` | modified (+24/−6) | Partly — contract literal is defensible; the queue-summary policy is not required by P1-3 (REV-04). |
| `src/app/api/today/rebuild-queue/route.ts` | modified (−8) | Consequential only. Justified in the report; the justification's premise is false (REV-09). |
| `docs/architecture/worklight-p1-3-terminal-sync-implementation-report.md` | new, untracked | Required record. |

`src/app/api/day/sync/[id]/route.ts` is named in the audit's P1-3 file list and
was **not** changed. I verified this is correct: the route already treats
`failed`/`cancelled` as terminal via its own `TERMINAL_STATUSES` set.

### 3.2 Behaviour changed outside P1-3

1. **Queue-summary write policy** (`prioritizer.ts`). A previously fatal
   `writeSummary` throw is now swallowed, downgrades an otherwise clean sync to
   `partially_completed`, and surfaces a user-visible chip. Not required by
   P1-3. → REV-04.
2. **Provider-write monotonicity** (`completeSyncProviderRun`,
   `partialSyncProviderRun`, `failSyncProviderRun` gained
   `AND status = 'running'`). Defensible under "provider-run cleanup", but it
   changes success-path semantics and is untested. → REV-10.
3. **`finalizeSyncRun` contract**: the write is now conditional, and on a no-op
   it returns `getSyncRunById(id)` instead of `null`. Callers can no longer
   distinguish "wrote" from "was already terminal". No current caller is broken
   (verified all three call sites), but the contract changed silently.
4. **`deriveSyncRunCompletionStatus` signature** gained
   `diagnosticFailureCount`, and its call site now hardcodes `rebuildOk: true`.
   → REV-13.
5. **New user-visible error strings**: `Sync failed after workflow retries were
   exhausted during phase "<phase>".` and `Provider stopped after exhausted
   workflow failure.` both reach the UI unmodified through
   `humanizeSyncIssue()`'s default branch (`SyncMyDayButton.tsx:393`,
   `:407-419`). Internal step IDs are now shown to end users.

### 3.3 Schema / API contract

No schema change. `SYNC_RUN_STATUSES` and `SYNC_PROVIDER_RUN_STATUSES`
unchanged. `errorCode` gains a new value `workflow_failure` — a free-text
column, so no migration, but it is a new persisted vocabulary item and is not
documented anywhere outside the finalizer. `GET /api/day/sync/[id]` response
shape unchanged. `POST /api/today/rebuild-queue` no longer returns HTTP 400 —
that branch was unreachable, so the observable contract is unchanged.

### 3.4 Untracked files that must not be bundled

`.cursor/commands/handoff.md`, `.cursor/rules/chat-boundaries.mdc`,
`docs/architecture/day-sync-decision-engine-forensic-audit.md`, and
`docs/architecture/day-sync-decision-pipeline-audit-scope.md` are untracked.
mtimes (14:48, 15:24, 16:15) place two of them before the implementation window
(16:22–16:24). They are not P1-3 artifacts and must be excluded from any P1-3
commit.

---

## 4. Verified Inngest lifecycle semantics

All findings below come from the installed package, not documentation or memory.

| Question | Evidence | Result |
|---|---|---|
| Installed version | `npm ls inngest inngest-cli --depth=0` | `inngest@4.13.0`, `inngest-cli@1.38.1` |
| Is `onFailure` real? | `node_modules/inngest/components/InngestFunction.d.ts:337-345` | Yes — "called if your function fails, meaning that it ran out of retries" |
| How is it dispatched? | `InngestFunction.js:117-139` | Separate config entry `<fnId>-failure`, trigger `inngest/function.failed`, expression `event.data.function_id == '<fnId>'` |
| Independent proof | Built a standalone `proof` function and dumped `getConfig()` | `worklight-proof-failure`, correct trigger + expression, `steps.step.retries = { attempts: 1 }`; the main function emits **no** `retries` key → platform default |
| Failure event shape | `types.d.ts:94-121` (`FailureEventPayload`, `FailureEventArgs`) | `data.function_id`, `data.run_id`, `data.error`, `data.event` (original payload); handler receives `error: Error` |
| Where does `error` come from? | `engine.js:1185-1204` (`createFnArg`) | `deserializeError(jsonErrorSchema.parse(event.data).error)` |
| Cancellation | `helpers/consts.d.ts:66,69` | `inngest/function.cancelled` is a **distinct** internal event; it does **not** trigger `onFailure` |
| Retry vs. exhausted | `engine.js:1006-1012` `retriability()`, `:1017-1028` `buildStepErrorOp()` (`StepFailed` vs `StepError`) | The SDK distinguishes final from retryable step errors; a still-retrying attempt never reaches the failure function |
| Duplicate/delayed delivery | Not suppressed by the SDK or repo | Must be handled at the application boundary — and is (§5) |

### 4.1 Empirical failure round trip

I reproduced the exact production chain (script run outside the repo tree, no
repository file modified):

```text
1) wrapped.name    = WorklightSyncPhase:rebuild-queue
1) wrapped.message = Worklight sync phase failed: rebuild-queue.
2) serializeError keys = [name, message, stack, cause, __serialized]
2) serializeError name = Error                 <- custom name IS dropped
3) StepError.message   = Worklight sync phase failed: rebuild-queue.
4) function.failed error has stepId? = false   <- stepId IS dropped
5) handlerError.name    = Error
5) handlerError.message = Worklight sync phase failed: rebuild-queue.
5) handlerError.stepId  = undefined
5) handlerError.cause.message = <original error text>
6) failurePhaseFromError(handlerError) = rebuild-queue   <- WORKS
```

Conclusions:

- The message-prefix channel is the **only** surviving channel, and it works.
  The `name`-prefix branch and the `stepId` branch in
  `failurePhaseFromError` are effectively dead in the real failure path (they
  only fire in the unit tests, which pass synthetic objects).
- The `cause` chain survives into the failure event and therefore reaches
  Inngest Cloud carrying the original error text. This is **not** a regression —
  the unwrapped error already went there before the change — and nothing
  sensitive is written to the database. Criterion 6 holds for persistence.
- `jsonErrorSchema` is `.passthrough().catch({})`. If the failure event's error
  fails to parse, the phase silently degrades to `workflow`. Acceptable.

### 4.2 Retry configuration

The main function declares no `retries`, so the platform default applies (SDK
docstring: "Defaults to 3"). Nothing in the change alters this — correct, since
P1-3 must preserve retries.

The failure step is configured `retries: { attempts: 1 }`. `getConfig()`
constructs the main function's retries with the identical `{ attempts }` shape
from the user-facing `retries` option, whose documented meaning is *number of
retries*. The report's claim of "one executor attempt" is therefore **not
proven** — `attempts: 1` most plausibly means one retry (two executions). This
does not change the verdict but the report should not be relied on here.

---

## 5. Failure-finalization analysis

Traced reads/writes in `finalizeFailedSyncRun` (`src/services/syncRuns.ts:301-394`):

```text
withTransaction:
  R1  SELECT * FROM sync_runs WHERE id = :id                        -> runRow | null
  R2  SELECT * FROM sync_provider_runs WHERE sync_run_id = :id      -> providerRows
  --  planTerminalSyncFailure(...)  (pure; only .syncRun is consumed)
  W1  if runRow.status IN (running, cancelling):
        UPDATE sync_runs SET status, completed_at, error_summary, updated_at
          WHERE id = :id AND status IN ('running','cancelling')  RETURNING *
        if 0 rows -> R3 re-SELECT to observe the winner
  W2  if runRow.status IN (failed, cancelled):
        UPDATE sync_provider_runs
          SET status, completed_at, error_code, error_message
          WHERE sync_run_id = :id AND status = 'running'
```

| Review question | Answer |
|---|---|
| Where is terminal failure finalized? | `syncMyDay.ts:58-70` `onFailure` → `retryTerminalSyncFailureFinalization` → `finalizeFailedSyncRun`. |
| Guaranteed to run for every exhausted failure? | For every failure that produces `inngest/function.failed` with a finite `syncRunId`, yes. **Not** for `inngest/function.cancelled` (platform/dashboard cancellation), nor if the callback is never delivered. No sweeper exists. → §15. |
| Safe to run more than once? | Yes. `W1` is a guarded conditional update; `W2` is idempotent by construction. Proven by the DB test. |
| Closes all started provider runs? | Yes when the parent ends `failed`/`cancelled`. **No** when the parent is `completed`/`partially_completed` — `W2` is skipped. → REV-07. |
| Preserves the earliest useful causal phase? | Yes on repeat (`W1` skipped, original `error_summary` retained — DB test 2 asserts `/rebuild-queue/` survives a second call carrying `post-sync-hooks`). |
| Avoids sensitive payloads? | Yes. Only `Sync failed after workflow retries were exhausted during phase "<phase>".`, with `<phase>` validated against a fixed allow-list (unknown → `workflow`). |
| Can it overwrite completed / partially completed? | No — `SUCCESSFUL_SYNC_STATUSES` guard in the plan **and** the SQL `WHERE status IN ('running','cancelling')`. Two independent barriers. |
| Can it overwrite cancelled / newer terminal state? | No. An already-`cancelled` or `failed` parent skips `W1`. |
| Can an older invocation overwrite a newer run? | No — keyed by the `syncRunId` carried in the original event. Cross-run ordering is out of scope (P1-4). |
| Can finalization fail and strand the run? | **Yes.** → REV-11. |
| Transaction boundaries sufficient? | Yes for this operation. No `SELECT … FOR UPDATE` is needed because the mutating statements are themselves guarded; `R1`/`R2` are advisory only. `withTransaction` resolves to a real `postgres-js` interactive transaction (`src/db/query.ts:56-59` → `connection.postgres`), confirmed by the passing integration test. |

One structural criticism: the "pure transition plan" is computed from `R1`/`R2`
and then **only `plan.syncRun` is used**. `plan.providerRuns` is discarded and
`W2` re-derives provider status from `runRow.status` alone. The two rules are
not equivalent — the plan treats `cancelRequestedAt != null` as cancellation
even on an already-`failed` parent, whereas `W2` would write `failed`. → REV-05.

---

## 6. Retry, duplicate, cancellation, and delayed-event analysis

### Sequence A — transient failure then success
Path: `runStep(id, op)` → `step.run` → `runSyncPhase` wraps and rethrows →
`engine.js:1066 retriability()` → wrapped error is neither `NonRetriableError`
nor the recently-rejected `StepError` → `true` → `StepOpCode.StepError`
(retryable). No code finalizes per attempt; `onFailure` is not invoked.
Later attempts succeed → `finalize-sync-run` writes `completed`.
**Final DB state:** parent `completed`, providers as written by their own steps.
**Result: correct.**

### Sequence B — retries exhausted on a mandatory phase
`rebuild-queue` exhausts → server marks the step failed → on the next
invocation `step.run` itself throws `StepError` (`engine.js:1422-1446`) *outside*
`runSyncPhase`, so it is not re-wrapped; `retriability()` returns `false`
(`engine.js:1009`, identity match on `recentlyRejectedStepError`) → run fails →
`inngest/function.failed` → `sync-my-day-failure` → `finalizeFailedSyncRun`.
`runAfterMandatorySyncPhase` never invokes `afterSuccess`, so no audit,
briefing, or `buildDailyBriefV2` step runs.
**Final DB state:** parent `failed`, `completed_at` set, `error_summary`
naming `rebuild-queue`, `whatsNew` untouched; every `running` provider row
`failed` / `workflow_failure`; previously completed/failed provider rows and
their metrics preserved; daily brief unchanged.
**Result: correct — exactly one terminal state.**

### Sequence C — duplicate failure delivery
Second `finalizeFailedSyncRun` for the same id: `R1` shows `failed` → `W1`
skipped → original `completed_at`/`error_summary`/phase preserved → `W2` still
repairs any `running` provider row. Verified by DB test 2, which asserts the
pre-existing `config_error` provider is untouched while a newly `running` one
becomes `workflow_failure`, and that the first call's `completed_at` and
`rebuild-queue` summary survive.
**Result: correct, idempotent, no duplicate side effects.**

### Sequence D — delayed failure after success
`R1` shows `completed` → plan short-circuits → `W1` guard also excludes it →
`W2` skipped. Verified by DB test 3 (status, `error_summary`, and `whatsNew`
all preserved).
**Result: success remains terminal.** Caveat: because `W2` is skipped, any
provider row this invocation left `running` stays `running`. → REV-07.

### Sequence E — finalizer fails once, then retries
`retryTerminalSyncFailureFinalization` makes up to 3 attempts with 100 ms and
200 ms delays. Success on attempt 2 → one terminal write; the transaction means
no partial state from attempt 1. If all 3 fail, the helper rethrows, `onFailure`
throws, and the failure function fails with `retries.attempts = 1` — no
application-level recovery, no sweeper, and no second `function.failed` loop
(the trigger expression pins the parent `function_id`, so there is no infinite
loop, but also no retry chain).
**Result: eventual terminal state only if the DB recovers within ~300 ms, or
within whatever single retry the platform grants.** → REV-11.

### Sequence F — cancellation
Two distinct paths, both correct:
- **Workflow observes it:** `finalizeIfCancelled` → `finalizeCancelledSyncRun`
  → `cancelRunningSyncProviderRuns` + `finalizeSyncRun('cancelled')` (guard
  admits `cancelling`) → handler returns normally → `onFailure` never fires.
- **Workflow exhausts before observing it:** `onFailure` →
  `finalizeFailedSyncRun` → `R1` shows `cancelling` (or
  `cancelRequestedAt != null`) → parent `cancelled`, providers
  `cancelled` / `cancelled`. Verified by DB test 4.
Platform-level `inngest/function.cancelled` is **not** handled — it does not
reach `onFailure`, so such a run stays `running`.
**Result: cancellation is never rewritten as generic failure.**

---

## 7. Provider-run cleanup analysis

| Failure point | Parent | Started providers | Never started | Already cancelled | Already completed |
|---|---|---|---|---|---|
| Before provider execution | `failed` | none exist | no rows created | n/a | n/a |
| During one provider | `failed` | all `running` → `failed`/`workflow_failure` | no row | preserved | preserved |
| After all providers | `failed` | none `running` (each step closed its own) | — | preserved | preserved |
| Post-provider reconciliation (`backfill-sources`, `fetch-jira-pending`, `import-linked-jira`) | `failed` | none `running` normally; orphans from step retries **are** swept | — | preserved | preserved |
| During rebuild | `failed` | swept | — | preserved | preserved |
| During finalization | `running` if all 3 attempts fail (REV-11) | left `running` | — | preserved | preserved |

Verified good: `W2`'s `WHERE status = 'running'` means successfully completed
provider rows are never rewritten as failed, and metrics on
completed/failed/cancelled rows are untouched. DB test 1 asserts exactly this
(`['completed','failed']`, and `workflow_failure` only on the row that was
`running`). This satisfies both halves of the review requirement.

Two gaps:

1. **Terminal-success parents are never swept** (REV-07). Reachable today
   because a `sync-provider-*` step that retries calls `startSyncProviderRun`
   again and **inserts a second row**, orphaning the first as `running`
   (`syncMyDay.ts:180`). `syncProvider` itself has a catch-all
   (`syncProvider.ts:236`) so it does not throw, but the surrounding DB calls
   (`startSyncProviderRun`, `completeSyncProviderRun`, `failSyncProviderRun`,
   and `upsertConnection` inside `syncProvider`'s catch) can. If the retry then
   succeeds, the parent finalizes `completed`, `finalizeFailedSyncRun` never
   runs, and the orphan is permanent. `GET /api/day/sync/[id]` then reports
   `progress.running > 0` together with `isTerminal: true`.
2. `cancelRunningSyncProviderRuns` still issues one `UPDATE` per row outside any
   transaction (`syncRuns.ts:191-196`), unlike the new single-statement sweep.
   Not a defect, but the two cleanup paths are now inconsistent.

---

## 8. Rebuild and brief-publication analysis

I read every `return` in `rebuildTodayQueue` at `HEAD` and after the change.

**At `HEAD`, `rebuildTodayQueue` never returned `{ ok: false }`.** All four exit
points returned `ok: true` (`git show HEAD:src/lib/tasks/prioritizer.ts`, lines
289, 361-362, 420, 446-447). Consequences:

- `syncMyDay.ts`'s `if (!rebuild.ok) errorParts.push(...)` was already dead.
- `POST /api/today/rebuild-queue`'s 400 branch was already dead.
- `deriveSyncRunCompletionStatus`'s `failed` branch was already unreachable
  from the workflow.
- **Criterion 8 was already satisfied at `HEAD`**: a thrown rebuild propagated
  out of `step.run("rebuild-queue")` and killed the run before
  `audit-today-figma-work` / `build-briefing` / `build-daily-brief-v2` — those
  awaits were already sequentially after it.

Verification against the review checklist:

- Failures throw rather than returning structured results — **yes**, and that
  was already true; `ok: true` now merely tells the truth.
- TypeScript types match runtime — **yes** (`ok: true` literal; `tsc` clean on
  the changed files).
- Exceptions swallowed? — **yes, one**: `runNonEssentialSyncDiagnostic` now
  catches *everything* thrown by the summary writer, including programming
  errors. → REV-04.
- Mandatory rebuild failure stops brief generation — **yes**, but by plain
  sequential `await`, exactly as before. `runAfterMandatorySyncPhase` adds
  indirection and no guarantee. → REV-09.
- Previous valid brief intact — **yes**; `buildDailyBriefV2` is never invoked.
- Failed run falsely claiming an existing brief — **not possible**; the daily
  brief has no `syncRunId` column, and `whatsNew` is only written by
  `finalizeSyncRun`, which is unreachable on this path.
- Queue/evidence mutations before the failure — **yes, and unchanged**:
  `reconcileJiraWorkItems`, `reconcileSelfReportedCompletion`,
  `pruneIrrelevantTaskEvidence`, `createEvidence` for anchor adoption, and
  `applyPlannerDecisions` all mutate before the summary write. A retried
  `rebuild-queue` step repeats all of them. That is pre-existing and out of
  scope, but it means `rebuild-queue` is **not** idempotent, and P1-3 did not
  change that.
- Unreachable branches / inconsistent callers left behind — **partly**:
  `deriveSyncRunCompletionStatus`'s `rebuildOk` parameter is now a hardcoded
  `true` at its only production call site, leaving a permanently dead `failed`
  branch that two tests still assert. → REV-13.

---

## 9. Test-quality review

24 new/changed test cases across two files. Assessed against the ten required
criteria.

| # | Test | Tests production behaviour? | Reproduces pre-fix bug? | Fails if finalizer removed? | Verdict |
|---|---|---|---|---|---|
| 1 | `deriveSyncRunCompletionStatus` × 9 (2 new) | partly | no | no | Pure-function coverage; 2 of 9 assert a now-unreachable branch |
| 2 | `failurePhaseFromError({stepId})` × 4 | **no** — `stepId` never survives to `onFailure` (proven §4.1) | no | no | **False confidence** |
| 3 | nested-cause phase test | no — synthetic object shape | no | no | **False confidence** |
| 4 | `StepError`/`serializeError` round trip | yes, partially — asserts the **serialized** object, never `deserializeError` | no | no | Genuinely valuable; incomplete (stops one hop short of the handler) |
| 5–8 | `planTerminalSyncFailure` × 4 | **provider half is dead code** (§5) | no | no | Parent half meaningful; provider half misleading |
| 9 | `retryTerminalSyncFailureFinalization` | yes (helper) | no | no | Fine, trivial |
| 10 | "does not publish a brief when the mandatory rebuild rejects" | **no** — asserts that `await a; await b` skips `b`; never imports `syncMyDay` | no | no | **False confidence for criterion 8** |
| 11 | "publishes once after a successful retry" | **no** — hand-rolled `.catch()` re-invocation, not Inngest retry | no | no | **False confidence for criterion 6** |
| 12 | `runNonEssentialSyncDiagnostic` | no — asserts a try/catch catches | no | no | Tautological |
| 13–16 | `syncRuns.p1-3.test.ts` × 4 (real PostgreSQL) | **yes** | no | **yes, for `finalizeFailedSyncRun`** | The only genuinely load-bearing tests |

Specific problems:

**Pre-fix evidence is absent (REV-06).** The report's reproduction is
`SyntaxError: does not provide an export named 'failurePhaseFromError'`. A
module-resolution error is not a behavioural reproduction; it proves only that
the helpers did not exist. None of the 24 tests is shown to have failed for the
reason P1-3 exists.

**The wiring is untested (REV-01).** Nothing imports `syncMyDay`. Removing the
entire `onFailure` block leaves `npm run test:sync-run-completion` at 20/20 and
the integration suite at 4/4. This is the exact scenario the review criteria
name ("cannot pass when the production finalizer is removed or broken"), and it
fails. Contributing cause: `src/inngest/functions/syncMyDay.ts` is not
importable in a Node test context at all — I tried, and it dies with
`TypeError: react.createContext is not a function` via
`src/lib/connectors/jiraStatusVisual.ts` → `lucide-react`. The workflow module
transitively depends on React components, so an SDK-level test would need that
import chain broken first.

**Integration coverage is unreachable (REV-02).** `src/services/syncRuns.p1-3.test.ts`
has no `package.json` script and is absent from the `npm test` chain. It only
runs if someone types the bespoke command from the report. It will rot.

**Mocks:** the integration tests correctly avoid mocking the transaction — they
hit real PostgreSQL and assert real rows. Good. Time is controlled by injecting
`completedAt` rather than faking the clock, which is adequate and deterministic.
Rows are cleaned up in `after()`.

**Missing integration coverage.** No test proves:
brief-publication suppression at the workflow level; provider cleanup triggered
by an actual exhausted failure; the three new `WHERE status = 'running'`
provider guards; that `finalizeSyncRun` is now a no-op on terminal rows; the
`errorSummary`/status effect of a failed queue-summary write.

---

## 10. Commands and results

All commands run from the repository root.

| Command | Result |
|---|---|
| `git status --porcelain` / `git diff --stat` | 6 modified, 2 new untracked in scope; 817 insertions / 68 deletions |
| `git diff --check` | clean |
| `npm ls inngest inngest-cli --depth=0` | `inngest@4.13.0`, `inngest-cli@1.38.1` — matches report |
| `npm run test:sync-run-completion` | **20/20 pass** |
| `node --env-file=.env.local --conditions=react-server --test --import tsx src/services/syncRuns.p1-3.test.ts` | **4/4 pass** against `worklight-postgres` (healthy, 127.0.0.1:5433) |
| `npm run test:sync-provider-status` | 6/6 pass |
| `npm run test:blocked-waiting-dedupe` | 9/9 pass |
| `npm run test:needs-input-relevance` | 13/13 pass |
| `npm run test:canonical-lifecycle` | 10/10 pass |
| `npm run test:completion-evidence` | 5/5 pass |
| `npm test` | **exit 1.** 20 suites green (≈220 assertions) through `test:task-visibility`; stops at `test:jul20-brief` 7/8 |
| `npx tsc --noEmit` | 27 errors, **0 in any changed file** |
| `npx eslint` on all 7 changed/new files | clean, 0 findings |
| Standalone `getConfig()` proof of a function with `onFailure` | `worklight-proof-failure`, trigger `inngest/function.failed`, expression `event.data.function_id == 'worklight-proof'`, `retries.attempts: 1`; main fn has no `retries` key |
| Empirical failure round-trip simulation (§4.1) | phase survives via message; `name` and `stepId` dropped; `cause` chain retained |
| Attempted `import` of `src/inngest/functions.ts` under Node | **fails** — `react.createContext is not a function` (lucide-react via `jiraStatusVisual.ts`) |
| `node -e 'const a=[];a.push(...undefined)'` | `TypeError: undefined is not iterable` — confirms REV-03 mechanism |

Classification:

- **Implementation regressions:** none observed in the executed suites.
- **Pre-existing failures:** `src/lib/dailyBrief/jul20Scenario.test.mts:117`
  (`assert.ok(brief.dayChange?.text.includes("UATL-376"))`). Independently
  confirmed unrelated: that file imports `priorityRank`, `composer`,
  `dailyFocus`, `jiraDoneReconciliation`, and fixtures — **none** of the changed
  files. Clock-sensitive, as the report says.
  The 27 `tsc` errors are all in `TaskChatPanel.tsx` (ES-target regex flag) and
  stale `.mts` test fixtures / import-extension settings.
- **Environment-blocked:** SDK-level verification of `onFailure` *invocation*
  (not registration) requires either a deployed run or breaking the React
  import chain; neither was possible here. Registration was proven instead.
- **Not run:** `npm run build` (not required to adjudicate P1-3; the report
  records the same pre-existing `TaskChatPanel.tsx:158` stop).

Note: because `npm test` aborts at `test:jul20-brief`, the chain never reaches
`test:canonical-lifecycle` or `test:completion-evidence`; I ran both
separately. `test:needs-input-relevance` is absent from the `npm test` chain
entirely — pre-existing, unrelated.

---

## 11. Findings

### [REV-01] The `onFailure` wiring — the load-bearing line of P1-3 — has no test
**Severity:** High **Confidence:** High
**Files:** `src/inngest/functions/syncMyDay.ts`, `src/lib/imports/syncRunCompletion.test.mts`, `src/services/syncRuns.p1-3.test.ts`
**Symbols:** `syncMyDay` `onFailure`, `failurePhaseFromError`, `finalizeFailedSyncRun`

**Problem** No test imports `syncMyDay` or exercises the failure handler.
Every new assertion targets either a pure helper or `finalizeFailedSyncRun`
called directly.

**Trigger** Delete or break `syncMyDay.ts:58-70` (drop `onFailure`, misspell
`event.data.event.data`, pass the wrong id, or swap `phase` for a literal).

**Actual behavior** `npm run test:sync-run-completion` stays 20/20 and the
integration suite stays 4/4. Type-check and lint stay clean. The regression
ships silently and every sync that exhausts retries is stranded `running`
again — the exact bug P1-3 exists to fix.

**Expected behavior** P1-3 requires the terminal guarantee to be enforced by
a test that cannot pass when finalization is removed or unwired.

**Evidence** Test imports at `syncRunCompletion.test.mts:3-12` and
`syncRuns.p1-3.test.ts:8-18` — neither references `@/inngest/*`. I also
confirmed the module cannot currently be imported under Node:
`src/inngest/functions.ts` → … → `src/lib/connectors/jiraStatusVisual.ts:10` →
`lucide-react` → `TypeError: react.createContext is not a function`.

**Impact** The single guarantee of criterion 1 is unprotected against
regression; every other passing test misrepresents the level of assurance.

**Required correction** Make the failure handler independently exercisable —
extract the handler body into a testable unit taking an injectable finalizer,
or break the React import chain so `syncMyDay` can be imported and its
`onFailureFn` invoked with a synthetic `inngest/function.failed` payload.

**Required verification** A test that constructs a failure event with a known
`syncRunId`, invokes the production handler with a stubbed/real finalizer, and
asserts the finalizer received that id and the expected phase — and that fails
when `onFailure` is removed.

---

### [REV-02] The only load-bearing integration test cannot be run by the project
**Severity:** High **Confidence:** High
**Files:** `src/services/syncRuns.p1-3.test.ts`, `package.json`
**Symbols:** `scripts.test`

**Problem** The PostgreSQL suite is registered nowhere. `package.json` has no
`test:p1-3` (or similar) script, and the `test` chain does not include it.

**Trigger** Run `npm test`, or any CI pipeline.

**Actual behavior** The four tests that actually prove transactionality,
provider cleanup, idempotency, and no-downgrade never execute. Only the bespoke
`node --env-file=.env.local --conditions=react-server --test --import tsx …`
command from the report runs them.

**Expected behavior** Integration-level proof of P1-3 must be part of the
project's routine verification.

**Evidence** `package.json:18-45` (script list) and `:46` (the `test` chain) —
`syncRuns.p1-3.test.ts` appears in neither. The file is also untracked
(`git status --porcelain` → `?? src/services/syncRuns.p1-3.test.ts`).

**Impact** The finalizer's DB behaviour will silently rot; a future schema or
Drizzle change breaks it with no signal.

**Required correction** Add a named script and include it in a chain that CI
runs (a separate DB-required chain is acceptable if `npm test` must stay
DB-free — but then that chain must be documented and wired).

**Required verification** Show the suite executing from a project script, and
document how CI supplies PostgreSQL.

---

### [REV-03] `rebuild.diagnostics` is spread unguarded, so memoized pre-deploy step output turns a successful sync into a terminal failure
**Severity:** Medium **Confidence:** Medium-High
**Files:** `src/inngest/functions/syncMyDay.ts:450,462`
**Symbols:** `errorParts.push(...rebuild.diagnostics)`, `diagnosticFailureCount: rebuild.diagnostics.length`

**Problem** `rebuild` is the memoized output of `step.run("rebuild-queue", …)`.
The change adds a new required field, `diagnostics`, to that output shape and
then consumes it with a spread and a `.length` with no fallback.

**Trigger** A run whose `rebuild-queue` step completed under the current
(pre-change) code and which resumes after this change is deployed — i.e. any
sync in flight across a rolling deploy. Inngest replays memoized step output
from the request payload rather than re-executing the step, so the old shape
`{ ok, summary, updatedTaskCount }` is handed to the new code.

**Actual behavior** `errorParts.push(...undefined)` throws
`TypeError: undefined is not iterable` (verified by `node -e`). The throw
happens after every real work step succeeded, so the function fails,
retries replay to the same point and fail again, retries exhaust, and
`onFailure` records the run `failed` — with phase `workflow`, because the throw
is in bare function-body code with no `runSyncPhase` wrapper.

**Expected behavior** P1-3 must not convert successful work into a terminal
failure, and must not regress the normal successful-sync path.

**Evidence** `syncMyDay.ts:450` and `:462`; new field at
`prioritizer.ts:67` (`diagnostics: string[]`). Inngest's memoization means
step output crosses code versions.

**Impact** A cohort of in-flight syncs at each deploy is marked `failed` and
loses its `whatsNew` payload despite having imported everything successfully.
The Today brief for those runs is still published (all brief steps already
completed), so the run status contradicts the actual outcome.

**Required correction** Treat the new field as optional at the consumption
point (default to an empty list) — or keep it out of the memoized step output
entirely and derive it outside the step.

**Required verification** A test that feeds `syncMyDay`'s completion logic a
`rebuild` value without `diagnostics` and asserts no throw and a `completed`
status.

---

### [REV-04] The queue-summary write is reclassified "non-essential" although it is the planner's idempotency cache; swallowing its failure downgrades clean syncs and re-runs the LLM
**Severity:** Medium **Confidence:** High
**Files:** `src/lib/tasks/prioritizer.ts:56,89-108,290-296,366-372,453-464`, `src/lib/imports/syncRunCompletion.ts:329-347`, `src/inngest/functions/syncMyDay.ts:450,462`, `src/components/SyncMyDayButton.tsx:413-416`
**Symbols:** `writeSummary`, `getTodayQueueSummary`, `runNonEssentialSyncDiagnostic`, `SUMMARY_PATH`

**Problem** `data/today-queue-summary.json` is not a diagnostic. It is the only
persistence for the planner short-circuit: `rebuildTodayQueue` reads it back via
`getTodayQueueSummary()` and, when `previousSummary.today === today &&
previousSummary.inputHash === inputHash`, skips `runLlmJob({ jobType:
"priority_planning" })` entirely. Declaring its write "non-essential" and
catching all errors from it changes two things that P1-3 never asked for.

**Trigger** Any `writeSummary` throw — a read-only or full filesystem, a
`process.cwd()` without a writable `data/` (the normal condition on serverless
hosts, where only `/tmp` is writable), or an EACCES.

**Actual behavior** (a) The failure is swallowed, so the next sync finds no
matching `inputHash` and re-runs the LLM planner — duplicate work and token
spend on every subsequent sync. (b) A diagnostic string enters `errorParts`, so
`deriveSyncRunCompletionStatus` returns `partially_completed` for a sync in
which every provider, the rebuild, and both briefs succeeded. (c) The raw string
reaches the UI: `humanizeSyncIssue()` has no branch for it, so
`SyncMyDayButton.tsx:414` renders "Sync issue — Non-essential sync diagnostic
failed during `queue-summary`."

**Expected behavior** P1-3 covers terminal failure state, provider cleanup, and
no-publication-on-failed-rebuild. It does not authorise changing the completion
status or the user-facing issue list for a filesystem hiccup, and it should not
silently disable the planner cache.

**Evidence** `prioritizer.ts:56` (`path.join(process.cwd(), "data", …)`),
`:89-93` (`fs.writeFileSync`), `:366-372` (the `inputHash` short-circuit that
consumes it), `:290-296` and `:453-464` (the new swallow),
`syncRunCompletion.ts:339-346` (bare `catch {}` — catches programming errors
too). `getTodayQueueSummary` has exactly one caller, inside
`rebuildTodayQueue` — grep confirms it is not a UI or API surface.

**Impact** Silent, repeated LLM planner runs (cost and sync duration); a
successful sync reported to the user as having issues; a genuinely broken data
directory no longer surfaces as an actionable failure.

**Required correction** Either keep the write essential (let it throw, as
before), or keep it non-fatal but stop it influencing `status` and
`errorSummary` — and in the latter case document that the planner cache is lost
and that the next sync will re-plan.

**Required verification** A test asserting the completion status and
`errorSummary` produced when the summary write fails, plus an explicit decision
record for the planner-cache consequence.

---

### [REV-05] `planTerminalSyncFailure`'s provider plan is dead code and diverges from the production write
**Severity:** Medium **Confidence:** High
**Files:** `src/services/syncRuns.ts:320-390`, `src/lib/imports/syncRunCompletion.ts:222-297`, `src/lib/imports/syncRunCompletion.test.mts:180-264`
**Symbols:** `planTerminalSyncFailure`, `TerminalSyncFailurePlan.providerRuns`, `finalizeFailedSyncRun`

**Problem** `finalizeFailedSyncRun` computes the full plan, then consumes only
`plan.syncRun`. Provider status is re-derived independently at
`syncRuns.ts:368-381` from `runRow.status` alone. The two rules are not
equivalent: the plan classifies as cancellation when
`status ∈ {cancelling, cancelled} || cancelRequestedAt != null`, whereas the
production write keys solely on `runRow.status === 'cancelled'`.

**Trigger** A parent that is already `failed` while carrying a non-null
`cancelRequestedAt`, then a duplicate failure delivery. The plan prescribes
provider `cancelled` / `cancelled`; production writes `failed` /
`workflow_failure`.

**Actual behavior** Four unit tests assert provider transitions on a function
whose provider output the runtime never reads. `planTerminalSyncFailure` is also
the reason `syncRuns.ts` now imports from `@/lib/imports/syncRunCompletion`,
adding a service→lib dependency for a value that is 60 % unused.

**Expected behavior** The tested transition rule must be the rule the database
write executes; idempotency must not be inferred from a parallel
implementation.

**Evidence** `syncRuns.ts:320` computes `plan`; `:343-345` uses
`plan.syncRun.*`; `:368-381` ignores `plan.providerRuns` entirely.
`syncRunCompletion.ts:249-256` vs. `syncRuns.ts:376-381` — the divergent
cancellation predicates.

**Impact** Unit-level "no provider remains running" and "cancellation stays
cancellation" evidence is not evidence about production. Only the four
PostgreSQL tests carry real weight — and they do not cover the divergent state.

**Required correction** Drive the provider write from `plan.providerRuns`, or
delete the provider half of the plan and the unit tests that imply it is
authoritative.

**Required verification** Either a plan-driven write with the existing unit
tests retained, or DB-level tests covering each provider transition the plan
currently claims.

---

### [REV-06] No pre-fix reproduction exists for any new test
**Severity:** Medium **Confidence:** High
**Files:** `docs/architecture/worklight-p1-3-terminal-sync-implementation-report.md:106-134`
**Symbols:** §3 "Pre-change reproduction"

**Problem** The recorded pre-fix evidence is
`SyntaxError: … does not provide an export named 'failurePhaseFromError'`. A
missing-export error proves only that the new helpers did not exist yet.

**Trigger** Reading the report's reproduction section as evidence.

**Actual behavior** No test is shown to have failed for a behavioural reason,
so criteria "reproduces the pre-fix bug" and "failed before the fix, with
evidence recorded" are unmet for all 24 cases. The pre-fix bug — a run stuck
`running` after exhausted retries — is in fact unreachable by these tests,
because they all call code introduced by the change.

**Expected behavior** At least one test must demonstrably distinguish the
pre-fix and post-fix systems.

**Evidence** Report lines 122-134; the test imports listed in §9 above.

**Impact** Regression protection is unproven; the suite could be entirely
self-referential and no one would know.

**Required correction** Add a test that can fail against the pre-fix system —
in practice, the wiring test from REV-01 (with `onFailure` absent, an exhausted
failure leaves the row `running`).

**Required verification** Record the same test failing with the `onFailure`
block removed and passing with it present.

---

### [REV-07] Provider rows can remain `running` forever once the parent reaches terminal *success*, contradicting the report's polling claim
**Severity:** Medium **Confidence:** High
**Files:** `src/services/syncRuns.ts:266-292,368-390`, `src/inngest/functions/syncMyDay.ts:180`, `src/app/api/day/sync/[id]/route.ts:28-52`
**Symbols:** `finalizeFailedSyncRun` provider branch, `finalizeSyncRun`, `startSyncProviderRun`

**Problem** The provider sweep runs only when the parent ends `failed` or
`cancelled`. `finalizeSyncRun` — the success/partial path — never sweeps. So a
provider row orphaned in `running` is permanent whenever the run ends
`completed` or `partially_completed`.

**Trigger** A `sync-provider-*` step that retries after `startSyncProviderRun`
has already inserted its row: attempt 1 inserts row A (`running`) and then
throws (a DB blip in `completeSyncProviderRun`/`failSyncProviderRun`, or in
`upsertConnection` inside `syncProvider`'s catch); attempt 2 inserts row B and
succeeds; the run finalizes `completed`. Also reachable via duplicate main-event
delivery, which is deliberately unaddressed (P1-4).

**Actual behavior** Row A stays `running` indefinitely.
`GET /api/day/sync/[id]` then returns `progress.running > 0` together with
`progress.isTerminal: true`, and the Today provider list shows a perpetually
running provider on a finished sync. The report asserts the opposite: "after
this patch, the route receives a terminal parent with no running provider rows".

**Expected behavior** The audit's P1-3 acceptance criterion is unqualified —
"no child provider remains running". At minimum the limitation must be stated,
not contradicted.

**Evidence** `syncRuns.ts:368` (`if (runRow.status === "failed" || … "cancelled")`)
gates the sweep; `syncRuns.ts:272-289` (`finalizeSyncRun`) contains no provider
write; `syncMyDay.ts:180` inserts a fresh row per step attempt;
report §4 "API polling", lines 219-224.

**Impact** Permanent UI inconsistency (terminal run showing a running provider)
and a monotonically growing set of stale `running` rows.

**Required correction** Sweep still-`running` provider rows on every terminal
parent transition, not only on failure — or record the gap explicitly and
schedule it.

**Required verification** A DB test that finalizes a parent `completed` with a
lingering `running` provider row and asserts the intended end state.

---

### [REV-08] `runSyncPhase` re-wraps every step error, silently disarming `NonRetriableError` and `RetryAfterError` for all durable steps
**Severity:** Low **Confidence:** High
**Files:** `src/lib/imports/syncRunCompletion.ts:145-160`, `src/inngest/functions/syncMyDay.ts:77-80`
**Symbols:** `runSyncPhase`, `runStep`

**Problem** `runSyncPhase` catches everything and throws a fresh `Error` whose
`name` is `WorklightSyncPhase:<phase>`, demoting the original to `cause`. The
SDK's control classification is name- and identity-based:
`engine.js:1008-1010` tests `error instanceof NonRetriableError ||
error?.name === "NonRetriableError"` and the same for `RetryAfterError`. A
wrapped error satisfies neither.

**Trigger** Any future step operation that throws `NonRetriableError` or
`RetryAfterError` — the SDK's documented way to stop retrying or to honour a
provider's `Retry-After`.

**Actual behavior** `retriability()` returns `true`, so a deliberately
non-retriable failure is retried three times, and a `RetryAfterError`'s delay is
discarded. Because `runStep` wraps *every* step, this applies workflow-wide.

**Expected behavior** Phase tagging must not change the SDK's retry
classification.

**Evidence** `node_modules/inngest/components/execution/engine.js:1006-1012`;
`syncRunCompletion.ts:151-158`. Confirmed by grep that no repository code
currently throws either class, so this is latent, not active.

**Impact** A future correctness or rate-limit control silently stops working —
and, for a rate-limited provider, retrying an error that asked not to be
retried can amplify the incident.

**Required correction** Re-throw the original error when its name is one the SDK
special-cases (or attach the phase to the existing error instead of replacing
it).

**Required verification** A test asserting that a `NonRetriableError` thrown
inside a `runStep` operation still presents as `NonRetriableError` to the SDK.

---

### [REV-09] The rebuild-contract change fixes nothing, and the justification for touching the API route is false at `HEAD`
**Severity:** Low **Confidence:** High
**Files:** `src/lib/tasks/prioritizer.ts:66-70`, `src/app/api/today/rebuild-queue/route.ts`, `src/lib/imports/syncRunCompletion.ts:349-356`, `src/inngest/functions/syncMyDay.ts:373-407`, report lines 3-13 and 186-199
**Symbols:** `RebuildTodayQueueResult.ok`, `runAfterMandatorySyncPhase`

**Problem** The report states P1-3 "requires the rebuild contract to stop
advertising a recoverable `{ ok: false }` branch when mandatory failures
actually throw", implying a live publish-after-failed-rebuild path. At `HEAD`,
`rebuildTodayQueue` returns `ok: true` at **every** exit point, so no such path
existed. Criterion 8 was already satisfied by ordinary sequential `await`.

**Trigger** Reviewing the change on the report's stated rationale.

**Actual behavior** Three no-op changes are presented as a fix:
`ok: boolean` → `ok: true` removes an already-dead branch; the route change
deletes already-dead code; `runAfterMandatorySyncPhase` replaces
`await rebuild; await audits…` with a helper that does exactly
`await runMandatory(); await afterSuccess()` — the same guarantee JavaScript
already gave. Test 10 in §9 then "proves" criterion 8 by testing that helper in
isolation.

**Expected behavior** Scope justification must rest on verified facts, and a
no-op restructuring should not be credited as a behavioural fix or covered by a
test that implies it is one.

**Evidence** `git show HEAD:src/lib/tasks/prioritizer.ts` — `ok: true` at lines
289, 361-362, 420, 446-447; no `ok: false` anywhere.
`syncRunCompletion.ts:349-356` — the helper body.
`syncMyDay.ts` (pre-change) — `rebuild-queue` already preceded
`audit-today-figma-work`, `build-briefing`, and `build-daily-brief-v2`.

**Impact** Overstated assurance for the acceptance criterion most likely to be
taken on trust, plus avoidable indirection in the workflow.

**Required correction** Restate the rationale accurately (type-honesty and dead-code
removal, not a publication fix), and either drop `runAfterMandatorySyncPhase`
or stop presenting its unit test as evidence for criterion 8.

**Required verification** A workflow-level assertion that `buildDailyBriefV2` is
not invoked when `rebuild-queue` rejects — or an explicit statement that the
guarantee is structural and pre-existing.

---

### [REV-10] Three provider-write monotonicity guards were added with no test, and one silently discards metrics
**Severity:** Low **Confidence:** High
**Files:** `src/services/syncRuns.ts:124,155,260`
**Symbols:** `completeSyncProviderRun`, `partialSyncProviderRun`, `failSyncProviderRun`

**Problem** Each `UPDATE` gained `AND status = 'running'`. The intent (never
rewrite a terminal provider row) is right, but the functions return `null` on a
no-op and every caller in `syncMyDay.ts` ignores the return value — so the
metrics payload is dropped with no record.

**Trigger** A provider step finishing after `cancelRunningSyncProviderRuns`
(reached via `finalizeCancelledSyncRun`) has already set the row `cancelled`.

**Actual behavior** The row keeps `status = 'cancelled'` with
`errorCode = 'cancelled'` and **zero** metrics, even though real
`itemsFetched`/`itemsCreated`/… values were available.
`cancelSyncProviderRun` deliberately supports partial metrics
(`syncRuns.ts:163,174-183`), so the data model does want them preserved.

**Expected behavior** The guard is correct; the metrics loss should be a
deliberate, tested decision rather than a side effect.

**Evidence** `syncRuns.ts:124,155,260` (guards); `syncMyDay.ts:216,242,260`
(callers discard the result); `syncRuns.ts:174-183` (metrics preserved on the
cancel path).

**Impact** Provider metrics silently lost in a cancel race. Also: no test
covers any of the three guards — `test:sync-provider-status` exercises
`syncProvider.test.mts`, not these DB functions.

**Required correction** Preserve metrics on the losing write (as
`cancelSyncProviderRun` does), or record the loss explicitly.

**Required verification** A DB test per guard, including the cancel race, that
asserts the resulting row's status, `errorCode`, and metrics.

---

### [REV-11] Finalization can still strand a run: three attempts over ~300 ms, then one platform retry and no sweeper
**Severity:** Medium **Confidence:** High
**Files:** `src/lib/imports/syncRunCompletion.ts:299-327`, `src/inngest/functions/syncMyDay.ts:58-70`
**Symbols:** `retryTerminalSyncFailureFinalization`, `onFailure`

**Problem** The application retry budget is 3 attempts with `attempt * 100 ms`
delays — the whole sequence completes in about 300 ms. Beyond that, recovery
depends entirely on the generated failure function's `retries: { attempts: 1 }`.

**Trigger** A database outage, connection-pool exhaustion, or failover lasting
longer than ~300 ms at the moment the failure callback fires — precisely
correlated with the conditions that caused the sync to fail in the first place.

**Actual behavior** The helper rethrows, `onFailure` throws, the failure
function fails. There is no reaper for stale `running` rows, and no
`inngest/function.cancelled` handler, so the run stays `running` indefinitely —
the original P1-3 bug, in a narrower window. The UI polls forever
(`progress.isTerminal: false`), and `getLatestFinishedSyncRun()` keeps returning
the previous run.

**Expected behavior** Criterion 1 requires that every logical sync *eventually*
reaches a terminal status.

**Evidence** `syncRunCompletion.ts:309-315` (delay schedule),
`:317-325` (rethrow after exhaustion); generated config
`retries: { attempts: 1 }` on the failure step (verified independently, §4).

**Impact** A small but real residual class of permanently `running` runs, with
no detection path.

**Required correction** Either lengthen/back off the finalization retry to span
a realistic DB blip, or add a bounded reaper that terminalizes `running` runs
older than the maximum function duration. The reaper is the only construct that
also covers platform cancellation and undelivered callbacks.

**Required verification** A test showing the finalizer failing for longer than
the retry budget and the resulting run still reaching a terminal state.

---

### [REV-12] The causal phase cannot distinguish the three non-step `check-cancelled` sites, and the phase list duplicates step IDs with no guard
**Severity:** Low **Confidence:** High
**Files:** `src/inngest/functions/syncMyDay.ts:83,111,155,294`, `src/lib/imports/syncRunCompletion.ts:32-70`
**Symbols:** `KNOWN_SYNC_FAILURE_PHASE_LIST`, `failurePhaseFromStepId`, `runSyncPhase("check-cancelled", …)`

**Problem** `"check-cancelled"` is used both as a real step ID (line 83) and as
the phase for three bare-body cancellation probes (lines 111, 155, 294). All
four collapse to the same recorded phase. Separately,
`KNOWN_SYNC_FAILURE_PHASE_LIST` is a hand-maintained copy of the workflow's step
IDs with nothing keeping the two in sync.

**Trigger** A failure in the per-wave cancellation probe (line 155), or adding a
new `runStep` without updating the list.

**Actual behavior** The stored summary says phase `"check-cancelled"` whether
the failure happened before providers, between waves, or after them; a new
unlisted step degrades silently to `"workflow"`.

**Expected behavior** Criterion 3 requires the terminal record to identify the
causal workflow phase.

**Evidence** `syncMyDay.ts:83,111,155,294`; `syncRunCompletion.ts:32-58`
(list), `:60-65` (unknown → `"workflow"`). I verified all 22 current step IDs
are present, so the list is correct *today*.

**Impact** Reduced diagnostic value of the terminal record and silent decay as
the workflow changes.

**Required correction** Give the three bare probes distinct phase names, and
derive or assert the phase list against the workflow's step IDs.

**Required verification** A test that fails when a `runStep` ID is missing from
the list, plus phase assertions distinguishing the three probe sites.

---

### [REV-13] `deriveSyncRunCompletionStatus`'s `failed` branch is now provably unreachable, yet two tests still assert it
**Severity:** Low **Confidence:** High
**Files:** `src/inngest/functions/syncMyDay.ts:457-463,495`, `src/lib/imports/syncRunCompletion.ts:20-46`, `src/lib/imports/syncRunCompletion.test.mts:76-110`
**Symbols:** `deriveSyncRunCompletionStatus`, `rebuildOk`

**Problem** The only production call site passes `rebuildOk: true` as a literal,
so `if (!rebuildOk && failedProviderCount === providerCount) return "failed"` can
never fire. The parameter is now vestigial, and `"failed"` is reachable only via
`finalizeFailedSyncRun` or the enqueue-error path in
`POST /api/day/sync`.

**Trigger** Reading the test suite as a description of production behaviour.

**Actual behavior** Two of nine status tests exercise dead code. `rebuildOk`
survives as a parameter that cannot be false. `syncMyDay.ts:495` likewise
returns a hardcoded `rebuildOk: true` in the handler result. (This is not a
behavioural regression: `rebuild.ok` was already always `true` at `HEAD`.)

**Expected behavior** After making the rebuild contract literal, the dead
parameter and the branch it guards should be removed or documented.

**Evidence** `syncMyDay.ts:460`; `syncRunCompletion.ts:34-38`;
tests at `syncRunCompletion.test.mts:76-86,100-110`.

**Impact** Misleading test count and a dead branch that invites a future
contradictory change.

**Required correction** Drop `rebuildOk` (and the `failed` branch) or restate
the branch in terms of a condition that can actually occur.

**Required verification** Confirm no caller can produce `rebuildOk: false`, then
remove the branch and its tests.

---

## 12. Required changes checklist

Mandatory before merge:

- [ ] **REV-01** Add a test that exercises the production `onFailure` handler
      and fails if the wiring is removed or misdirected. Make
      `src/inngest/functions/syncMyDay.ts` importable in a Node test context
      (break the `jiraStatusVisual.ts` → `lucide-react` chain) or extract the
      handler body behind an injectable finalizer.
- [ ] **REV-02** Register `src/services/syncRuns.p1-3.test.ts` as a
      `package.json` script and include it in a chain CI runs; document the
      PostgreSQL requirement.
- [ ] **REV-03** Guard `rebuild.diagnostics` at both consumption points against
      memoized pre-deploy step output.
- [ ] **REV-04** Decide and document the queue-summary policy: keep the write
      essential, or keep it non-fatal but stop it changing `status`/`errorSummary`
      — and state that the planner cache (and therefore LLM re-planning) is
      affected.
- [ ] **REV-05** Make the production provider write consume
      `plan.providerRuns`, or delete the plan's provider branch and the unit
      tests that imply it is authoritative.
- [ ] **REV-06** Record genuine pre-fix evidence (the REV-01 test with
      `onFailure` removed), or state plainly that reproduction requires
      SDK-level testing.
- [ ] **REV-07** Sweep still-`running` provider rows on terminal *success*, or
      record the gap explicitly — and correct the report's contradictory
      API-polling claim.
- [ ] **REV-10** Add tests for the three new `WHERE status = 'running'` provider
      guards, including the cancel race, and decide whether metrics loss is
      acceptable.
- [ ] **REV-11** Either widen the finalization retry to span a realistic
      database interruption or add a bounded reaper for stale `running` runs.

Recommended, not merge-blocking: REV-08, REV-09, REV-12, REV-13.

Report corrections required (the report must not stand as written):

- [ ] "the rebuild contract … advertising a recoverable `{ ok: false }` branch"
      — no such branch existed at `HEAD` (REV-09).
- [ ] "after this patch, the route receives a terminal parent with no running
      provider rows" — false for terminal-success parents (REV-07).
- [ ] "The generated failure handler … one executor attempt" — unproven;
      `attempts: 1` uses the same field as the user-facing `retries` option,
      whose documented meaning is *retries* (§4.2).
- [ ] §3 "Pre-change reproduction" — a missing-export `SyntaxError` is not a
      reproduction (REV-06).

---

## 13. Acceptance-criteria matrix

| # | P1-3 criterion | Result | Basis |
|---|---|---|---|
| 1 | Every logical sync eventually reaches exactly one terminal application status | **Partially proven** | Exhausted failure is covered and DB-proven. Not covered: `inngest/function.cancelled`, undelivered failure callback, finalizer exhausting its ~300 ms budget (REV-11). No reaper. |
| 2 | No started provider run remains `running` after terminal failure | **Proven** | `syncRuns.ts:368-389` single guarded sweep; `syncRuns.p1-3.test.ts` tests 1–2 and 4 assert real rows. Success-path orphans are a separate gap (REV-07). |
| 3 | The terminal record identifies the causal workflow phase | **Proven** | Mechanism verified end-to-end by my own round-trip simulation (§4.1); phase validated against an allow-list. Weakened by the `check-cancelled` collision (REV-12). |
| 4 | Repeated failure finalization is idempotent | **Proven** | Guarded conditional `UPDATE` inside one transaction; `syncRuns.p1-3.test.ts` test 2 asserts preserved `completed_at`, phase, and prior provider `errorCode`. |
| 5 | A completed successful run cannot later be downgraded by a delayed failure | **Proven** | Two independent barriers (`SUCCESSFUL_SYNC_STATUSES` and the SQL `WHERE`); `syncRuns.p1-3.test.ts` test 3 asserts status, `errorSummary`, and `whatsNew` survive. |
| 6 | A successful retry is not prematurely finalized as failed | **Proven** | `onFailure` is exhausted-only (`InngestFunction.d.ts:337-345`), dispatched via a separate `inngest/function.failed` function (config reproduced independently), and no per-attempt catch finalizes anything. |
| 7 | Cancellation remains distinct from failure | **Proven** | `cancelling` / `cancelRequestedAt` branch; `syncRuns.p1-3.test.ts` test 4; the SDK keeps `function.cancelled` separate from `function.failed`. |
| 8 | A failed mandatory rebuild does not publish a new daily brief | **Proven, but pre-existing** | Sequential `await` before and after the change; no `{ ok: false }` path ever existed (REV-09). No production-level test — only a helper unit test. |
| 9 | Existing successful and partial-completion flows remain valid | **Partially proven** | 20 suites green; step IDs and ordering preserved (memoization-compatible). Offset by REV-03 (successful run marked `failed` across a deploy), REV-04 (status/UI change on FS failure), REV-10 (untested guards, metrics loss). |
| 10 | No P1-4 single-flight or unrelated audit findings | **Partially proven** | P1-4: **clean** — no `concurrency`, `idempotency`, `singleton`, `cancelOn`, `rateLimit`, `debounce`, and no active-run pre-check in `POST /api/day/sync`. But the queue-summary policy (REV-04), provider-write monotonicity (REV-10), and the rebuild-contract/route change (REV-09) are adjacent scope. No ranking, extraction, ownership, confidence, evidence, Jira, or UI logic touched; no schema change. |

No criterion is **Violated**.

---

## 14. Residual risks

1. **Platform delivery of the failure callback is unverified end-to-end.**
   Registration and payload shape are proven from the installed package and the
   generated config; actual delivery from Inngest Cloud is not. The report's
   recommended deployed smoke test remains necessary.
2. **No coverage for platform-side terminal events.** `inngest/function.cancelled`,
   run deletion, and dropped callbacks all leave a run `running`. A reaper is the
   only construct that closes this class (also covers REV-11).
3. **`rebuild-queue` is not idempotent.** A retried step repeats
   `reconcileJiraWorkItems`, `reconcileSelfReportedCompletion`,
   `pruneIrrelevantTaskEvidence`, anchor-evidence `createEvidence`, and
   `applyPlannerDecisions`. Pre-existing and out of scope, but P1-3's retry
   preservation now leans on it more heavily.
4. **Error-message wrapping is a latent hazard** beyond REV-08: any future
   `catch (e) { if (e instanceof X) }` placed outside a `runSyncPhase` boundary
   silently stops matching. Today the only such check
   (`backfillExtractions.ts:106`, `SyncCancelledError`) sits *inside* the wrapped
   operation, so it is unaffected — verified.
5. **The `cause` chain reaches Inngest Cloud** carrying original error text
   (potentially prompts, SQL, or credentials in provider messages). Not a
   regression — the unwrapped error already went there — but the change makes the
   chain deeper and is worth a deliberate retention decision.
6. **Internal step IDs are now user-visible** through `errorSummary` and
   `humanizeSyncIssue()`'s default branch. Cosmetic, but new.
7. **Two cleanup implementations now coexist**: the transactional single-statement
   sweep in `finalizeFailedSyncRun` and the per-row loop in
   `cancelRunningSyncProviderRuns`. They will drift.

---

## 15. Merge recommendation

Do not merge as-is. The design is right and should be kept; the assurance around
it is not yet sufficient.

Sequence:

1. Land REV-01, REV-02, REV-03 first. Until the wiring is tested and the
   integration suite runs from a project script, the change is
   indistinguishable from a no-op to CI, and REV-03 is a live regression path
   at the next deploy.
2. Resolve REV-04, REV-05, REV-07, REV-10, REV-11 within this diff — REV-04 and
   REV-07 are behaviour and documentation questions the author must answer, not
   discoveries requiring new design.
3. Correct the four report claims listed in §12. The report currently overstates
   verification in ways that would mislead the P1-4 author, who depends on P1-3's
   lifecycle guarantees.
4. Run the deployed exhausted-failure smoke test before treating criterion 1 as
   closed, then proceed to P1-4 as a separate change. Do not combine them.

Scope verdict: the diff stays inside P1-3's intent and contains no P1-4 work. It
does carry three adjacent behaviour changes (queue-summary policy,
provider-write monotonicity, rebuild contract plus its route consumer). Only the
last is disclosed up front, and its stated justification is factually wrong. The
other two need to be either documented or removed before merge.
