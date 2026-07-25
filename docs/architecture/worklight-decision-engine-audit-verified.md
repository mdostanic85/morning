# Worklight decision engine audit — independent verification

**Verified against repository state:** `8e94069`<br>
**Verification date:** 2026-07-25<br>
**Input audit preserved:** `docs/architecture/day-sync-decision-engine-forensic-audit.md`<br>
**Scope:** extraction → reconciliation → evidence → confidence → ranking → queue/brief selection → sync publication

## 1. Verification summary

I reviewed all 23 numbered bug findings in the input audit: 18 “confirmed” findings (`WLA-01`–`WLA-18`) and five “likely” findings (`WLA-L1`–`WLA-L5`). The five `WLA-H*` entries are explicitly hypotheses rather than findings, so they are not included in the classification counts; their evidence requirements are retained in section 7.

| Result | Count |
|---|---:|
| Verified | 9 |
| Partially verified | 11 |
| Rejected | 2 |
| Requires runtime evidence | 1 |
| Duplicate | 0 |
| **Total original findings reviewed** | **23** |
| New independently discovered findings | 2 |

Overall confidence in the original audit is **Medium**. It found many real implementation mechanisms, but it repeatedly treated a real mechanism as proof of its largest possible product consequence. Eleven findings need material correction to their trigger, root cause, severity, user-visible effect, or proposed fix. Two proposed changes (`WLA-L2` and `WLA-L3`) should not be implemented. Several other recommendations are directionally useful but unsafe as written.

The most important verified risks are:

- ownership inference can silently discard the user’s work;
- generated completion prose can close open work;
- mutable text can drive irreversible evidence deletion;
- reference-only Jira keys can close and lossily merge distinct tasks;
- unverified model-generated excerpts can be persisted and displayed as quotations;
- an exception after a sync starts can prevent the sync run from ever reaching a terminal database state.

## 2. Verification methodology

The repository, not the audit, was treated as the source of truth. For each finding I:

1. decomposed the finding into trigger, path, behavior, protection, impact, root cause, recommendation, and test claims;
2. traced callers and downstream consumers rather than stopping at the named function;
3. inspected directly relevant prompts, schemas, persistence functions, filters, transactions, and tests;
4. constructed the smallest triggering state and, for pure functions, executed representative inputs against production logic;
5. searched for protections outside the file named in the audit;
6. classified only the behavior the repository actually proves.

The full `npm test` chain reached 177 passing tests and then failed in `src/lib/dailyBrief/jul20Scenario.test.mts:117`. The historical July 20 fixture calls ranking code that uses `Date.now()` for a 72-hour Jira freshness window, so on 2026-07-25 its expected `dayChange` is no longer produced. The failure is a clock-control gap, not evidence for or against the audited production findings. The remaining directly relevant suites (`canonicalLifecycle`, `completionEvidence`, and `needsInputRelevance`) were then run independently: 28 tests passed.

### Additional files required to verify claims

The following files were inspected beyond, or more deeply than, the audit’s per-finding file lists because they were necessary to reconstruct actual behavior.

| Additional file | Why it was required | Finding(s) | Effect on conclusion |
|---|---|---|---|
| `src/components/HumanReadableTodayView.tsx` | It is the final consumer of queue and brief data. | WLA-07, WLA-08, WLA-17 | Proved that queue and brief do not render two simultaneous primary cards; waiting is visibly badged; failed-provider state is persistently warned on Today. All three findings were narrowed. |
| `src/app/api/work-tasks/[id]/status/route.ts` | It is a direct status mutation path omitted from the claimed “no reopen path anywhere.” | WLA-11, WLA-15 | Proved a manual reopen path exists and that multiple manual `now` tasks can originate at write time. |
| `src/lib/connectors/jira.ts` and connector cursor code | Absence from a connector result has different meaning for full snapshots and incremental feeds. | WLA-13 | Proved the proposed generic `last_seen_at` correction is unsafe for incremental Jira batches. |
| `src/lib/tasks/evidenceVerification.ts`, `src/lib/tasks/taskReflect.ts`, `src/lib/tasks/reflectDecisions.ts`, `src/lib/llm/prompts/factReflect.ts` | The omission check required tracing whether “verbatim” evidence is actually enforced. | NEW-02 | Proved deterministic verification is advisory and fails open. |
| `src/components/SyncMyDayButton.tsx` and `src/app/api/day/sync/[id]/route.ts` | Required to follow non-terminal sync state to the user-visible polling behavior. | WLA-L5, NEW-01 | Confirmed stale-client behavior and the effect of a sync run left `running`. |
| `src/lib/tasks/jiraAnchorEvidence.test.mts` | The audit claimed adoption was untested. | WLA-16 | Contradicted that material supporting claim; adoption already has focused unit coverage. |
| `src/lib/tasks/claimAwareRanking.ts` and `src/lib/dailyBrief/jul20Scenario.test.mts` | Required to diagnose the failed regression run. | Corrected test gaps | Proved the fixture failure is caused by an uninjected wall clock. |

No application code was modified. No implementation patch or commit was created.

## 3. Original finding validation matrix

| ID | Original severity | Result | Validated severity | Confidence | Short reason |
|---|---|---|---|---|---|
| WLA-01 | Critical | Partially verified | High | High | Index promotion is real, but deferred tasks bypass it and the normal UI primary comes from the separate brief composer. |
| WLA-02 | Critical | Verified | High | High | Capitalized product nouns can classify as foreign actors, causing a silent extraction drop and later hiding. |
| WLA-03 | High | Partially verified | High | High | Generated summaries and manual pins are unsafe; one quoted negation example does not match the regex. |
| WLA-04 | High | Verified | High | High | Mutable planner prose participates in a predicate that permanently deletes provenance before ranking. |
| WLA-05 | High | Verified | High | High | Planner scalar overwrites `confidence` while components remain unchanged and low values alter routing. |
| WLA-06 | High | Verified | High | High | Any Jira key in a title is treated as identity by close/merge paths, and merge loses task fields. |
| WLA-07 | High | Partially verified | Medium | High | Two rankings exist and can disagree, but the final view renders the brief’s primary, not two primary answers. |
| WLA-08 | High | Partially verified | Medium | High | Composer writes `statusHint: now`, but the UI badges the primary as Blocked/Waiting and it is not duplicated in the blocked rail. |
| WLA-09 | Medium | Partially verified | Low | High | PostgreSQL NULL ordering is real; the claimed manual-task consequence mistakes explicit user intent for rank merit. |
| WLA-10 | Medium | Verified | Medium | High | The 30-row arbitrary candidate window can miss a real merge target and create a duplicate. |
| WLA-11 | Medium | Partially verified | Medium | High | Automatic extraction cannot reopen, but the status API can manually reopen a done task. |
| WLA-12 | Medium | Partially verified | Low | High | Prior planner status feeds later score; harmfulness and removal of all continuity weight require product validation. |
| WLA-13 | Medium | Partially verified | Medium | High | No deletion reconciliation exists, but evidence does age in score and the proposed absence rule breaks incremental providers. |
| WLA-14 | Medium | Verified | Medium | High | Suppression compares against an invisible primary and can remove the visible same-title task. |
| WLA-15 | Medium | Partially verified | Medium | High | Multiple manual `now` rows persist; the earliest cause is unconstrained status writes, not only the repair sweep. |
| WLA-16 | Medium | Partially verified | Low | High | Mismatched predicates cause delete/reinsert churn, but successful runs end and rank with the row present—no alternating score. |
| WLA-17 | Medium | Partially verified | Medium | High | Degraded data can produce a brief, but Today already shows a persistent incomplete-sync warning. |
| WLA-18 | Medium | Verified | Medium | High | Server, database, workflow, and client layers lack a per-user single-flight guard. |
| WLA-L1 | High (conditional) | Requires runtime evidence | High (conditional) | Medium | Writes are real; failure depends on deployment filesystem semantics. Daily-brief failure is caught, queue-summary failure is not. |
| WLA-L2 | Low | Rejected | Not applicable | High | Project context changes extraction semantics, so invalidating the fingerprint is correct; removing it can preserve stale output. |
| WLA-L3 | Low | Rejected | Not applicable | High | The summary is written after the transactional apply; the proposed partial-apply scenario is impossible on the active PostgreSQL path. |
| WLA-L4 | Low | Verified | Low | High | Backfill re-extracts knowledge without deleting prior rows, while creation is append-only. |
| WLA-L5 | Low | Verified | Low | High | Eight polling failures exit without refresh or later reconciliation, while the server can complete successfully. |

## 4. Detailed validation of every finding

## [WLA-01] Queue status is assigned from rank index, so a “now” and a “next” are manufactured on every sync regardless of merit

**Validation result:** Partially verified<br>
**Original severity:** Critical<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

The audit claims every normal rebuild promotes rank positions 0 and 1 to `now` and `next` without a merit floor, and that the resulting queue primary is what Today presents as the day’s first task.

### Independent code path

`rebuildTodayQueue` filters manual, unclear, and inactive-project tasks (`src/lib/tasks/prioritizer.ts:270-279`), ranks the survivors, and passes them to `buildQueueDecisionsFromRanking`. That function preserves `waiting` and `tomorrow` before applying index rules; the first remaining candidate becomes `now`, the second becomes `next`, and other forced candidates also become `next` (`src/lib/tasks/priorityRank.ts:576-616`). `applyPlannerDecisions` persists those statuses (`src/services/workTasks.ts:519-530`).

`TodayPage` computes `queue.now[0] ?? queue.next[0]` for list ordering (`src/app/page.tsx:158-220`), but the normal visible primary is resolved from `dailyBrief.todayFirst` in `resolveAttention` (`src/components/HumanReadableTodayView.tsx:155-223`). The brief composer independently ranks owned open tasks and also has no minimum merit gate (`src/lib/dailyBrief/composer.ts:170-252`).

### Trigger feasibility

A merit-free `now` is produced when at least one highest-ranked plannable candidate is not `waiting` or `tomorrow`. The original “any two surviving tasks” trigger is too broad: an all-waiting/all-tomorrow set produces no `now`, and the second row is not always `next`.

### Existing protections

Waiting and tomorrow guards precede index assignment. Manual and unclear statuses are protected from replanning. The brief filters ownership and can emit “No open owned work.” None of these protections establishes a positive evidence/urgency floor for an otherwise eligible primary.

### Actual behavior

The queue manufactures an ordinal `now` from the best non-deferred candidate even when its absolute score is weak or negative. Independently, the brief promotes the highest-ranked owned candidate without a sufficiency floor. The normal UI does not simply display `queue.now[0]`; it displays the brief result.

### Validation decision

The rank-order/merit conflation is real, but the trigger and final-consumer claims are overstated. A queue-only threshold would not fix the normal visible primary.

### Correct root cause

The pipeline has no shared, explicit primary-eligibility contract. Both queue assignment and brief composition interpret “highest available” as “safe to recommend first.”

### Correct product impact

On days with only low-signal owned work, Today can still visually dominate the page with one item under “What to do first today.” Deferred tasks are partly protected, but weak, stale, or maintenance-only candidates are not.

### Corrected recommendation

Define one deterministic primary-eligibility predicate using evidence freshness/authority, explicit due/assignment/user intent, blocking state, and a calibrated minimum. Apply it once and have queue, brief, and UI consume the same result. Provide an explicit no-primary state without hiding the open-work list.

### Required regression test

End-to-end decision test: low-signal non-deferred tasks produce no primary in both persisted queue semantics and `DailyBriefV2`; a qualified task produces exactly one shared primary; all-waiting input produces no actionable primary.

### Runtime evidence needed

Calibrate the eligibility floor using captured score components and user outcomes; code proves the missing gate but not the correct numeric threshold.

## [WLA-02] Ownership heuristic misclassifies capitalized product nouns as other people, deleting the user’s own tasks at extraction and hiding them at display

**Validation result:** Verified<br>
**Original severity:** Critical<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

The capitalized-actor regex treats product phrases such as “File Manager” and “Migration” as people. Extraction then silently drops the candidate, while display filtering can hide an already-persisted equivalent.

### Independent code path

When explicit owner/Jira assignee signals are absent, `classifyTaskOwnership` calls `namedForeignActor`, whose modal-pattern regex accepts a capitalized token or two and whose denylist checks only the first captured token (`src/lib/filters/ownerFilter.ts:147-174,208-239`). `extractTasksFromSourceItem` calls the classifier for new tasks and executes `continue` when it returns `other`, before `createWorkTaskWithEvidence` (`src/lib/tasks/extractor.ts:449-472`). For persisted rows, `decideTaskVisibility` hides `other`; Today then applies an additional mine-only filter (`src/lib/tasks/taskVisibility.ts:58-82`; `src/app/page.tsx:141-157`).

Executing the production classifier confirmed the audit’s examples: “Content File Manager needs to…”, “Part Search Banner must…”, and “Migration … should…” yield false foreign actors, while “Sofija to…” is correctly foreign.

### Trigger feasibility

The trigger is ordinary: the extraction prompt explicitly requires `owner: null` when no owner is stated and encourages short action/object titles. A capitalized product object followed by a modal in title, reason, or next action is sufficient.

### Existing protections

`NON_PERSON_ACTORS` prevents some known nouns, explicit first-person/name matches can establish ownership, and explicit owners are checked separately. The open vocabulary of product names makes the denylist incomplete. There is no persistence record for the dropped candidate.

### Actual behavior

A false `other` verdict prevents task and evidence insertion. If a similar row already exists, the Today visibility/ownership chain hides it. Re-sync deterministically repeats the extraction drop.

### Validation decision

All essential trigger, write, and display claims follow from code and representative production-function execution. Severity is High rather than Critical because the affected linguistic pattern is broad but not universal and other source wording can avoid it.

### Correct root cause

A syntactic capitalization pattern is treated as proof of person identity, and an uncertain classifier result is allowed to become a terminal destructive decision.

### Correct product impact

The user’s work can disappear without an “unclear” item, rejection record, or actionable warning.

### Corrected recommendation

Require foreign-actor candidates to resolve through known people/aliases, project participants, or transcript speakers. Unresolved candidates must become visible `unclear` work or a review record, never a silent `continue`. Record the ownership decision and its evidence.

### Required regression test

Pure classifier tests for the three false-positive product phrases and positive person controls, plus extraction integration tests proving unresolved ownership persists as `unclear` and an explicitly foreign task does not enter the user priority pool.

### Runtime evidence needed

None for correctness. Production drop counts by actor token are useful for sizing and migration.

## [WLA-03] A regex over LLM-authored text auto-closes tasks, ignoring manual pins and negation

**Validation result:** Partially verified<br>
**Original severity:** High<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

Completion regexes inspect generated evidence summaries before quotes, accept negated/interrogative contexts, ignore `statusManuallySet`, and close tasks unconditionally.

### Independent code path

Evidence creation sets `summary` to the extraction model’s `primary.reason` (`src/lib/tasks/extractor.ts:336-344`). `detectSelfReportedCompletion` selects freshest-day evidence and tests `summary` before `quote` against unanchored completion phrases (`src/lib/tasks/completionEvidence.ts:17-23,46-68`). `planSelfReportedCompletionReconciliation` receives but does not inspect `statusManuallySet` (`src/lib/imports/selfReportedCompletionReconciliation.ts:23-38`). The service then writes `done` unconditionally during every rebuild (`src/services/jiraWorkItemReconciliation.ts:145-178`; `src/lib/tasks/prioritizer.ts:245-252`).

Production-function checks confirmed:

- “Confirm whether the migration is already done” matches;
- “The old flow is done but the new one is not” matches;
- a manual `now` task still receives a close action;
- “Check that the export is not complete yet” does **not** match the current patterns.

### Trigger feasibility

A newest-day generated reason or quote containing one of the completion substrings is sufficient. No Jira status, user confirmation, or source-authority check is required.

### Existing protections

Only newest-day evidence is considered, already-done tasks are skipped, and Jira Done has its own separate authoritative reconciliation. There is no negation/clause parser, manual-intent guard, or requirement that the matching text be a literal source quote.

### Actual behavior

Some questions, mixed-completion statements, and generated summaries can close open work; manual pins do not protect it. One negation example in the audit is inaccurate.

### Validation decision

The dangerous closure path is proven, but the audit overstates the regex’s negation coverage. Its smallest proposed regex patch would also remain fragile for mixed clauses.

### Correct root cause

Model-authored rationale is stored in a field later treated as source-attributable completion evidence, and weak textual evidence is authorized to perform an irreversible lifecycle transition.

### Correct product impact

Open work can vanish into `done`; later extraction normally creates a new row rather than restoring its history. The result is especially harmful when the user explicitly pinned the task.

### Corrected recommendation

Do not auto-close from generated summaries. Require an exact verified source span plus a high-authority completion signal, and route ambiguous/self-reported completion to confirmation or conflict state. At minimum, respect manual status and reject questions, negation, and mixed-scope completion statements.

### Required regression test

Table-driven tests covering summary-only phrases, literal positive completion, question, negation, mixed old/new scope, and manual status. Add a service-level assertion that only an eligible close action writes `done`.

### Runtime evidence needed

None to establish the defect. Before migration, capture recent self-close actions and their source spans to identify rows requiring review.

## [WLA-04] Evidence is hard-deleted every sync using LLM-rewritten text as the relevance key

**Validation result:** Verified<br>
**Original severity:** High<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

Every rebuild uses title, next action, and planner-rewritten reason to decide evidence relevance, then irreversibly deletes failing rows before ranking.

### Independent code path

Planner application overwrites `reason` (`src/services/workTasks.ts:519-530`). `taskDomainText` includes title, reason, and next action; `planEvidenceRelevancePrune` compares each quote/summary with that mutable domain (`src/lib/tasks/evidenceRelevance.ts:45-53,236-282`). `pruneIrrelevantTaskEvidence` calls the raw-delete repository method (`src/services/evidenceRelevancePrune.ts:19-97`; `src/services/evidence.ts:47-50`). Rebuild invokes it before loading/ranking the queue (`src/lib/tasks/prioritizer.ts:245-255`). The read path already filters irrelevant evidence without deleting it (`src/services/workTasks.ts:102-158`).

### Trigger feasibility

Every rebuild invokes the prune. A short/paraphrased quote, a mutable reason vocabulary shift, or the aggressive stopword/token threshold can make a previously attached row fail.

### Existing protections

Matching Jira anchors and quotes containing the Jira key have special protection. The predicate has unit tests and the UI read path hides off-topic rows. There is no soft-delete field, audit record, stable extraction-domain snapshot, or restoration mechanism.

### Actual behavior

Rows judged irrelevant are permanently removed before current-run scoring. That can remove citations and ranking signals, and the original state cannot be reconstructed from the database.

### Validation decision

The complete destructive path, routine trigger, mutable key, and absence of recovery are code-proven.

### Correct root cause

An approximate read-time relevance heuristic was reused as an irreversible write-time garbage collector without stable inputs or provenance retention.

### Correct product impact

A task can retain generated instructions while losing the source excerpts that justify them; its priority can also fall when freshness, authority, or corroboration disappears.

### Corrected recommendation

Stop physical deletion in the rebuild path. Preserve provenance and represent relevance as reversible state/association metadata with reason and sync-run attribution. Base domain identity on stable extraction/anchor fields, not planner-rewritten prose, and keep read-time filtering separate.

### Required regression test

Integration test that changes only planner prose and proves the original evidence remains recoverable; predicate tests for short but valid quotes; ranking test showing reversible visibility changes do not destroy source history.

### Runtime evidence needed

None for the bug. Existing data cannot reveal already-deleted rows; restoration requires source re-import/re-extraction or backups.

## [WLA-05] The priority planner’s raw confidence scalar overwrites deterministic decomposed confidence

**Validation result:** Verified<br>
**Original severity:** High<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

Successful priority planning replaces the stored aggregate confidence with the model’s scalar while leaving `confidence_components` unchanged; the new scalar controls unclear routing.

### Independent code path

Extraction computes and stores a component aggregate (`src/lib/tasks/taskConfidence.ts:111-162`; `src/lib/tasks/extractor.ts:474-501`). `resolvePlannerConfidence` gives `semanticConfidence` first precedence (`src/lib/tasks/plannerConfidence.ts:53-72`). `rebuildTodayQueue` passes the priority-planner output into that resolver and uses the result for low-confidence routing (`src/lib/tasks/prioritizer.ts:378-415`). `applyPlannerDecisions` writes `confidence` but not `confidenceComponents` (`src/services/workTasks.ts:519-530`).

The so-called deterministic aggregate still includes an extraction-model component, but it is decomposed and attributable. That nuance does not prevent the inconsistency.

### Trigger feasibility

Every successful priority-planning response contains schema-required confidence for its decision rows. Normal top-window planning therefore triggers the overwrite.

### Existing protections

Values are clamped to `[0,1]`; contaminated equality with priority score is treated specially; manual/unclear task statuses are protected from the normal update branch. No invariant ensures scalar equals the stored component aggregate.

### Actual behavior

After planning, the scalar can describe a different assessment from the retained components. A low semantic scalar can route a task to `unclear`, while diagnostic components still explain the old value.

### Validation decision

The persistence mismatch and downstream behavioral use are direct and unguarded.

### Correct root cause

Two confidence authorities were composed by last-write-wins rather than by a declared model with versioned components.

### Correct product impact

Uncertainty routing can change based on an opaque planner opinion, and engineers/users cannot trust the stored explanation of the score.

### Corrected recommendation

Choose one authoritative confidence model. The smallest safe change is to preserve/recompute the component aggregate and store semantic assessment as a named component or separate field. Enforce a persistence invariant between final value, components, and model version.

### Required regression test

Apply a planner decision with a conflicting semantic confidence and assert the stored final confidence equals the authoritative aggregate and that components/version explain it. Cover the `1.0` contamination boundary separately.

### Runtime evidence needed

None for correctness. A distribution of scalar/component deltas is needed to size migration and changed unclear volume.

## [WLA-06] A Jira key appearing anywhere in a title is treated as work-item identity, closing and merging unrelated tasks with field loss

**Validation result:** Verified<br>
**Original severity:** High<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

Reference-only Jira keys establish canonical identity in Done and duplicate reconciliation. Follow-up tasks can therefore close with the ticket or be merged into it while only their evidence is retained.

### Independent code path

`resolveCanonicalKeyForTask` and `jiraKeyForTask` fall back from a leading key to any key in the title (`src/lib/tasks/canonicalKey.ts:26-42`; `src/lib/tasks/transcriptTaskMerge.ts:128-132`). `planJiraDoneReconciliation` treats that key as task ownership unless evidence checks already qualify it, and `planDuplicateJiraTaskMerge` groups open rows by the same canonical value (`src/lib/imports/jiraDoneReconciliation.ts:70-82,117-158`). The service copies loser evidence and sets the loser `done`; it does not merge next action, criteria, reason, due date, owner, waiting state, or meeting context (`src/services/jiraWorkItemReconciliation.ts:90-131`).

Executing the production planners with “UATL-380 · Design banner” and “Write QA plan for UATL-380” placed both under `jira:default:UATL-380`; duplicate reconciliation merged the second, and Jira Done reconciliation selected both for closure.

### Trigger feasibility

Any distinct task whose title references the same key is enough. QA, handoff, release, review, or follow-up work naturally uses this phrasing.

### Existing protections

Leading-key tasks and matching Jira evidence are legitimate anchors, and extraction-time exact-title matching is more cautious. Existing lifecycle tests cover only titles where the key truly identifies the task.

### Actual behavior

Reference-only work can be closed with the Jira issue or lossily absorbed into the anchor.

### Validation decision

Identity resolution, both destructive consumers, and field loss are all proven.

### Correct root cause

A permissive “mentions key” helper was reused as an identity predicate in paths that lack a relevance/relationship check.

### Correct product impact

Distinct follow-up work disappears from the open queue, and its actionable fields are not preserved on the surviving row.

### Corrected recommendation

Persist an explicit relation: `identity/anchor`, `references`, or `depends_on`. Restrict Done/duplicate reconciliation to explicit identity (leading key only as a migration fallback, or matching canonical field/Jira anchor evidence). Refuse or losslessly model merges when actionable fields differ.

### Required regression test

Both planners must leave a reference-only QA task open when the ticket closes and must not classify it as a duplicate. A genuine duplicate must still merge, with all non-equivalent actionable content preserved or surfaced for review.

### Runtime evidence needed

None for correctness. Query closed reasons and referenced titles to identify potentially mis-merged historical rows.

## [WLA-07] Two independent rankings over two different task populations both answer “what should I do first”

**Validation result:** Partially verified<br>
**Original severity:** High<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Queue rebuild and `DailyBriefV2` independently rank different candidate populations, double-apply claim-aware adjustments in the composer, and allow Today to show two different primary answers simultaneously.

### Independent code path

Queue rebuild removes manual, unclear, and inactive-project tasks, does not apply an ownership filter, and calls `rankWorkTasks` (`src/lib/tasks/prioritizer.ts:270-324`). The composer removes Done/self-complete rows, keeps only owned tasks, includes manual/unclear/inactive-project rows, calls `rankWorkTasks`, and then applies `claimAwareScoreAdjustment` a second time (`src/lib/dailyBrief/composer.ts:170-247`). `rankWorkTask` already applies that adjustment (`src/lib/tasks/priorityRank.ts:358-369`).

`TodayPage` does compute a queue primary for ordering (`src/app/page.tsx:158-220`), but `HumanReadableTodayView.resolveAttention` iterates `dailyBrief.todayFirst` and `afterThat` when a brief exists (`src/components/HumanReadableTodayView.tsx:155-223`). It resolves the brief item back to an owned task and renders only that attention order.

### Trigger feasibility

Different ownership, manual state, unclear status, inactive project, or claim-aware boosts can produce different winners. A concrete code-level scenario is a foreign/null-owned top queue task plus a lower-scoring owned maintenance task: queue status selects the former while the composer selects the latter.

### Existing protections

The final view rejects stale brief references to missing/non-owned work. Manual pins tend to make the two paths agree because the composer gives them `+1000` and persisted queue status protects them. No invariant compares queue `now` with brief `todayFirst`.

### Actual behavior

Two inconsistent decision calculations exist and can persist/describe different winners. The normal Today surface renders the brief primary, not a second simultaneous queue-primary card. Queue status still feeds future ranking, fallback rendering, and task-list ordering.

### Validation decision

The architectural split and double adjustment are verified; the headline user impact (“two answers simultaneously”) is contradicted by the final consumer.

### Correct root cause

The brief was implemented as another decision engine rather than as a rendering of one canonical decision result.

### Correct product impact

Stored status, explanation, and visible primary can disagree. Engineers cannot trace one authoritative choice, and fallback/no-brief behavior can differ from normal rendering.

### Corrected recommendation

Produce one versioned decision result containing eligible population, ordered scores, primary eligibility, and chosen primary. Persist it transactionally and have queue, brief, and UI render it. Remove the composer’s duplicate claim-aware adjustment immediately after characterization.

### Required regression test

For ownership, manual, unclear, inactive-project, and claim-boost fixtures, assert one shared primary ID across decision output, stored queue state, generated brief, and rendered focus card.

### Runtime evidence needed

Capture current queue/brief primary mismatch rates before migration to identify behavior changes.

## [WLA-08] A `waiting` task can be published as `todayFirst` with `statusHint: "now"`

**Validation result:** Partially verified<br>
**Original severity:** High<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

The composer can choose a waiting task as `todayFirst`, label it `now`, omit waiting context, and also list it in `blockedWaiting`.

### Independent code path

All open statuses are passed to the composer. Ranking penalizes waiting but does not exclude it. The primary branch initializes `statusHint = "now"` and tests only reason/next-action text for unclear phrases; unlike the secondary branch, it does not include task status or the token `waiting` (`src/lib/dailyBrief/composer.ts:249-334`). The blocked list explicitly excludes the chosen primary by task ID (`src/lib/dailyBrief/composer.ts:339-410`).

At render time, `statusBadge` checks `waitingOn`, blocked matches, task status, and `statusHint` before the index-zero “First today” label (`src/components/HumanReadableTodayView.tsx:119-153`). The task object remains attached to the brief item, so a waiting primary is visibly badged Blocked/Waiting even though the structured brief says `now`.

### Trigger feasibility

A single owned waiting task is sufficient. Executing the composer with `status: waiting` and `waitingOn: Lucas` produced `todayFirst.statusHint: "now"` and an empty `blockedWaiting` array.

### Existing protections

Large negative ranking weights make waiting less likely when actionable alternatives exist. The final UI corrects the badge from live task state. The primary is de-duplicated from the blocked rail.

### Actual behavior

The structured daily brief is internally wrong and the blocked item can occupy the dominant focus slot. The UI does not present it with a false “First today” badge and does not duplicate it in the blocked list.

### Validation decision

The data-contract error and wrong primary eligibility are real; two material user-visible claims in the audit are false.

### Correct root cause

Primary and secondary eligibility/status classification are separate branches with different predicates, and selection does not exclude non-actionable states.

### Correct product impact

Today can devote its main card to work the user cannot advance, but it visibly identifies the block.

### Corrected recommendation

Exclude waiting/blocked tasks from actionable primary eligibility. If no actionable task exists, render the no-primary state and place the item in Needs Input. Preserve `waitingOn` in the structured item.

### Required regression test

Single waiting task: no actionable primary, one blocked/needs-input entry, correct waiting status/context. Mixed actionable/waiting input: actionable task is primary.

### Runtime evidence needed

None.

## [WLA-09] `priority_score DESC` puts NULLs first in PostgreSQL

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Low<br>
**Verification confidence:** High

### Original claim

Unscored tasks sort first within a status group, making never-planned manual/unclear work primary regardless of merit.

### Independent code path

`getTodayQueue` orders only by `desc(priorityScore)` (`src/services/workTasks.ts:326-348`). PostgreSQL uses NULLS FIRST for descending order, and this repository’s active database dialect is PostgreSQL. New task paths may leave `priorityScore` null. Manual/unclear rows are filtered before decision generation (`src/lib/tasks/prioritizer.ts:270-279`), so the protected score-update branch in `applyPlannerDecisions` is not reached from normal rebuild input.

The final normal primary is nevertheless brief-ranked rather than selected directly from SQL order. Composer ranking recomputes task scores; a manual task’s `+1000` represents explicit user intent rather than an accidental null advantage.

### Trigger feasibility

A null-scored row and a scored row in the same status bucket are enough to observe database ordering. Primary harm additionally requires fallback/no-brief rendering, a tie dependent on input order, or page logic that uses the queue primary.

### Existing protections

Composer recomputes ordering for the normal visible brief. Manual status is an intentional priority signal. There is no explicit `NULLS LAST` or stable secondary sort.

### Actual behavior

Queue arrays have unstable and counterintuitive null-first order. The audit overstates this as direct normal-primary selection and treats user-pinned work as if it had no merit signal.

### Validation decision

The database behavior is proven, but its main claimed consequence and part of its recommendation are not.

### Correct root cause

The query lacks an explicit null policy and deterministic tie-break; score refresh policy is a separate design issue.

### Correct product impact

Fallback ordering and tie behavior can be unstable. This can also participate in invisible-primary and same-title suppression paths.

### Corrected recommendation

Use explicit `NULLS LAST` and a stable secondary key. Do not broaden planner mutation of manual/unclear tasks merely to populate scores; if their display order needs a score, compute a read-only comparable order without changing protected status.

### Required regression test

PostgreSQL integration test with null/non-null/tied scores asserting explicit stable order, plus a no-brief UI test.

### Runtime evidence needed

None.

## [WLA-10] The merge-candidate window is 30 tasks ordered by a timestamp the planner writes identically

**Validation result:** Verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Extraction sees only 30 recent open tasks. Planner writes one identical timestamp to many rows, making that window arbitrary and allowing duplicates.

### Independent code path

`getWorkTasks` orders by `updatedAt DESC`; extraction filters open/project-compatible rows and slices to 30 before both its LLM prompt and deterministic merge resolution (`src/services/workTasks.ts:432-438`; `src/lib/tasks/extractor.ts:223-265`). `applyPlannerDecisions` computes one `now` string and writes it to every updated row (`src/services/workTasks.ts:494-530`). Every merge strategy operates only on the passed candidate array.

### Trigger feasibility

More than 30 project-compatible open tasks after a prior rebuild is sufficient. If the real Jira/title/topic target is outside the non-total order, extraction cannot resolve it and inserts a new row.

### Existing protections

Project filtering narrows candidates; later duplicate Jira reconciliation can merge Jira-keyed duplicates, but that merge is lossy (WLA-06). Meeting-only duplicates have no equivalent cleanup.

### Actual behavior

The candidate set can omit the correct target for reasons unrelated to semantic relevance. A duplicate then enters the persistent task set.

### Validation decision

The entire selection-to-insert path and realistic trigger are code-proven.

### Correct root cause

Identity/relevance lookup is bounded by a presentation-style recency window with a non-total ordering.

### Correct product impact

Duplicate tasks compete in ranking; Jira duplicates may later be lossily consolidated, while non-Jira duplicates persist.

### Corrected recommendation

Separate deterministic identity lookup from prompt-size control. Query all strict canonical/Jira matches and indexed normalized-title/topic candidates, union them with a bounded contextual prompt set, and use stable ordering.

### Required regression test

With 40+ open tasks and the true target outside the contextual 30, ingest a matching Jira-key and a matching meeting-only update; assert both attach to the existing ID and no duplicate is inserted.

### Runtime evidence needed

None.

## [WLA-11] There is no reopen path—closed work that resurfaces becomes a new task with no history

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Done tasks are excluded from extraction matching and no code path can reopen them, so fresher contradictory work always becomes a new history-less row.

### Independent code path

Extraction calls `getWorkTasks`, removes `status === "done"`, and resolves only the remaining 30 (`src/lib/tasks/extractor.ts:223-235`). `getTodayQueue` and planner decisions also exclude done rows. The automatic reconcilers move toward done, not away.

However, `src/app/api/work-tasks/[id]/status/route.ts:7-16,53-82` maps user actions to statuses and calls `updateWorkTask` for the addressed row without excluding done. A user can manually “start” or otherwise reopen an existing done task.

### Trigger feasibility

Automatic duplication occurs when a later source reintroduces work matching a done row and the extraction model emits a new candidate. It is especially likely after an erroneous self-close. A manual reopen requires the user/API to know and address the done task ID.

### Existing protections

The generic status endpoint is a manual reopen path. Jira Done reconciliation may close a reopened Jira-identity task again while Jira remains Done. No automatic search of recent closed candidates or source-conflict policy exists.

### Actual behavior

Normal extraction cannot preserve continuity across reopen and will insert a new task. The absolute “no code path anywhere” statement is false.

### Validation decision

The automatic lifecycle defect is real, but the repository contains a manual reopen path and the proposed automatic rule needs authority safeguards.

### Correct root cause

Closed tasks are removed from identity resolution, and closure provenance/authority is not modeled for later conflict evaluation.

### Correct product impact

Resurfacing work usually appears as a new task with split evidence/history unless the user manually locates and reopens the old row.

### Corrected recommendation

Include a bounded, explicitly queried set of recently closed identity candidates. Reopen the original ID only when fresher evidence legitimately supersedes the recorded closure authority; otherwise create a conflict requiring confirmation. Store closure/reopen provenance.

### Required regression test

Cover self-reported erroneous closure, Jira genuinely reopened, Jira still Done plus contradictory transcript, and manual reopen. Assert correct ID continuity and no close/reopen oscillation.

### Runtime evidence needed

None for the missing automatic path; production closure provenance is needed to migrate existing duplicates safely.

## [WLA-12] Prior queue status feeds the score, so the same source data yields different plans

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Low<br>
**Verification confidence:** High

### Original claim

`STATUS_WEIGHT` gives prior `now`/`next` output a positive advantage, creating self-reinforcing plans from identical source inputs. The audit recommends removing positive queue-status weights.

### Independent code path

`rankWorkTask` starts with `STATUS_WEIGHT`: now `+80`, next `+40`, later `0`, tomorrow `-120`, unclear `-200`, waiting `-300` (`src/lib/tasks/priorityRank.ts:57-64,194-209`). The prior rebuild wrote those statuses through `applyPlannerDecisions`, and the next rebuild reads them. `rankWorkTasks` sorts only on score, with no explicit tie-break (`src/lib/tasks/priorityRank.ts:403-419`).

### Trigger feasibility

Every subsequent rebuild can carry prior status into current score. Two otherwise equal rows can diverge after one wins `now`.

### Existing protections

Fresh evidence, assignments, due dates, authority, manual intent, and deferral signals can overcome the relatively small positive weights. Manual intent already has its own `+1000`. There is no status-origin field separating user state from planner output.

### Actual behavior

The ranking is path-dependent. Code alone does not establish whether all continuity/hysteresis is unwanted, nor whether removing the weights improves user outcomes rather than causing daily churn.

### Validation decision

The feedback loop is proven; the claim that it is necessarily an incorrect product behavior and the blanket removal recommendation are not fully established.

### Correct root cause

One status field conflates planner output, user intent, blocked state, and continuity state, then ranking consumes it without origin semantics.

### Correct product impact

Prior winners receive inertia and ties can become permanently insertion-order-dependent. Evaluation replay is harder because persisted output affects later input.

### Corrected recommendation

First separate status origin or explicit in-progress/user-intent state from planner assignment. Remove positive weight only from machine-assigned ordinal output; retain deliberate user continuity. Add a deterministic tie-break and evaluate volatility on recorded queues.

### Required regression test

Replay identical external evidence through two different prior machine-status states and assert the canonical decision is equal; separately prove explicit user “in progress” intent retains continuity.

### Runtime evidence needed

Labeled replay comparing current hysteresis with the corrected model is needed before selecting weights or removing continuity entirely.

## [WLA-13] Provider-side deletions are never reconciled; no source or task is invalidated

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

The import loop never marks absent/deleted provider objects, so stale source/task state persists indefinitely. It proposes `last_seen_at` and tombstoning after N successful syncs.

### Independent code path

`importConnectorSources` processes only returned candidates and contains no comparison with previously stored provider rows. Source schema has no deletion/tombstone lifecycle used by sync. On edit, the source row and its evidence for newly resolved tasks can update, but tasks created from removed content are not comprehensively retracted. Knowledge is explicitly replaced for the import path.

The Jira connector uses an incremental `updatedSinceIso` query/cursor. An unchanged live Jira issue is correctly absent from most successful batches. Therefore absence from a successful provider call is not generally proof of deletion.

### Trigger feasibility

A true provider deletion, revocation, or content edit removing an action can leave local derived state. Whether the connector can expose deletion depends on provider API semantics and sync mode.

### Existing protections

Source dates naturally lose ranking freshness over time; therefore the audit’s claim that evidence “does not age out” is false as a scoring statement. Content revisions are recorded, changed sources are reprocessed, and knowledge is replaced. No task invalidation or deletion-confidence policy exists.

### Actual behavior

Stale persistent source/task evidence can remain, although its recency score decays. A generic unseen-counter would falsely tombstone unchanged objects for incremental providers.

### Validation decision

The missing deletion/edit retraction lifecycle is real. The magnitude is narrower than claimed, and the proposed correction is unsafe without provider-specific completeness semantics.

### Correct root cause

Connector results do not declare whether they are full snapshots, incremental deltas, or explicit deletions, while derived tasks lack source-validity provenance.

### Correct product impact

Retracted or deleted work may remain open and cited locally, gradually becoming less fresh but never being explicitly flagged as withdrawn.

### Corrected recommendation

Define provider capabilities: full-snapshot reconciliation, incremental update, and explicit deletion event. Tombstone only on an authoritative deletion/full inventory; use periodic full reconciliation where supported. Flag sole-source dependent tasks for confirmation rather than auto-close.

### Required regression test

Provider-contract tests: absent object in an incremental batch remains live; absent object in a declared full snapshot is tombstoned; explicit delete marks the source; dependent multi-source and sole-source tasks receive different flags.

### Runtime evidence needed

Provider payload/cursor traces are needed to select reconciliation mechanisms and retention windows for each connector.

## [WLA-14] Same-title suppression can drop a task when the primary was filtered out

**Validation result:** Verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Today derives `primaryTask` from a lenient queue, builds rendered tasks through stricter ownership filters, then suppresses same-title rows against the primary even when that primary is absent from the rendered set.

### Independent code path

`filterQueueByOwners` retains null-owner rows. `TodayPage` then builds `allOpenTasks` through `filterTasksForTodayView` plus mine-only `taskEligibleForBriefPriority`, but derives `primaryTask` from the earlier queue (`src/app/page.tsx:61-62,141-160`). `orderedTasks` first tries to add that primary ID and then removes every other row with the same normalized title (`src/app/page.tsx:209-220`).

### Trigger feasibility

A queue-leading null/ambiguous/other-owned task that fails strict display filtering plus a visible owned task with the same normalized title is sufficient. Duplicate creation paths make same-title pairs realistic.

### Existing protections

The brief resolver independently drops stale/non-owned item references. It does not restore a task removed from the `tasks` prop before rendering. There is no guard that the suppression key belongs to a displayed primary.

### Actual behavior

The first array is empty and the visible same-title task is removed by the second array. Neither task appears.

### Validation decision

The exact trigger and disappearance follow directly from page-level array construction.

### Correct root cause

Ordering/de-duplication uses an entity selected from a broader population than the population being rendered.

### Correct product impact

An otherwise valid owned task can disappear from Today because an invisible duplicate won the raw queue.

### Corrected recommendation

Select/reconcile the primary from the final visible task population, and de-duplicate by stable task identity/canonical relationship rather than normalized title. Never suppress against an entity that is not rendered.

### Required regression test

Page/component fixture with an invisible queue leader and visible same-title owned task; assert the owned row/focus card appears. Add non-duplicate same-title controls.

### Runtime evidence needed

None.

## [WLA-15] The single-`now` sweep skips manual rows, so multiple manual `now` tasks persist

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

`applyPlannerDecisions` orders all `now` rows but skips demoting manual rows, so multiple manual `now` tasks survive. The proposed fix demotes all but the first in the repair sweep.

### Independent code path

The status endpoint can set any addressed task to `now` and `statusManuallySet: true`; `ensureWorkTaskForJiraIssue` can also create a manual `now` row. Neither operation atomically demotes an existing manual `now`. Rebuild excludes manual rows from decisions (`src/lib/tasks/prioritizer.ts:270-279`). If decisions are applied, the sweep orders manual rows first but skips every manual row in `nowRows.slice(1)` (`src/services/workTasks.ts:533-545`). If no plannable task exists, rebuild returns before calling `applyPlannerDecisions`, so no sweep runs at all.

### Trigger feasibility

Starting/creating two tasks through the manual paths is sufficient.

### Existing protections

The UI may encourage one focus, but no database constraint or write transaction enforces it. The sweep demotes extra non-manual rows only.

### Actual behavior

Multiple manual `now` rows persist. Which one the system presents first can depend on null scores, timestamps, or composer ranking.

### Validation decision

The invariant failure is real. The audit identifies a symptom/failed repair but not the earliest cause, and unconditional repair-time demotion could silently reverse explicit user actions.

### Correct root cause

The single-primary invariant is not enforced at the command that creates manual focus state, and “manual” is treated as globally immutable by later repair.

### Correct product impact

Today can have several user-pinned “current” tasks and an unstable choice of which one visually dominates.

### Corrected recommendation

Enforce the invariant transactionally when a user sets `now`: atomically demote or explicitly replace the previous manual focus, with clear product semantics. Add a one-time deterministic repair policy for existing rows; keep background planning from silently overriding manual intent.

### Required regression test

Concurrent and sequential “start” commands must end with exactly one manual `now` for the user. Rebuild must preserve that winner and demote only machine-assigned extras.

### Runtime evidence needed

None for the defect; current multiple-manual counts help choose migration policy.

## [WLA-16] Evidence adoption and pruning use different inputs, producing insert/delete churn

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Low<br>
**Verification confidence:** High

### Original claim

Adoption scores source title/body while pruning scores the individual quote, so an adopted row is deleted on one sync and re-added on the next, causing the anchor score to alternate.

### Independent code path

`planJiraAnchorEvidenceAdoption` compares source title plus a body prefix with anchor topic text and preserves the fragment quote (`src/lib/tasks/jiraAnchorEvidence.ts`). `planEvidenceRelevancePrune` judges that quote/summary against task domain text (`src/lib/tasks/evidenceRelevance.ts:236-282`). Rebuild executes prune first, adoption second, then ranks (`src/lib/tasks/prioritizer.ts:245-324`).

Executing the production predicates with a source titled around “Content File Manager” and the quote “finish the remaining screens” produced an adoption followed by a prune decision on the next pass.

### Trigger feasibility

The source-level text must meet the adoption overlap while its chosen quote fails per-quote relevance. This is straightforward for broad meeting titles/body prefixes and short pronoun-heavy quotes.

### Existing protections

Jira anchor evidence itself is protected. Adoption has focused tests, contrary to the audit’s claim. Most importantly, normal successful rebuild ordering re-adds the row **before the same run ranks**, so every successful run ends and scores with the adopted row present.

### Actual behavior

The row can be physically deleted and recreated every run, changing row identity and creating unnecessary writes/audit loss. The anchor score does not alternate across successful completed syncs. A transient gap is possible only if a run fails between prune and adoption.

### Validation decision

Predicate mismatch and churn are proven; the claimed alternating priority and “adoption untested” claims are false.

### Correct root cause

Evidence admission and retention do not share one row-level invariant, compounded by irreversible pruning (WLA-04).

### Correct product impact

Write churn and provenance instability occur; a mid-rebuild failure can leave a temporary missing row. Routine completed plans do not oscillate for this reason.

### Corrected recommendation

First remove physical pruning (WLA-04). Then require adopted evidence to satisfy the same stable, row-level admissibility contract used for retention, or preserve adoption rationale as explicit metadata.

### Required regression test

Property/integration test: every adopted row survives the retention predicate and keeps stable identity across repeated rebuilds; injected failure between phases does not lose the prior row.

### Runtime evidence needed

None.

## [WLA-17] A partial or fully failed provider sync publishes a complete-looking plan

**Validation result:** Partially verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Provider failures do not gate queue/brief creation, brief schema has no producing-run coverage, and backfill errors are ignored, so users cannot distinguish a complete plan from stale data.

### Independent code path

After provider waves, `syncMyDay` runs backfill, Jira snapshot, linked evidence, rebuild, and both brief builders even when one or more provider results failed (`src/inngest/functions/syncMyDay.ts:272-359`). Status derivation uses provider failure count plus rebuild/brief booleans. Backfill `errors` and `sourcesRemaining` are not included in `errorParts` or status. `DailyBriefV2` stores no producing `syncRunId` or provider coverage; composer warnings come from content-level gaps (`src/lib/dailyBrief/composer.ts:452-463,504-535`).

However, Today reads the latest finished sync’s provider rows and passes failed labels to the view (`src/app/page.tsx:128-139,222-235`). The view persistently renders “Last sync was incomplete… Some evidence here may be out of date” (`src/components/HumanReadableTodayView.tsx:515-524`).

### Trigger feasibility

Any provider failure with a successful rebuild/brief triggers degraded publication; all provider imports may fail while stale local data still builds a plan. Backfill extraction can fail independently without affecting final status.

### Existing protections

The sync run becomes `partially_completed` for provider failures, the sync modal reports issues, and Today retains a visible failed-provider warning. Citation validation is stored but does not gate publication.

### Actual behavior

A plan can be computed from incomplete/stale coverage, but the current Today surface does qualify it. Artifact-to-run lineage and backfill health are missing, so the warning may not prove which run produced the displayed brief.

### Validation decision

Degraded publication and missing lineage are verified; “complete-looking” and “cannot distinguish” overstate the final UI.

### Correct root cause

Brief artifacts and sync-health records are persisted separately without an atomic producing-run/coverage relationship, and backfill health is omitted from completion roll-up.

### Correct product impact

The user sees an incomplete-sync warning but cannot inspect exact coverage or prove that the displayed brief came from that run. Backfill-only failures can be invisible.

### Corrected recommendation

Persist `syncRunId`, provider coverage, backfill outcome, and citation validation with the brief in the same publication boundary. Keep the visible warning, name missing providers, and distinguish “stale prior brief retained” from “new degraded brief produced.”

### Required regression test

Fail one provider and all backfill items independently. Assert final status, persisted brief lineage/coverage, and Today warning all refer to the same run. If rebuild fails, assert no new brief is published.

### Runtime evidence needed

None for the structural gap.

## [WLA-18] Nothing prevents two `syncMyDay` runs from overlapping

**Validation result:** Verified<br>
**Original severity:** Medium<br>
**Validated severity:** Medium<br>
**Verification confidence:** High

### Original claim

Repeated POSTs create independent running rows and workflow invocations; client protection is per-tab, while task mutation paths can interleave.

### Independent code path

`POST /api/day/sync` creates a run unconditionally and sends its event (`src/app/api/day/sync/route.ts:9-28`). `createSyncRun` is a bare insert and the schema has no one-running-run constraint (`src/services/syncRuns.ts:56-75`). The Inngest function configuration declares no concurrency/idempotency rule (`src/inngest/functions/syncMyDay.ts:45-50`). Client state/session storage is tab-local. Task insertion has no canonical uniqueness constraint, and `applyPlannerDecisions` reads current rows before entering its write transaction (`src/services/workTasks.ts:494-504`).

### Trigger feasibility

Two tabs, repeated requests, or a fresh request while a prior invocation/retry is active are sufficient.

### Existing protections

Source identity has a unique constraint and conflict fallback. Provider/upsert logic is partly idempotent. The button disables within one mounted client. These do not serialize task extraction/rebuild or prevent two run rows.

### Actual behavior

Two workflows can overlap and mutate/replan the same personal dataset. Duplicate task inserts, stale overwrites, and competing brief publication are possible.

### Validation decision

Absence of a server-side guard is verified at every relevant layer, and state-changing paths are not generally idempotent.

### Correct root cause

Sync lacks a per-user single-flight/idempotency contract spanning request acceptance, workflow execution, and publication.

### Correct product impact

An accidental double start can create duplicate tasks or publish the result of an older interleaved run after a newer one.

### Corrected recommendation

Atomically acquire/reuse one active run per user and add workflow concurrency keyed by user. Make publication compare run generation/version so an older run cannot overwrite newer output. Preserve idempotency for retries.

### Required regression test

Issue concurrent POSTs and workflow events; assert one active logical run, one extraction side effect per source/version, and monotonic brief publication. Include retry of the same event.

### Runtime evidence needed

None.

## [WLA-L1] Filesystem writes inside the sync path fail on a read-only deployment

**Validation result:** Requires runtime evidence<br>
**Original severity:** High<br>
**Validated severity:** High (conditional)<br>
**Verification confidence:** Medium

### Original claim

Queue-summary and daily-brief shadow writes under `process.cwd()/data` fail on read-only/serverless deployments and can retry destructive rebuild work.

### Independent code path

`writeSummary` synchronously creates/writes `data/today-queue-summary.json` and is not caught inside `rebuildTodayQueue` (`src/lib/tasks/prioritizer.ts:55,88-92,281-289,437-450`). It runs after planner application in the non-empty path, and after the pre-ranking reconciliation/prune mutations.

`writeShadowFile` similarly writes `data/daily-brief-v2.json` before DB upsert (`src/lib/dailyBrief/buildDailyBrief.ts:26-32,62-70`). Contrary to the audit, its exception is caught by the outer `buildDailyBriefV2` try/catch (`src/lib/dailyBrief/buildDailyBrief.ts:112-211`) and becomes `{ok:false}`. The queue-summary exception escapes the rebuild step.

### Trigger feasibility

Requires a deployment where `process.cwd()/data` is absent and cannot be created/written, or storage is ephemeral in a way that invalidates caching. Local repository execution has a writable data directory.

### Existing protections

Daily-brief construction catches shadow-write failures. Queue-summary reads tolerate missing/invalid JSON, but writes do not. PostgreSQL remains the primary brief store only after the shadow write succeeds.

### Actual behavior

Code proves the writes and their differing failure behavior, but not production filesystem capability. On read-only storage, queue rebuild rejects after mutations; brief build returns failure before DB upsert.

### Validation decision

Deployment facts are necessary to determine whether the trigger exists. The original daily-brief exception analysis missed the outer catch.

### Correct root cause

Durable workflow state/cache publication depends on process-local filesystem semantics that are not declared as a deployment capability.

### Correct product impact

Conditionally, sync can fail after mutating queue/evidence and retain an old brief. On ephemeral-but-writable storage, cache behavior becomes instance-dependent.

### Corrected recommendation

First confirm deployment semantics. If non-durable/read-only, make database state authoritative and treat optional shadow output as best-effort after DB publication. Never allow a diagnostic/cache file to decide workflow success.

### Required regression test

Inject `EACCES`/`EROFS` for both writes. Assert queue/brief outcomes are terminal, database publication behavior is intentional, no destructive step repeats unexpectedly, and an optional shadow failure is observable.

### Runtime evidence needed

Deployment platform, runtime mount map, working directory, write/rename behavior, instance lifetime, filesystem-related sync errors, and whether multiple instances share the path.

## [WLA-L2] Reassigning a source’s project forces full re-extraction of unchanged content

**Validation result:** Rejected<br>
**Original severity:** Low<br>
**Validated severity:** Not applicable<br>
**Verification confidence:** High

### Original claim

Including `projectId` in the source-processing fingerprint causes unnecessary re-extraction; the audit recommends removing it.

### Independent code path

`sourceProcessingFingerprint` includes source content metadata and `projectId` (`src/lib/imports/sourceProcessing.ts:19-31`). Both normal import and backfill pass project description, keywords, and people into task/knowledge extraction and load project-specific ingestion rules. Project assignment therefore changes extraction inputs and merge/project behavior even when source bytes do not change.

### Trigger feasibility

A post-processing project reassignment would invalidate the marker. Normal import only fills a null project with a candidate match, so the exact production frequency is unknown.

### Existing protections

Current fingerprint correctly detects changed extraction context. Processing metadata prevents re-extraction when both content and project context remain the same.

### Actual behavior

Re-extraction after project change is intentional cache invalidation, not demonstrated incorrect behavior.

### Validation decision

The mechanical observation is true, but the alleged bug is false. Removing `projectId` can preserve output created with the wrong project rules/people/context.

### Correct root cause

Not applicable.

### Correct product impact

No incorrect product impact is established. The cost is an extra model call when semantic context genuinely changes.

### Corrected recommendation

Do not remove `projectId`. If cost becomes material, version/hash the exact extraction-relevant project context and rules rather than omitting it.

### Required regression test

Changing extraction-relevant project rules/context must invalidate processing; a project update to irrelevant display-only metadata may remain current if a future granular fingerprint supports that distinction.

### Runtime evidence needed

None for rejection.

## [WLA-L3] The planner cache can short-circuit before any decision is applied

**Validation result:** Rejected<br>
**Original severity:** Low<br>
**Validated severity:** Not applicable<br>
**Verification confidence:** High

### Original claim

A summary may be written although planner decisions failed partway; a later matching hash then returns before applying them.

### Independent code path

Cache comparison does return before the current run’s `applyPlannerDecisions` (`src/lib/tasks/prioritizer.ts:346-366`). But the summary is constructed and written only **after** `applyPlannerDecisions` returns successfully (`src/lib/tasks/prioritizer.ts:394-450`). On the active PostgreSQL path, all task updates and the single-now sweep are inside one database transaction (`src/services/workTasks.ts:503-547`).

The input hash is computed after the pre-ranking reconciliation/prune operations and includes current task/planning inputs. A manual status change changes task state/exclusion and does not create the audit’s partial-apply condition.

### Trigger feasibility

The proposed “summary written, apply failed partway” sequence cannot occur on this ordering/transaction. A direct external corruption of queue state after a successful cached run is a different, unsupported scenario.

### Existing protections

Transactional planner application and post-apply summary write are exactly the relevant protections.

### Actual behavior

The cache skips reapplying decisions that a prior successful run already applied. No repository-backed stale path in the finding was established.

### Validation decision

Rejected because its required state transition is prevented by ordering and transactionality.

### Correct root cause

Not applicable.

### Correct product impact

None established.

### Corrected recommendation

Do not move decision application ahead of the hash solely for this finding; that would add writes without fixing a proven problem. Add an invariant/checksum only if runtime traces later show external state drift.

### Required regression test

Inject a planner-transaction failure and assert no summary is written; successful apply followed by identical input may safely cache-hit.

### Runtime evidence needed

None for rejection.

## [WLA-L4] Backfill re-extraction duplicates knowledge items

**Validation result:** Verified<br>
**Original severity:** Low<br>
**Validated severity:** Low<br>
**Verification confidence:** High

### Original claim

Normal changed-source import deletes old knowledge before extraction, while backfill reruns append-only knowledge extraction without deletion.

### Independent code path

The normal import path calls `deleteKnowledgeItemsForSource` for an existing source before knowledge extraction (`src/lib/imports/sourceImportPipeline.ts:230-245`). Backfill decides to rerun when the processing fingerprint is stale/failed and calls `extractKnowledgeFromSourceItem`, but never deletes existing knowledge (`src/lib/imports/backfillExtractions.ts:156-222`). `createKnowledgeItem` is an insert without a uniqueness/upsert key.

### Trigger feasibility

Any source with existing knowledge and a stale/failed processing marker that enters backfill can append another extracted set.

### Existing protections

Current processing markers prevent repeated backfill once successful and unchanged. Knowledge is currently absent from daily brief ranking (`knowledgeHighlights: []`), limiting decision impact.

### Actual behavior

Re-extraction appends rather than replaces. Exact generated text may vary, but multiple rows representing the same source knowledge are possible.

### Validation decision

The divergent replacement semantics and append-only write are proven.

### Correct root cause

Backfill bypasses the idempotent replacement boundary used by normal import.

### Correct product impact

Knowledge/search/chat surfaces can show duplicates and accumulate redundant rows; the current daily plan is not directly affected.

### Corrected recommendation

Use one transactional replace/upsert operation keyed by source and stable knowledge identity for both normal import and backfill. Do not delete old rows until new extraction succeeds.

### Required regression test

Run backfill twice across a forced stale marker; assert stable row count/identity and rollback-preserved prior knowledge on extraction failure.

### Runtime evidence needed

None; grouped production counts can size cleanup.

## [WLA-L5] A lost connection during a successful sync leaves Today stale

**Validation result:** Verified<br>
**Original severity:** Low<br>
**Validated severity:** Low<br>
**Verification confidence:** High

### Original claim

After eight consecutive polling errors, the client exits through an error path that clears state but does not refresh, even if the server completed successfully.

### Independent code path

`pollSyncRun` loops until terminal state and throws after eight consecutive request failures. The error path in `runSync` clears active state and reports an error but does not call `router.refresh`; refresh exists only on the observed terminal success/partial/failure path (`src/components/SyncMyDayButton.tsx`).

### Trigger feasibility

Connectivity must fail long enough for eight polls while the background workflow continues and reaches terminal state. Reconnect then leaves the mounted page with its previous server-rendered data.

### Existing protections

Any successful poll resets the error count. A reload or navigation refreshes state. Session storage can resume a still-known active run, but the error path clears that association.

### Actual behavior

The page remains stale until another refresh/navigation despite a newer completed plan on the server.

### Validation decision

The client state machine proves the behavior; no production observation is needed.

### Correct root cause

The polling transport is also treated as the sole reconciliation mechanism, and its terminal error path discards the run identity.

### Correct product impact

After a transient disconnect, the user can keep seeing the previous day plan without knowing a newer result exists.

### Corrected recommendation

Retain the run ID after transport failure, reconcile terminal status on reconnect/mount, and refresh only after confirming a newer terminal run. Avoid a blind offline refresh.

### Required regression test

Fake eight polling failures while the server record becomes completed, then simulate reconnect/remount; assert the client reconciles that run and refreshes exactly once.

### Runtime evidence needed

None.

## 5. New independently discovered findings

## [NEW-01] Unhandled workflow exceptions can leave Worklight’s sync run permanently non-terminal

**Validation result:** Verified<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

This issue was not a numbered original finding. The omission check asked specifically about partial sync and failure recovery.

### Independent code path

`POST /api/day/sync` creates a database row with `status: "running"` before enqueue. It catches only an enqueue failure and then finalizes the row (`src/app/api/day/sync/route.ts:9-40`). Once the Inngest function begins, terminal database status is written only by explicit cancellation branches or the final `finalize-sync-run` step (`src/inngest/functions/syncMyDay.ts:36-43,57-68,85-93,259-269,418-425`).

There is no function-level failure finalizer/`onFailure` path in the repository. Any uncaught exception from approve, project discovery, provider execution, backfill infrastructure, Jira snapshot, linked import, rebuild, audits, briefing orchestration, hooks, or finalization exits before the terminal write.

`rebuildTodayQueue` illustrates a dead error contract: it is typed with `ok: boolean`, but all repository return paths are `ok: true`; reconciliation, database, and `writeSummary` failures throw (`src/lib/tasks/prioritizer.ts:65-70,240-289,394-450`). Therefore `syncMyDay`’s `if (!rebuild.ok)` branch cannot collect those failures. Inngest may retry and recover, but if retries do not succeed, nothing in this repository changes the Worklight row from `running`. The status API continues returning that row, and the client poll has no wall-clock deadline.

### Trigger feasibility

Any persistent exception after enqueue is sufficient. Concrete repository-controlled examples include a failed reconciliation query, evidence-delete failure, planner-apply failure, or unwritable queue-summary file.

### Existing protections

Enqueue failure is finalized. Provider adapters usually convert expected failures into structured outcomes. Cancellation and the happy path finalize. Inngest retry can recover transient exceptions. None guarantees Worklight database finalization after a permanent/unexpected exception.

### Actual behavior

The workflow invocation fails/retries externally while the application’s sync row and possibly a provider row remain non-terminal. Today’s client can continue polling indefinitely and the latest-finished-run UI continues to describe an older run.

### Validation decision

The missing failure edge and non-terminal persistent state are directly proven by control flow. This is broader than `WLA-L1`; a read-only filesystem is only one possible trigger.

### Correct root cause

Workflow lifecycle state is finalized only on explicit success/cancellation paths rather than by an idempotent failure boundary.

### Correct product impact

The user can see a sync that never completes, cannot rely on its partial changes/publication state, and may start another overlapping run.

### Corrected recommendation

Add an idempotent function-level failure finalizer that records the causal step/error, terminalizes running provider rows, and marks the sync failed without publishing a new brief. Make rebuild’s error contract honest: either catch and return a structured failure before orchestration proceeds or let it throw and handle that failure centrally. Preserve retry semantics so transient retries do not prematurely finalize a run that will continue.

### Required regression test

Inject failures before providers, during a provider, after destructive reconciliation, during summary write, and during finalization. Assert every exhausted/terminal failure produces one terminal sync row, no provider remains `running`, no new brief is published after failed rebuild, and a retry of the same event is idempotent.

### Runtime evidence needed

None to establish the bug. Inngest retry count/failure-event metadata is needed to choose when the application finalizer should run.

## [NEW-02] “Verbatim” evidence verification is advisory and fails open, so fabricated quotations can be persisted

**Validation result:** Verified<br>
**Validated severity:** High<br>
**Verification confidence:** High

### Original claim

This was not a numbered original finding. The omission check asked about unsupported LLM inference and misleading evidence.

### Independent code path

The extraction prompt requires at least one verbatim quote, but its output schema accepts any non-empty evidence string. After extraction, `candidateEvidenceVerified` deterministically checks whether at least one normalized quote appears in the source (`src/lib/tasks/evidenceVerification.ts`). The result is passed only as an input fact to a second LLM (`src/lib/tasks/taskReflect.ts:25-56`; `src/lib/llm/prompts/factReflect.ts`).

If that LLM job fails, `keepAllReflectResult` retains every candidate. If it succeeds but omits a decision, the missing index defaults to keep. If it explicitly chooses `keep: true` for `evidenceVerified: false`, `applyReflectDecisions` trusts it (`src/lib/tasks/reflectDecisions.ts:21-46`). The extractor then persists the original unverified quote without another deterministic gate (`src/lib/tasks/extractor.ts:276-305,330-344,489-513`).

The UI deliberately renders any stored `evidence.quote` inside quotation marks (`src/components/HumanReadableTodayView.tsx:265-315`).

### Trigger feasibility

The extraction model must return a quote that is not actually present, followed by reflect failure, missing decision, or permissive keep. Model/provider failure is already an expected branch, and the prompt itself tells the reflect model to “keep when in doubt.”

### Existing protections

The deterministic check exists, minor case/whitespace differences are tolerated, and the reflect prompt asks the model to discard unsupported candidates. Zero-evidence task creation routes a task toward unclear, but the unverified evidence array is not empty, so that guard does not apply. No deterministic persistence invariant requires a literal source span.

### Actual behavior

An unsupported excerpt can survive the fail-open stage, be stored as evidence, affect relevance/ranking, and be displayed to the user as a direct quotation.

### Validation decision

Every branch required to bypass deterministic verification is explicit. The exact frequency requires model traces, but possible incorrect behavior and product impact do not.

### Correct root cause

A deterministic truth predicate is treated as advisory context for another probabilistic decision instead of as a write-time invariant.

### Correct product impact

Worklight can present model-authored text as if it were verbatim evidence from Jira, a meeting, or another source, undermining the evidence-first trust contract.

### Corrected recommendation

Never persist an unverified string as a quote. Require at least one verified source span for factual task evidence. When a candidate is plausible but no quote verifies, retain it only as an explicitly unsupported/unclear candidate or retry extraction; do not silently drop it and do not display a paraphrase in quotation marks. Store span/source-content revision identity.

### Required regression test

Extraction returns a fabricated quote while reflect fails, omits the index, and explicitly keeps it: all three cases must persist no quoted evidence. Exact and normalized-whitespace source spans must persist. The resulting unsupported candidate must follow the declared unclear/retry policy.

### Runtime evidence needed

None for correctness. Log the rate and text distance of `evidenceVerified: false` candidates to size current exposure.

## 6. Root-cause consolidation

The findings should not be implemented as 25 independent tickets. The following clusters share foundations or ordering dependencies.

| Consolidated root cause | Findings/symptoms | Consolidated treatment |
|---|---|---|
| Probabilistic or mutable text is allowed to authorize destructive/truth-bearing state | WLA-03 auto-close, WLA-04 evidence delete, WLA-05 opaque confidence overwrite, NEW-02 fabricated quote | Establish typed authority/provenance and deterministic write invariants before tuning regexes/models. |
| Jira mention, task identity, and lifecycle are conflated | WLA-06 destructive reference merge, WLA-10 missed identity candidate, WLA-11 no automatic reopen, WLA-13 missing source invalidation | Model identity/reference/closure provenance first; then expand lookup and reopen/retraction rules. |
| There is no single canonical primary-decision contract | WLA-01 unconditional promotion, WLA-07 split ranking, WLA-08 waiting primary, WLA-09 unstable queue order, WLA-12 status feedback, WLA-15 multiple manual `now` | Create one candidate/eligibility/selection result with explicit status origin. Render it everywhere; enforce manual focus at command time. |
| Sync mutation, health, and publication do not share one lifecycle boundary | WLA-17 unlinked degraded brief, WLA-18 overlap, WLA-L1 conditional file failure, WLA-L5 client transport loss, NEW-01 non-terminal exception | Add single-flight/idempotency, terminal failure handling, monotonic publication, run-linked coverage, and reconnect reconciliation. |
| Replacement/idempotency semantics differ by path | WLA-16 delete/reinsert evidence, WLA-L4 append-only backfill knowledge | Use shared transactional replace/version operations and preserve prior data until the new version is valid. |
| Ownership uncertainty becomes a terminal filter | WLA-02 silent extraction drop, contributes to WLA-07 and WLA-14 population mismatch | Resolve known identity; route uncertainty visibly; use one owned/visible candidate population downstream. |

### Recommendation conflicts and unsafe sequencing

- `WLA-01`, `WLA-07`, and `WLA-08` must be solved as one primary-eligibility contract. A queue-only threshold leaves the composer wrong; a composer-only waiting check leaves persisted status divergent.
- The `WLA-09` proposal to include manual/unclear tasks in ordinary planner decisions conflicts with the existing manual-protection contract. Fix ordering without handing their status to the planner.
- `WLA-11` automatic reopen must follow closure-authority work from `WLA-03`/`WLA-06`; otherwise Jira Done and transcript reopen can oscillate.
- `WLA-13`’s generic “unseen across N successful syncs” rule must not be used for incremental connectors. It would invalidate unchanged live Jira data.
- `WLA-15`’s background demotion of all but one manual row can silently reverse explicit user actions. Enforce replacement in the user command transaction.
- `WLA-16` should not be “fixed” only by making adoption more conservative before `WLA-04`; that can reduce useful evidence while irreversible deletion remains.
- `WLA-L2`’s removal of `projectId` from the processing fingerprint must not be implemented.
- `WLA-L3`’s proposal to apply decisions before cache comparison must not be implemented without new evidence; its failure scenario is prevented already.
- A read-before-insert “existing running sync” query alone is insufficient for `WLA-18`; concurrent requests require an atomic database/workflow guard.

## 7. Runtime evidence requirements

### Required before deciding unresolved or calibration-sensitive work

| Area | Exact evidence | Decision it enables |
|---|---|---|
| WLA-L1 deployment filesystem | Platform/runtime, `cwd`, mount permissions, persistence across invocations/instances, filesystem errors, instance count | Whether file-backed cache/shadow writes are currently broken, merely non-durable, or acceptable locally. |
| WLA-01 primary floor | Per-task score components, eligibility signals, selected primary, no-primary days, user accept/override outcome | A safe eligibility rule/floor without suppressing legitimate work. |
| WLA-12 continuity | Replays with identical external evidence and alternate prior machine status; user-labeled preferred order and day-to-day volatility | Which machine-status weights to remove and what explicit continuity state replaces them. |
| WLA-13 connector deletion semantics | Raw/canonical provider batches, cursor/watermark, full-vs-incremental marker, explicit delete events, successful-run completeness | Provider-specific tombstone/retraction policy. |
| Inngest lifecycle for NEW-01 | Retry count, terminal failure callback/event, step retry metadata, cancellation/failure ordering | Correct point for an idempotent application failure finalizer. |

### Recovery and migration evidence

- Rows closed by self-reported completion: task ID, manual flag, matched field, exact source quote/summary, source date, sync run.
- Rows closed/merged by Jira reconciliation: survivor/loser IDs, title key position, canonical key source, copied evidence, lost actionable fields.
- Evidence-prune actions and backups/source revisions: evidence ID, task ID, predicate tokens, domain version, sync run.
- Stored confidence scalar/components/version and planner response for the same task/run.
- Existing duplicate manual `now` rows and recent automatic duplicate/reopen candidates.

### Original hypotheses retained as hypotheses

The audit’s `WLA-H1`–`WLA-H5` entries were not bug findings and remain unclassified:

- **H1 extraction stability:** run identical versioned sources repeatedly and retain full model/prompt/schema outputs; measure title, owner, evidence-span, and merge-target variance.
- **H2 40-task planner window:** capture open queue size, tasks outside semantic overlay, and whether deterministic-only rows later become primary/unclear.
- **H3 regex score-channel prevalence:** log each regex contribution and the exact field/span that triggered it; compare against user-labelled priority.
- **H4 first-name attendance collision:** compare transcript participants and resolved user identity; measure false `forceInclude`.
- **H5 evidence-table scaling:** database row counts, query plans, step/page timings, and timeout traces.

Absence of these measurements is not evidence that the hypotheses are bugs.

## 8. Corrected test-coverage gaps

1. **Ownership and visibility:** capitalized product nouns, known/unknown people, explicit other owner, first-person commitment, extractor persistence outcome, and final visible population.
2. **Completion lifecycle:** summary-only phrase, literal source completion, questions, negation, mixed clauses, manual status, closure authority, and later reopen conflict.
3. **Evidence truth boundary:** fabricated/whitespace-normalized quotes across reflect failure, omitted decision, permissive keep, persistence, and quotation rendering.
4. **Evidence retention:** mutable reason, short valid quote, reversible prune state, adoption/retention invariant, repeated rebuild identity, and failure between phases.
5. **Jira relationship semantics:** leading identity, explicit canonical identity, reference-only key, genuine duplicate, lossless differing fields, Done closure, and reopen.
6. **Confidence persistence:** final scalar/component invariant, model version, semantic component behavior, low-confidence routing, and the `confidence === priorityScore === 1` boundary.
7. **Canonical primary:** low-signal set, all-waiting set, manual/inactive/unclear/other-owned sets, prior machine-status variants, and equality across decision result, queue, brief, and rendered focus.
8. **Queue and manual focus:** PostgreSQL `NULLS LAST`, stable ties, multiple sequential/concurrent “start” commands, and rebuild preservation.
9. **Large-queue identity:** more than 30 candidates with a true target outside the contextual window for both Jira and meeting-only tasks.
10. **Provider retraction:** incremental absence, full-snapshot absence, explicit delete, edit removing an action, sole-source versus corroborated task.
11. **Sync lifecycle:** concurrent POST/events, retry idempotency, exception at every major phase, terminal database/provider rows, monotonic brief publication, degraded coverage, and reconnect after polling loss.
12. **Backfill idempotency:** repeated stale-marker extraction, failed replacement rollback, knowledge row identity/count, and error propagation into sync status.
13. **Clock control:** inject `now` through claim-aware ranking, evidence freshness, and scenario composition. The current July 20 scenario at `src/lib/dailyBrief/jul20Scenario.test.mts:117` is time-dependent and already fails outside its 72-hour window.

Pure-function tests are useful but insufficient for transaction, SQL null ordering, concurrency, persistence invariants, and final-render behavior. Those require PostgreSQL integration and page/component coverage.

## 9. Validated implementation scope

Only verified behavior, verified portions of partial findings, and essential observability are included below.

## P0 — Correctness blockers

### P0-1 — Make ownership uncertainty non-destructive

- **Finding IDs:** WLA-02.
- **Exact affected files:** `src/lib/filters/ownerFilter.ts`, `src/lib/tasks/extractor.ts`, `src/lib/tasks/taskVisibility.ts`, `src/services/people.ts`, `src/db/schema.ts`, `src/db/tables.ts`; proposed new `src/services/decisionEvents.ts` if a durable review record is added.
- **Conceptual correction:** Resolve candidate actors against known identities; change unresolved ownership from silent drop to visible `unclear`/review state; record the decision basis.
- **Expected behavior change:** Product nouns no longer erase work; explicit foreign work remains outside the user’s priority pool; uncertainty is actionable.
- **Implementation risk:** Medium—unclear volume can rise if identity data is sparse.
- **Dependencies:** Define known-person sources and the ownership-decision trace; no dependency on ranking redesign.
- **Required tests:** Classifier table, extractor persistence integration, final visibility, known-alias controls.
- **Acceptance criteria:** Zero silent drops based solely on unresolved capitalization; every dropped foreign candidate has resolvable person evidence; every unresolved candidate is recoverable.

### P0-2 — Replace weak auto-close with authority-aware completion

- **Finding IDs:** WLA-03; lifecycle dependency for WLA-11.
- **Exact affected files:** `src/lib/tasks/completionEvidence.ts`, `src/lib/imports/selfReportedCompletionReconciliation.ts`, `src/services/jiraWorkItemReconciliation.ts`, `src/lib/tasks/extractor.ts`.
- **Conceptual correction:** Generated summaries cannot close; require verified source span and explicit completion authority, respect manual state, and route ambiguity/conflict to confirmation.
- **Expected behavior change:** Questions, mixed clauses, and model rationale no longer make open work disappear.
- **Implementation risk:** Medium—fewer automatic closes and more confirmation items.
- **Dependencies:** NEW-02 evidence-span invariant should be designed jointly; closure provenance is needed before automatic reopen.
- **Required tests:** Completion matrix plus service transition and later-conflict tests.
- **Acceptance criteria:** Every automatic close links to a verified source span and declared authority; no manual task is self-closed; ambiguous cases remain open/reviewable.

### P0-3 — Preserve evidence provenance and unify admission/retention

- **Finding IDs:** WLA-04, verified portion of WLA-16.
- **Exact affected files:** `src/lib/tasks/evidenceRelevance.ts`, `src/services/evidenceRelevancePrune.ts`, `src/services/evidence.ts`, `src/services/workTasks.ts`, `src/lib/tasks/jiraAnchorEvidence.ts`, `src/lib/tasks/prioritizer.ts`, `src/db/schema.ts`, `src/db/tables.ts`, and a new generated migration under `drizzle/postgres/`.
- **Conceptual correction:** Remove physical delete from rebuild; version/soft-state relevance decisions with stable domain inputs and sync attribution; use one row-level invariant for adoption and retention.
- **Expected behavior change:** Citations remain recoverable, planner prose cannot destroy provenance, and adopted rows do not churn.
- **Implementation risk:** Medium—schema/data migration and changed relevance sets.
- **Dependencies:** Backup/current-state inventory; define stable task domain/anchor semantics.
- **Required tests:** Reversible retention, mutable reason, short quote, adoption property, failure between phases, ranking on visible versus retained evidence.
- **Acceptance criteria:** Rebuild performs no irreversible evidence deletion; every hidden row is queryable with reason/version; repeated unchanged rebuilds retain stable evidence identity.

### P0-4 — Separate Jira identity from reference and make merges lossless

- **Finding IDs:** WLA-06.
- **Exact affected files:** `src/lib/tasks/canonicalKey.ts`, `src/lib/tasks/transcriptTaskMerge.ts`, `src/lib/imports/jiraDoneReconciliation.ts`, `src/services/jiraWorkItemReconciliation.ts`, `src/db/schema.ts`, `src/db/tables.ts`, and a new generated migration under `drizzle/postgres/` if relationship type is persisted.
- **Conceptual correction:** Persist/derive typed Jira relations; only identity anchors participate in Done/duplicate reconciliation; preserve or refuse conflicting actionable fields.
- **Expected behavior change:** QA/handoff/review work that merely references a ticket stays open when the ticket closes.
- **Implementation risk:** Medium—genuine legacy duplicates may stop merging until canonical identity is backfilled.
- **Dependencies:** Relationship model and migration audit for previously merged/closed rows.
- **Required tests:** Reference-only controls, genuine duplicate, Done, field conflict, evidence anchor.
- **Acceptance criteria:** A non-leading/reference-only key never closes or merges the task; every accepted merge is lossless or explicitly reviewed.

### P0-5 — Enforce verified evidence at the persistence boundary

- **Finding IDs:** NEW-02.
- **Exact affected files:** `src/lib/tasks/evidenceVerification.ts`, `src/lib/tasks/taskReflect.ts`, `src/lib/tasks/reflectDecisions.ts`, `src/lib/tasks/extractor.ts`, `src/lib/imports/sourceRevision.ts`, `src/components/HumanReadableTodayView.tsx`, `src/db/schema.ts`, `src/db/tables.ts`.
- **Conceptual correction:** An unverified string cannot enter `evidence.quote`; plausible unsupported candidates follow an explicit unclear/retry path; attach verified span/revision identity.
- **Expected behavior change:** Every displayed quotation exists in the referenced source version.
- **Implementation risk:** Medium—extraction yield may fall until retry/unclear behavior is tuned.
- **Dependencies:** Choose unsupported-candidate policy and source revision identity; coordinate with P0-2.
- **Required tests:** Reflect failure/omission/keep bypasses, exact/normalized spans, persistence, UI rendering.
- **Acceptance criteria:** Database/UI invariant: all non-empty evidence quotes verify against their stored source revision; unsupported candidates are never silently lost or quoted.

## P1 — Major reliability issues

### P1-1 — Establish one canonical primary-decision contract

- **Finding IDs:** verified portions of WLA-01, WLA-07, WLA-08, WLA-12.
- **Exact affected files:** `src/lib/tasks/priorityRank.ts`, `src/lib/tasks/prioritizer.ts`, `src/lib/dailyBrief/composer.ts`, `src/lib/dailyBrief/buildDailyBrief.ts`, `src/domain/dailyBrief.ts`, `src/app/page.tsx`, `src/components/HumanReadableTodayView.tsx`, `src/services/workTasks.ts`.
- **Conceptual correction:** One candidate population, status-origin-aware scoring, primary-eligibility gate, stable tie-break, and one selected primary consumed by queue/brief/UI. Exclude waiting/blocked work from actionable primary.
- **Expected behavior change:** Weak days can have no primary; waiting work moves to Needs Input; stored and rendered decisions agree.
- **Implementation risk:** High—central product behavior and historical fixture expectations change.
- **Dependencies:** P0-1 ownership semantics, P1-2 confidence authority, captured decision baselines, and calibrated eligibility evidence.
- **Required tests:** Full canonical-primary matrix and end-to-end equality assertions.
- **Acceptance criteria:** Exactly zero or one actionable primary; the same ID/status/reason appears in persisted decision, brief, and focus card; machine prior status alone cannot change the winner.

### P1-2 — Make confidence one explainable, versioned value

- **Finding IDs:** WLA-05.
- **Exact affected files:** `src/lib/tasks/plannerConfidence.ts`, `src/lib/tasks/taskConfidence.ts`, `src/lib/tasks/confidenceModel.ts`, `src/lib/tasks/prioritizer.ts`, `src/services/workTasks.ts`, `src/db/schema.ts`, `src/db/tables.ts`.
- **Conceptual correction:** Declare one aggregate authority; store semantic opinion as a named component or separate field; enforce scalar/components/version consistency.
- **Expected behavior change:** Unclear routing is reproducible and its explanation matches stored state.
- **Implementation risk:** Medium—task visibility/unclear volume may shift.
- **Dependencies:** Measure existing scalar/component deltas; migrate or recompute inconsistent rows.
- **Required tests:** Persistence invariant, semantic conflict, contamination boundary, low-confidence routing.
- **Acceptance criteria:** No stored task has a scalar unexplained by its components/model version; planner priority never populates confidence.

### P1-3 — Guarantee terminal sync state on every workflow exit

- **Finding IDs:** NEW-01; conditional failure trigger from WLA-L1.
- **Exact affected files:** `src/inngest/functions/syncMyDay.ts`, `src/services/syncRuns.ts`, `src/lib/tasks/prioritizer.ts`, `src/lib/imports/syncRunCompletion.ts`, `src/app/api/day/sync/[id]/route.ts`.
- **Conceptual correction:** Add idempotent terminal failure handling, honest rebuild failure semantics, provider-run cleanup, and no-publication-on-failed-rebuild rule while preserving retries.
- **Expected behavior change:** A failed sync cannot remain `running` indefinitely or publish a new plan after a mandatory phase failed.
- **Implementation risk:** Medium—must align with Inngest retry/failure lifecycle.
- **Dependencies:** Obtain Inngest failure metadata and define exhausted-versus-retrying state.
- **Required tests:** Failure injection at every phase, retry, duplicate failure callback, finalization failure.
- **Acceptance criteria:** Every logical run reaches exactly one terminal application status; no child provider remains running; terminal error identifies the causal phase.

### P1-4 — Enforce per-user sync single-flight and monotonic publication

- **Finding IDs:** WLA-18.
- **Exact affected files:** `src/app/api/day/sync/route.ts`, `src/services/syncRuns.ts`, `src/db/schema.ts`, `src/db/tables.ts`, `src/inngest/functions/syncMyDay.ts`, `src/lib/dailyBrief/buildDailyBrief.ts`, and a new generated migration under `drizzle/postgres/`.
- **Conceptual correction:** Atomically acquire/reuse an active run, key workflow concurrency/idempotency by user, and prevent older run generations from overwriting newer publication.
- **Expected behavior change:** Double clicks/tabs/retries behave as one logical sync.
- **Implementation risk:** Medium—database locking/uniqueness and workflow semantics must agree.
- **Dependencies:** P1-3 lifecycle terminalization; define user key for null/legacy profile.
- **Required tests:** Concurrent POST, duplicate event, retry, stale older publication.
- **Acceptance criteria:** At most one active logical run per user and one published generation; repeated requests return/refer to that run.

### P1-5 — Add provider-aware source validity and task retraction

- **Finding IDs:** verified portion of WLA-13.
- **Exact affected files:** `src/lib/imports/sourceImportPipeline.ts`, `src/lib/connectors/types.ts`, `src/lib/connectors/jira.ts`, `src/services/connections.ts`, `src/services/sourceItems.ts`, `src/services/evidence.ts`, `src/services/workTasks.ts`, `src/db/schema.ts`, `src/db/tables.ts`, and a new generated migration under `drizzle/postgres/`.
- **Conceptual correction:** Declare snapshot/delta/delete capabilities, persist source validity/tombstone provenance, and flag dependent tasks based on sole-source versus corroborated evidence.
- **Expected behavior change:** Authoritatively deleted/retracted work is identified without falsely deleting unchanged incremental data.
- **Implementation risk:** High—provider semantics and migration/retention are provider-specific.
- **Dependencies:** Runtime provider payload/cursor evidence; P0-3 preserved provenance; full inventory mechanism where needed.
- **Required tests:** Incremental absence, full absence, delete event, partial provider failure, edit retraction, corroboration.
- **Acceptance criteria:** No incremental absence tombstones a live source; every authoritative delete is represented; dependent tasks are reviewable and never blindly closed.

## P2 — Quality and consistency issues

### P2-1 — Expand identity lookup and support authority-aware reopen

- **Finding IDs:** WLA-10, verified portion of WLA-11.
- **Exact affected files:** `src/lib/tasks/extractor.ts`, `src/services/workTasks.ts`, `src/lib/tasks/transcriptTaskMerge.ts`, `src/lib/tasks/canonicalKey.ts`, `src/lib/imports/selfReportedCompletionReconciliation.ts`, `src/services/jiraWorkItemReconciliation.ts`, `src/app/api/work-tasks/[id]/status/route.ts`.
- **Conceptual correction:** Query strict identity/title/topic candidates independently of the 30-row prompt window; include bounded recent closed candidates and reopen only under authority rules.
- **Expected behavior change:** Large queues do not create avoidable duplicates; legitimate resurfacing preserves task ID/history.
- **Implementation risk:** Medium.
- **Dependencies:** P0-2/P0-4 closure and identity provenance; P1-5 source authority.
- **Required tests:** 40+ rows, meeting-only target, self-close correction, Jira reopen/still-Done conflict.
- **Acceptance criteria:** Strict matches are found regardless of contextual-window position; reopen preserves ID and cannot oscillate.

### P2-2 — Make queue ordering, visible suppression, and manual focus deterministic

- **Finding IDs:** verified portions of WLA-09 and WLA-15; WLA-14.
- **Exact affected files:** `src/services/workTasks.ts`, `src/app/page.tsx`, `src/app/api/work-tasks/[id]/status/route.ts`, `src/lib/tasks/prioritizer.ts`.
- **Conceptual correction:** Explicit `NULLS LAST`/tie-break; derive ordering/suppression from the final visible population and stable identity; atomically replace manual focus at command time.
- **Expected behavior change:** No invisible-primary title drop, stable queue order, exactly one manual focus.
- **Implementation risk:** Low to Medium—existing multiple manual rows need policy.
- **Dependencies:** P1-1 canonical primary clarifies which ordering remains UI-relevant.
- **Required tests:** PostgreSQL ordering, page fixture, sequential/concurrent start commands, legacy repair.
- **Acceptance criteria:** Visible tasks cannot be suppressed by an invisible row; queue order is total; exactly one manual `now` exists per user.

### P2-3 — Link brief publication to sync coverage

- **Finding IDs:** verified portion of WLA-17.
- **Exact affected files:** `src/inngest/functions/syncMyDay.ts`, `src/lib/imports/syncRunCompletion.ts`, `src/lib/dailyBrief/buildDailyBrief.ts`, `src/domain/dailyBrief.ts`, `src/db/schema.ts`, `src/db/tables.ts`, `src/app/page.tsx`, `src/components/HumanReadableTodayView.tsx`, and a new generated migration under `drizzle/postgres/`.
- **Conceptual correction:** Store producing run, provider/backfill coverage, validation, and whether the artifact is newly degraded or a retained older brief.
- **Expected behavior change:** The existing warning becomes exact, inspectable, and tied to the displayed artifact.
- **Implementation risk:** Low to Medium—additive schema plus publication transaction.
- **Dependencies:** P1-3/P1-4 lifecycle and generation semantics.
- **Required tests:** provider failure, backfill-only failure, brief failure, retained-old-brief, matching UI warning.
- **Acceptance criteria:** Every brief identifies its producing run/coverage; Today never attributes an old brief to a different run.

### P2-4 — Make knowledge re-extraction idempotent

- **Finding IDs:** WLA-L4.
- **Exact affected files:** `src/lib/imports/backfillExtractions.ts`, `src/lib/imports/sourceImportPipeline.ts`, `src/services/knowledgeItems.ts`, `src/db/schema.ts`, `src/db/tables.ts`, and a new generated migration under `drizzle/postgres/` if stable identity is added.
- **Conceptual correction:** Shared transactional replace/upsert, preserving previous version until new extraction succeeds.
- **Expected behavior change:** Repeated backfill does not append duplicate knowledge.
- **Implementation risk:** Low.
- **Dependencies:** Choose stable knowledge identity and cleanup strategy.
- **Required tests:** repeated backfill, extraction failure rollback, normal/backfill parity.
- **Acceptance criteria:** Stable row count/identity for unchanged source version; no knowledge loss on failed refresh.

### P2-5 — Reconcile completed sync after polling transport loss

- **Finding IDs:** WLA-L5.
- **Exact affected files:** `src/components/SyncMyDayButton.tsx`, `src/app/api/day/sync/[id]/route.ts`, `src/services/syncRuns.ts`.
- **Conceptual correction:** Keep run identity on poll failure and reconcile on reconnect/mount before refreshing.
- **Expected behavior change:** A successful background sync eventually refreshes Today despite temporary client disconnection.
- **Implementation risk:** Low.
- **Dependencies:** P1-3 terminal status guarantee.
- **Required tests:** eight errors, server completion, reconnect/remount, one refresh; still-running and cancelled controls.
- **Acceptance criteria:** Transport failure never permanently detaches the page from a known run; no refresh loop.

## P3 — Observability and maintainability

### P3-1 — Resolve filesystem deployment dependency

- **Finding IDs:** WLA-L1.
- **Exact affected files:** `src/lib/tasks/prioritizer.ts`, `src/lib/dailyBrief/buildDailyBrief.ts`, `src/db/schema.ts`, `src/db/tables.ts`, `README.md`, `vercel.json`.
- **Conceptual correction:** Record deployment capability; if storage is non-durable/read-only, move authoritative cache/shadow state to PostgreSQL and make optional file output non-fatal.
- **Expected behavior change:** Deployment-independent workflow correctness and explicit cache behavior.
- **Implementation risk:** Low after evidence; do not change local behavior speculatively.
- **Dependencies:** Runtime filesystem evidence; P1-3 failure semantics.
- **Required tests:** writable, read-only, ephemeral-instance simulation.
- **Acceptance criteria:** No authoritative sync outcome depends on undeclared local disk persistence.

### P3-2 — Add a run-linked decision trace for destructive and final decisions

- **Finding IDs:** WLA-01, WLA-02, WLA-03, WLA-04, WLA-05, WLA-07, WLA-17, NEW-01, NEW-02.
- **Exact affected files:** `src/inngest/functions/syncMyDay.ts`, `src/lib/tasks/prioritizer.ts`, `src/lib/tasks/extractor.ts`, `src/services/evidenceRelevancePrune.ts`, `src/services/jiraWorkItemReconciliation.ts`, `src/lib/dailyBrief/buildDailyBrief.ts`, `src/db/schema.ts`, `src/db/tables.ts`; proposed new `src/services/decisionEvents.ts` plus a generated migration under `drizzle/postgres/`.
- **Conceptual correction:** Persist structured, redacted events for candidate inclusion/exclusion, ownership basis, evidence verification/retention, closure/merge actions, confidence components, final primary, coverage, and terminal error, all tied to source/task/sync/model versions.
- **Expected behavior change:** Engineers can reconstruct why a task existed, vanished, changed status, or became primary.
- **Implementation risk:** Medium—privacy, retention, and payload size.
- **Dependencies:** Stable event schema and redaction policy; should land before behavior migration where possible.
- **Required tests:** Event completeness, referential links, redaction, failed-run trace, deterministic replay fixture.
- **Acceptance criteria:** One query reconstructs the final primary and every destructive transition for a run without relying on console logs.

## 10. Safe implementation order

1. **Capture recovery baselines and runtime facts.** Snapshot affected task/evidence/confidence/merge state; determine filesystem and provider completeness semantics; freeze representative decision traces.
2. **Add focused failing tests and the minimal decision-trace envelope.** Inject the clock in historical fixtures so the regression suite is trustworthy before behavior changes.
3. **Harden workflow lifecycle first:** P1-3 terminal failure, then P1-4 single-flight/monotonic publication. This prevents overlapping or stranded runs while data corrections are introduced.
4. **Enforce the evidence truth boundary:** P0-5 verified quotes, then P0-3 reversible evidence retention/adoption. Do not migrate completion logic while its evidence input can still be fabricated or destroyed.
5. **Correct destructive lifecycle decisions:** P0-2 completion authority and P0-4 Jira identity/lossless merge. Record closure/merge provenance needed for later reopen.
6. **Correct ownership and confidence:** P0-1 non-destructive ownership, then P1-2 explainable confidence. These define the trustworthy candidate population for primary selection.
7. **Build the canonical primary contract:** P1-1, using captured calibration data; then apply P2-2 queue/UI/manual-focus consistency.
8. **Add source and lifecycle continuity:** P1-5 provider-aware validity, followed by P2-1 large-queue identity lookup and authority-aware reopen.
9. **Finish publication/client reliability:** P2-3 run-linked coverage and P2-5 reconnect reconciliation.
10. **Finish idempotency and conditional storage work:** P2-4 knowledge replacement; P3-1 filesystem migration only if runtime evidence requires it. Run full replay, PostgreSQL integration, concurrency, and page-render suites before rollout.

Data-recovery review for historically pruned, self-closed, or lossily merged rows should occur after the new invariants exist but before automated migration changes current user-visible state.

## 11. Final verdict

Implementation may begin, but only against the validated scope above.

Safe to start immediately are deterministic guardrails with repository-proven failure modes: non-destructive ownership routing, verified-quote persistence, reversible evidence retention, authority-aware completion, strict Jira identity, confidence consistency, terminal sync handling, and atomic single-flight protection. The canonical-primary redesign can begin after those candidate/evidence/confidence semantics are stable and real score traces have calibrated the no-primary rule.

The following require runtime evidence before their behavior-specific implementation is finalized:

- `WLA-L1` filesystem/storage migration;
- the numeric/boolean primary eligibility calibration in `WLA-01`;
- continuity tuning for `WLA-12`;
- provider-specific tombstone mechanics for `WLA-13`;
- the exact Inngest exhausted-failure hook for `NEW-01`.

The following original recommendations must **not** be implemented as written:

- remove `projectId` from the source-processing fingerprint (`WLA-L2`);
- move/apply planner decisions ahead of the cache check to fix a supposed partial apply (`WLA-L3`);
- tombstone any source unseen in N successful incremental syncs (`WLA-13`);
- let background repair silently demote explicit manual focus (`WLA-15`);
- broadly feed manual/unclear tasks back into ordinary planner mutation merely to refresh score (`WLA-09`);
- fix split selection only in queue or only in the composer (`WLA-01`/`WLA-07`/`WLA-08`);
- rely on regex negation patches as the completion trust boundary (`WLA-03`).

The largest remaining uncertainty is not whether the proven code paths exist; it is how often production model outputs, provider batch semantics, filesystem deployment, and current task/evidence distributions trigger them. That uncertainty affects rollout sizing and calibration, not the validity of the P0 trust-boundary fixes.

The original audit is therefore useful as a risk inventory but is not safe to implement verbatim. Its strongest contribution is identifying real weak boundaries; its main weakness is converting those mechanisms into maximum-severity product claims without tracing the final UI, transaction ordering, provider semantics, or existing corrections.
