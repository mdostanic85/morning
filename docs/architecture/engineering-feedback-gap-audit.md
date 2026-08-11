# Engineering feedback gap audit (verified against code)

Scope: verify seven engineering recommendations against the current
implementation, implement only the gaps that are real, and record why the rest
were left alone. Every conclusion below cites the code that proves it.

## 1. Sync reliability / queue semantics — ALREADY IMPLEMENTED (one retry gap fixed)

Inngest already provides every semantic that was asked for:

| Requirement | Where it lives |
| --- | --- |
| Durable steps, retries, resumability | `src/inngest/functions/syncMyDay.ts` — every phase runs through `runStep` → `step.run` |
| Partial-provider failure | `src/lib/imports/providerSyncStatus.ts` `isProviderSyncFullyOk`, `partialSyncProviderRun` in `src/services/syncRuns.ts` |
| Terminal failure | `onFailure` → `finalizeFailedSyncRun` + `planTerminalSyncFailure` (`src/lib/imports/syncRunCompletion.ts`) |
| Cancellation preserving persisted data | `src/lib/imports/syncCancellation.ts`, `cancelSyncProviderRun`, the `check-cancelled-*` steps |
| Stale-run recovery | `src/inngest/functions/recoverStaleSyncRuns.ts` → `recoverStaleSyncRuns` (24h bound) |
| Safe cursor advancement | `syncProvider.ts` commits cursors only when `isProviderSyncFullyOk`; `syncResourceScopes.ts` commits per scope only when `itemsFailed === 0` |
| Failed items stay retryable | `sourceProcessingIsCurrent` in `src/lib/imports/sourceProcessing.ts` forces re-extraction, plus `backfillUnextractedSources` |
| Idempotent re-execution | sources upsert by `sourceExternalId`; evidence via `replaceEvidenceForTaskSource`; anchor adoption skips already-attached sources (`jiraAnchorEvidence.ts:145`) |

**Gap found and fixed:** `startSyncProviderRun` inserted a new
`sync_provider_runs` row on every execution. Because Inngest re-executes a
durable step from the start after a throw, a retried `sync-provider-*` step left
one orphan `running` row per attempt. Finalization then closed that orphan as
`incomplete_attempt`, so `src/app/page.tsx` (sync-health strip) and
`src/app/api/day/sync/[id]/route.ts` (`progress.total`, failed count) reported a
failed provider on a sync that had actually succeeded on retry. The claim is now
idempotent per `(syncRunId, provider)`.

BullMQ/RabbitMQ were **not** adopted: no requirement above needs a broker
Inngest cannot satisfy, and adding one would duplicate the durable-step,
cancellation and recovery machinery that already exists and is tested.

## 2. LLM context and cost — ALREADY IMPLEMENTED (one unbounded input fixed)

The deterministic-retrieval-then-reason shape is intact and was preserved:
`priorityRank.ts` ranks before the planner runs, `focusEvidenceBundle.ts` selects
and caps evidence (8 sources, 2 200 chars each, deduped by `pushSource`),
`prioritizer.ts` caps planner tasks (40) and recent sources (8 × 360 chars),
`prompts/taskQa.ts` enforces a whole-prompt budget, `prompts/deliverySyncReview.ts`
carries a per-section `BUDGET`, and `projects/signals.ts` caps discovery input
(40 sources × 280 chars). Repeated identical calls are already avoided by the
planner `inputHash` short-circuit (`prioritizer.ts`) and the brief `inputHash`
(`dailyBrief/composer.ts`).

**Gap found and fixed:** the two per-source extraction jobs (`task_extraction`,
`knowledge_extraction`) passed `sourceItem.body` verbatim with no ceiling. An
oversized source could exceed the model window; that marks the source
extraction-failed, which `sourceProcessingIsCurrent` then retries on *every*
later sync — a permanent `partially_completed` run plus the same wasted tokens
each time. `wrapUntrustedContent` (the single choke point every prompt already
passes through for secret redaction) now clamps at 60k characters, keeping head
and tail with the omission declared in the prompt.

## 3. Cheap models for volume, strong models for decisions — ALREADY IMPLEMENTED

`src/lib/llm/router.ts` `MODEL_CONFIG` already routes high-volume jobs
(`task_extraction`, `project_matching`, `knowledge_extraction`, `today_briefing`)
to Groq GPT-OSS, the cheapest model to the narrow keep/discard pass
(`task_reflect` → 20B), and Claude Sonnet only to the decision-sensitive jobs
(`priority_planning`, `task_qa`, `focus_action_plan`, `delivery_sync_review`,
`hydra_report`), each with a Groq fallback chain. No change made.

OpenRouter was **not** adopted: the router already owns multi-provider
selection, per-job model tiers, fallback chains, transient retry, JSON-schema
validation, prompt-injection wrapping, secret redaction and telemetry
(`recordLlmTelemetry`). Routing through an aggregator would remove the direct
provider control this depends on and add a third-party hop for prompt data.

## 4. Process/action-oriented rather than aggregation — ALREADY IMPLEMENTED

Extraction requires a concrete `nextAction`, at least one `doneCriteria` entry
and at least one verbatim evidence quote, and routes vague items to `unclear`
instead of inventing specificity (`prompts/taskExtractor.ts`, enforced by
`extractedTaskSchema`). Ownership must be proven from a quote that really occurs
in the source (`quoteAppearsInSource`, `resolveOwnershipFromSource` in
`tasks/extractor.ts`). Confidence stays deterministic and decomposed
(`confidenceModel.ts`, `taskConfidence.ts`) with only `extractionConfidence`
coming from the model. `promotionFloor.ts` blocks a focus claim with no real
signal. No change made.

## 5. Calendar influence on today's plan — PARTIALLY IMPLEMENTED (fixed)

Already correct: calendar events never become tasks
(`dailyFocus.ts` `shouldExtractTasksFromSourceItem`), all-day markers are
dropped (`calendar/todayMeetings.ts` `isTimedMeeting`), and calendar invites are
not treated as transcripts (`sourceAuthority.ts` `isCalendarInviteLikeSource`).

Missing: meetings had **no** effect on ordering — `rankWorkTask` never saw a
meeting, so a ticket being reviewed in an hour ranked exactly like the same
ticket with an empty calendar. `tasks/meetingPressure.ts` now adds a narrow,
deterministic prep-before-the-meeting boost, wired into `priorityRank.ts` and
supplied by `dailyBrief/composer.ts` and `prioritizer.ts`.

## 6. GitHub developer workflow — PARTIALLY IMPLEMENTED (fixed)

Already present: PR authorship vs. review-requested role, issue comments,
inline review comments, commits and failing check runs
(`connectors/github.ts` `fetchGitHubPrSignalsForRepo`).

Missing: the connector never called `GET /pulls/{n}/reviews`, so the review
*decision* — `CHANGES_REQUESTED`, `APPROVED`, `COMMENTED` — and the review body
that carries the actual feedback never reached Worklight. A blocked PR was
indistinguishable from an unreviewed one. `connectors/githubPrReview.ts` now
derives review state, whether a block is still outstanding, whether commits
landed after the newest decision, and whether the user has to act; the connector
feeds that into the existing generic source body and metadata. No separate
GitHub task engine was created.

## 7. Preserve simplicity — respected

Four isolated changes, two new pure modules, no new dependency, no schema
change, no infrastructure.

## Known pre-existing issues (not introduced, not fixed here)

- `src/lib/llm/gemini.test.mts` — three assertions fail because a `.mts` test and
  a `.ts` implementation resolve `./types` in different module realms (tsx emits
  CJS for `.ts`), so `err instanceof LlmError` is false. Test-harness only:
  bundled production code has a single realm. Fixing it means changing the
  project's module format, which is out of scope for this audit.
- `npx tsc --noEmit` reports 39 errors, all inside `*.test.mts` fixtures
  (`TS5097` extension imports and incomplete `SourceItem` fixtures).
- `npm run lint` reports 2 errors in `components/auth/SignInHeadlineCycle.tsx`
  (setState in effect) plus 13 unused-symbol warnings.
- `package-lock.json` is out of sync with `package.json` (`npm ci` fails;
  `npm install` works).
