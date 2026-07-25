# Worklight P1-3 terminal sync implementation report

Date: 2026-07-25
Branch/base: `new_arch` at `463d2d17b3b9d740d5e8d2db1d96e642058c79a7`

## 1. Outcome

The verified P1-3 lifecycle changes are implemented without P1-4
single-flight, overlap, rate-limit, debounce, idempotency-key, or
duplicate-main-event prevention work.

The final design has two recovery layers:

1. the installed Inngest SDK's exhausted-only `onFailure` callback performs
   an immediate transactional terminalization with bounded in-handler retries;
2. a conservative, bounded scheduled recovery closes active syncs that are
   still non-terminal after 24 hours.

Every parent terminalization path now closes still-`running` provider rows.
Existing completed, failed, and cancelled provider rows remain unchanged.

No commit or push was created.

## 2. Independent finding classification

Every finding was checked against `HEAD`, the working tree, installed
`inngest@4.13.0` sources, call sites, PostgreSQL behavior, and current tests.

| Finding | Classification | Resolution |
|---|---|---|
| REV-01 | **VERIFIED** | The real `syncMyDay.onFailureFn` is invoked by the PostgreSQL suite with a synthetic exhausted-failure payload. The test verifies the nested original `syncRunId`, causal phase, and that another active run is untouched. |
| REV-02 | **VERIFIED** | Added `test:p1-3-postgres` and the project verification command `test:p1-3`. |
| REV-03 | **VERIFIED** | `diagnostics` is optional at the rebuild contract boundary and normalized through `rebuildDiagnosticsFromResult`. A compatibility test passes the pre-deploy shape without `diagnostics`. |
| REV-04 | **VERIFIED** | Planner-summary persistence remains non-fatal, but its failure is logging-only. It does not change parent status or `errorSummary`. The log explains that the next sync will re-plan without exposing the caught exception. |
| REV-05 | **VERIFIED** | The production provider update now consumes the provider transition produced by `planTerminalSyncFailure`; the parallel divergent rule was removed. A PostgreSQL duplicate-delivery case covers the previously divergent cancellation state. |
| REV-06 | **VERIFIED** | The previous missing-export `SyntaxError` is no longer described as a behavioral reproduction. The production-wiring test is the behavioral regression: removing `onFailure` makes it fail before any terminal write. |
| REV-07 | **VERIFIED** | `finalizeSyncRun` now updates the parent and sweeps still-running providers in one transaction for completed, partially completed, failed, and cancelled outcomes. PostgreSQL cases cover both successful terminal statuses. |
| REV-08 | **VERIFIED** | Although latent in current callers, wrapping changed installed SDK retry semantics. `runSyncPhase` now rethrows `NonRetriableError` and `RetryAfterError` unchanged; both are covered. |
| REV-09 | **VERIFIED** | At `HEAD`, every reachable rebuild return already had `ok: true`; there was no reachable `{ ok: false }` path. The literal-success type/dead route branch remain type-honesty cleanup only. The tautological sequencing helper and tests were removed; ordinary sequential durable steps preserve the pre-existing no-publication behavior. |
| REV-10 | **VERIFIED** | Real PostgreSQL cases cover `completeSyncProviderRun`, `partialSyncProviderRun`, and `failSyncProviderRun` after cancellation. Status and cancellation error fields remain monotonic while available metrics are saved. |
| REV-11 | **VERIFIED** | Immediate retry alone could strand a run. A 15-minute cron now recovers at most 50 active rows older than 24 hours per pass. Recovery uses the same monotonic finalizer and preserves cancellation. |
| REV-12 | **VERIFIED** | The repeated non-step `check-cancelled` phase and hand-maintained phase list are real diagnostic limitations. This optional finding was not changed because it is not naturally required by the lifecycle fixes and changing the phase vocabulary would expand scope. |
| REV-13 | **VERIFIED** | Removed unreachable `rebuildOk: false` completion logic and its tests. Mandatory rebuild failures throw into exhausted-failure finalization; normal completion now derives only completed versus partially completed. |

Partially verified findings: none.
Rejected findings: none.

## 3. Runtime lifecycle

### Exhausted workflow failure

`syncMyDay` retains the main function's installed-SDK default retry behavior.
No per-attempt catch terminalizes the run. Durable operations use
`runSyncPhase` to preserve a validated causal phase while leaving
`NonRetriableError` and `RetryAfterError` untouched.

After the main function exhausts retries:

1. Inngest dispatches the separately registered `sync-my-day-failure`
   function for the matching `function_id`.
2. The handler reads `event.data.event.data.syncRunId` from the original event.
3. `failurePhaseFromError` recovers the validated causal phase.
4. `retryTerminalSyncFailureFinalization` calls `finalizeFailedSyncRun`.
5. One PostgreSQL transaction conditionally terminalizes the active parent and
   closes every provider still marked `running`.

The generated failure function contains `retries: { attempts: 1 }`. This report
does **not** claim that this proves one total executor invocation. The installed
SDK uses the same `attempts` field for the user-facing retry option, so the
precise platform execution count is not established here.

### Delayed and duplicate delivery

The parent update is guarded to `running`/`cancelling`. A delayed failure cannot
downgrade completed or partially completed runs. Duplicate failure delivery
keeps the first terminal timestamp and summary, while it may still repair a
provider row that incorrectly remains `running`.

### Cancellation

A `cancelling` status or non-null `cancelRequestedAt` resolves to `cancelled`,
not `failed`. Provider cleanup uses `cancelled`/`cancelled`. The scheduled
recovery uses the same plan, so stale cancellation remains distinct from
failure.

Platform `inngest/function.cancelled` is still not handled directly. The stale
recovery closes the corresponding application row after the conservative age
bound if no other callback does.

### Scheduled stale-run recovery

`recover-stale-sync-runs` runs every 15 minutes. Each pass selects at most 50
`running`/`cancelling` parents whose `startedAt` is at least 24 hours old and
passes each ID through the same transactional, idempotent failure finalizer.

The 24-hour bound is intentionally conservative because the schema has no
workflow heartbeat. This is lifecycle repair only: the function does not check
for an active run before starting a new one and defines no concurrency,
idempotency, singleton, debounce, cancellation, or rate-limit policy.

## 4. Provider cleanup and monotonicity

Every terminal parent write now closes lingering provider attempts:

| Persisted parent | Still-running provider result |
|---|---|
| `completed` or `partially_completed` | `failed` / `incomplete_attempt` |
| `failed` | `failed` / `workflow_failure` |
| `cancelled` | `cancelled` / `cancelled` |

Completed, failed, and cancelled provider rows are never rewritten by a later
provider completion/failure or parent sweep.

If a provider result loses a race to cancellation:

- its status, cancellation error code, cancellation message, and completion
  time stay cancelled;
- `completeSyncProviderRun` and `partialSyncProviderRun` save their full
  metrics;
- `failSyncProviderRun` saves the metrics supplied by its caller and leaves
  unspecified values unchanged.

This makes the metrics behavior deliberate rather than an unobserved side
effect of the monotonic guard.

## 5. Queue-summary and rebuild policy

The prior rebuild implementation had no reachable `{ ok: false }` return.
Mandatory reconciliation, planner, database, and queue-rebuild failures already
threw before briefing and daily-brief steps. P1-3 did not create that ordering
guarantee.

The JSON planner summary is an optimization cache used to skip unchanged LLM
planning. Its write remains non-fatal so a successful database-backed rebuild
can finish, with this explicit policy:

- the exception is not exposed or persisted;
- a fixed operational warning says the next sync will plan again;
- the parent remains `completed` when providers and briefs succeeded;
- no planner-summary diagnostic enters user-visible `errorSummary`;
- the next sync may repeat planner work because the cache was not saved.

`diagnostics` remains optional in the memoized rebuild result. Deployments can
therefore resume an older `rebuild-queue` step result without throwing.

## 6. User-visible failure copy

Terminal parent summaries translate validated phases into plain descriptions,
for example:

> Sync couldn't finish while rebuilding today's plan. Try syncing again.

Provider cleanup uses:

> This source did not finish because the sync stopped. Try syncing again.

Raw durable step identifiers such as `rebuild-queue` and diagnostic
implementation labels are not written into new user-visible lifecycle strings.

## 7. Files changed

| File | Purpose |
|---|---|
| `package.json` | Register PostgreSQL and aggregate P1-3 verification commands. |
| `src/inngest/functions/syncMyDay.ts` | Production exhausted-failure wiring, phase boundaries, rebuild compatibility, and direct sequential publication path. |
| `src/inngest/functions/recoverStaleSyncRuns.ts` | Bounded P1-3 stale-run recovery schedule. |
| `src/inngest/functions.ts` | Register stale-run recovery. |
| `src/services/syncRuns.ts` | Transactional parent/provider terminalization, plan-driven failure cleanup, cancellation-race metrics, and stale-run recovery. |
| `src/services/syncRuns.p1-3.test.ts` | Production callback, PostgreSQL monotonicity, provider cleanup, cancellation, and stale-recovery coverage. |
| `src/lib/imports/syncRunCompletion.ts` | Completion derivation, safe phase handling, retry-control preservation, deploy compatibility, and planner-summary policy. |
| `src/lib/imports/syncRunCompletion.test.mts` | Lifecycle, SDK error, compatibility, retry, and policy unit coverage. |
| `src/lib/tasks/prioritizer.ts` | Optional diagnostics contract and logging-only summary-cache policy. |
| `src/app/api/today/rebuild-queue/route.ts` | Remove the unreachable false-result branch after narrowing the rebuild result type. |
| `src/lib/connectors/jiraStatus.ts` | Server-safe Jira done-status predicate needed to import the production workflow in Node tests. |
| `src/lib/connectors/jiraStatusVisual.ts` | Keep React icon mapping separate from the server-safe predicate. |
| `src/lib/imports/jiraDoneNotifications.ts` | Use the server-safe Jira predicate. |
| `docs/architecture/worklight-p1-3-terminal-sync-implementation-report.md` | Corrected implementation and verification record. |

The unrelated untracked `.cursor` files and decision-engine forensic-audit
documents were not modified.

## 8. Automated coverage added or strengthened

- actual production `onFailureFn` invocation with a synthetic
  `inngest/function.failed`-style payload;
- original nested `syncRunId` selection and causal-phase preservation;
- old memoized rebuild result without `diagnostics`;
- `NonRetriableError` and `RetryAfterError` identity preservation;
- parent/provider exhausted-failure transaction;
- duplicate delivery and delayed delivery after success;
- cancellation finalization and the previously divergent failure-plan state;
- completed and partially completed parent cleanup of lingering providers;
- preservation of completed, failed, and cancelled provider rows;
- all three provider monotonic guards with cancellation-race metrics;
- scheduled-recovery registration with explicit absence of P1-4 controls;
- stale failure recovery, stale cancellation recovery, recent-run protection,
  and completed-run no-downgrade.

## 9. Verification results

Final verification was run from the repository root.

| Command | Result |
|---|---|
| `npm run test:p1-3` | Passed: 16 completion/lifecycle tests, 13 PostgreSQL tests, and 6 provider-status tests. |
| Mutation: remove only `syncMyDay`'s `onFailure`, then run `npm run test:p1-3-postgres` | Failed exactly the production-wiring case with `syncMyDay must register its production onFailure handler`; 12 other PostgreSQL cases passed. Restoring the handler returned the suite to 13/13. |
| `npx tsx --test src/lib/dailyBrief/blockedWaitingDedupe.test.mts src/lib/dailyBrief/needsInputRelevance.test.mts src/lib/tasks/canonicalLifecycle.test.mts src/lib/tasks/completionEvidence.test.mts` | Passed 37/37. |
| `npm run test:jul20-brief` | Exited 1 at the verified pre-existing clock-sensitive `jul20Scenario.test.mts:117` assertion; 7/8 passed. The test imports `priorityRank`, `dailyFocus`, `composer`, `jiraDoneReconciliation`, and fixtures, not a changed P1-3 file. |
| `npm test` | Exited 1 after every suite through `test:task-visibility` passed; stopped at the same July 20 line-117 assertion (7/8), matching the pre-change baseline. |
| `npx eslint <all changed source and test files>` | Passed with no findings. |
| `npx next typegen` | Passed. |
| `npx tsc --noEmit --pretty false` | Exited 1 on verified pre-existing errors only: the `TaskChatPanel.tsx:158` ES target, `.ts`/`.mts` test import-extension settings, and stale `SourceItem` fixtures. No changed P1-3 implementation file was reported. |
| `git diff --check` | Passed. |

## 10. Residual risks

1. Actual Inngest Cloud delivery still needs a deployed exhausted-failure smoke
   test. Installed-SDK registration and the production callback itself are
   covered locally.
2. A legitimate workflow lasting more than 24 hours would be classified stale.
   The conservative bound minimizes this risk, but a future heartbeat would
   make recovery more precise.
3. The three non-step cancellation probes still share the
   `check-cancelled` diagnostic phase, and the phase allow-list remains
   hand-maintained (REV-12).
4. `rebuild-queue` has pre-existing repeat-side-effect risks during a retry.
   P1-3 preserves retries but does not add P1-4 idempotency.
5. Planner-summary write failure allows the next sync to re-run planning. This
   is the documented cost of keeping the cache write non-fatal.
6. The full project type check and test chain retain unrelated baseline
   failures documented in the final verification section.

## 11. Review readiness

The implementation is ready for independent repository review. A deployed
Inngest smoke test remains a release confidence step, not a repository-code
blocker.
