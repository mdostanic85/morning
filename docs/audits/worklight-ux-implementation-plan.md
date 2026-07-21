# Worklight UX implementation plan

Status: Release A and B implemented (22 July 2026)  
Source audit: [`worklight-today-flow-ux-audit.md`](./worklight-today-flow-ux-audit.md)  
Architecture companion: [`../architecture/worklight-accuracy-implementation-plan.md`](../architecture/worklight-accuracy-implementation-plan.md)  
Prepared: 22 July 2026

### Implementation status

| Release | Status | Notes |
| --- | --- | --- |
| A (UX-A01–A08) | Shipped | Automated gate: lint, test, build pass |
| B (UX-B01–B04) | Shipped | Migration `0014_release_b_ux` applied locally |
| C (UX-C01) | Deferred | Requires separate architecture decision |

Manual verification (light/dark, mobile, keyboard) from §5 remains open.

## 1. How to execute this document

This plan deliberately separates safe UX work from data-model and sync changes.

**Default execution scope is Release A only.**

An implementation agent following this document must:

1. implement Release A in order;
2. run every Release A verification gate;
3. stop and report the result;
4. not begin Release B without explicit user approval;
5. not begin Deferred Release C unless the user separately approves architecture work.

Release A may change React components, route presentation, CSS, copy, and local UI helpers. It must not:

- change database schema or run a migration;
- alter connector interfaces;
- change provider execution waves;
- add provider-level skipping;
- bypass the central LLM router;
- change prompt or extraction schemas;
- request broader external permissions;
- add an unconfirmed external write.

## 2. Product constraints

Every implementation decision must preserve:

- one clearly dominant daily priority;
- a maximum of three clearly owned priorities;
- the three-item top navigation: Today, How we decide, Settings;
- a calm briefing rather than a dashboard;
- visible Evidence, Next action, and Done when for every task card;
- Unclear as visually distinct from resolved work;
- confidence as extraction confidence, never priority;
- direct access to original evidence;
- local-first storage and read-only connectors by default;
- explicit confirmation naming the exact target of every external write;
- provider-isolated sync and the existing post-collection orchestration;
- light and dark themes;
- mobile one-column behavior;
- user-set status protection through `statusManuallySet`.

Do not turn Projects, Reports, Knowledge, Sources, or Schedule into top-level navigation or project-management dashboards.

## 3. Release map

### Release A — UX and trust-surface correction

Default. No schema migration and no sync-architecture change.

- UX-A01: stop false outcome-evidence claims;
- UX-A02: simplify task-detail actions and show real status;
- UX-A03: complete Today task pillars and fix dark-theme contrast;
- UX-A04: place confidence with evidence and unify labels;
- UX-A05: correct Settings copy and mount its existing hub;
- UX-A06: repair onboarding, loading, empty, error, and Tomorrow states;
- UX-A07: de-jargon secondary routes;
- UX-A08: align How we decide with shipped behavior.

### Release B — durable correction and evidence model

Requires explicit approval. Includes additive schema/API work.

- UX-B01: durable ownership decisions;
- UX-B02: criterion-to-evidence relationships;
- UX-B03: persistent conflict resolution;
- UX-B04: persistent freshness and partial-sync state.

### Deferred Release C — sync-control architecture

Not part of the default implementation.

- UX-C01: provider-level continue/skip controls and elapsed-time status.

## 4. Release A implementation

### UX-A01 — Stop false outcome-evidence claims

Priority: P0  
Risk: Medium  
Migration: No  
Architecture change: No

#### Problem

`src/app/tasks/[id]/corrections/[index]/page.tsx` pairs a done criterion and evidence by array index. The relationship is not stored, so the page can present unrelated evidence as an “Exact instruction.”

#### Files

Modify:

- `src/app/tasks/[id]/corrections/[index]/page.tsx`

Optional new pure helper:

- `src/lib/tasks/outcomeEvidencePresentation.ts`

Optional test:

- `src/lib/tasks/outcomeEvidencePresentation.test.mts`

#### Implementation

- Remove `task.evidence[criterionIndex] ?? task.evidence[0]`.
- Until Release B adds an explicit relationship, never claim that one evidence item supports one criterion.
- Keep the criterion and task-level evidence visible, but label their relationship honestly.
- Do not hide all evidence; show task-wide sources under progressive disclosure.
- Preserve links to original sources.

#### Exact copy

Outcome header:

- Badge: `Required outcome`
- Context: `Complete this outcome as part of {task title}.`

Evidence state:

- Heading: `Evidence not linked to this outcome`
- Body: `Worklight has task-level evidence, but it cannot verify which source supports this specific outcome.`
- Primary action: `Review task evidence`
- Secondary action: `Back to task`

Task-wide disclosure:

- Label: `Task evidence`
- Helper: `These sources support the task generally, not necessarily this outcome.`

Remove:

- `Exact instruction`
- `Verify the result against the attached source evidence`

#### Acceptance criteria

- No criterion selects evidence by position.
- No unrelated quote is labelled exact or criterion-specific.
- Task-level sources remain reachable.
- Missing URLs are handled without empty links.
- Outcome 01 of task 408 cannot show the unrelated Sentry quote as its exact instruction.
- The route remains read-only.

#### Verification

- Add a pure test for reordered criteria/evidence if a helper is introduced.
- Manually open an outcome with multiple criteria and multiple evidence items.
- Verify desktop and 390 px mobile layouts.

---

### UX-A02 — Simplify task-detail actions

Priority: P0  
Risk: Medium  
Migration: No  
Architecture change: No  
API change: No in Release A

#### Problem

Task detail exposes Start, Done, Check if done, Jira status, Skip, Snooze, Waiting, and Delete as peer controls. It labels most local statuses “Priority,” duplicates confidence, and can duplicate a Figma sync-review report.

#### Files

Modify:

- `src/app/tasks/[id]/page.tsx`
- `src/components/TaskActionButtons.tsx`
- `src/components/JiraStatusDropdown.tsx`

Reuse:

- the existing `layout="focus"` behavior in `TaskActionButtons`;
- `src/lib/tasks/focusPrimaryCta.ts`;
- `src/lib/tasks/focusPrimaryCta.test.mts`.

Optional new pure helper:

- `src/lib/tasks/taskDetailActionModel.ts`

Optional test:

- `src/lib/tasks/taskDetailActionModel.test.mts`

#### Implementation

- Add a `detail` presentation that extends the existing focused action pattern.
- First paint must contain no more than:
  - one context-sensitive primary action;
  - one local completion action;
  - one labelled status disclosure.
- Move Skip, Snooze, Waiting, Check completion, and Delete behind progressive disclosure.
- Keep all existing actions reachable.
- Put Jira in a separate section and retain its confirmation dialog.
- Show the real local status rather than “Priority” or “Verify.”
- Render the Figma/sync-review report once.
- On mobile, render Next action and the reduced action group before long meeting context.
- Do not add new API actions in Release A.

#### Exact copy

Local section:

- Heading: `Task status`
- Helper: `Changes here update Worklight only. Jira stays unchanged.`
- Disclosure: `Change queue position`
- Menu items:
  - `Start now`
  - `Move to later today`
  - `Move to tomorrow`
  - `Mark as waiting`
- Primary completion: `Mark done in Worklight`
- Verification: `Check delivery against criteria`
- Overflow: `More actions`
- Destructive item: `Remove from Worklight`

Status labels:

- `now`: `In progress`
- `next`: `Up next`
- `later`: `Later`
- `tomorrow`: `Tomorrow`
- `waiting`: `Waiting on someone`
- `unclear`: `Needs clarification`
- `done`: `Done locally`

Jira section:

- Heading: `Jira status · {issue key}`
- Helper: `This changes Jira after you confirm.`
- Trigger: `Jira · {current status}`
- Confirmation: `Update {issue key} in Jira?`
- Confirm action: `Update Jira`

Local completion confirmation:

- Heading: `Mark done in Worklight?`
- Body: `This removes the task from Today. It does not change Jira.`
- Confirm action: `Mark done`

#### Acceptance criteria

- First paint shows at most three labelled action controls, excluding evidence links and navigation.
- Local status and Jira status are visually separate.
- “Priority” never substitutes for local lifecycle status.
- “Verify” never substitutes for Unclear.
- External Jira writes retain exact-target confirmation.
- Delete remains confirmed and disclosed.
- Figma/sync-review content appears once.
- All existing API actions remain reachable.
- At 390 × 844, Next action and the reduced action group appear before long evidence.
- No critical action meaning depends on a tooltip.

#### Verification

- Extend the focus/action helper tests for each local status.
- Test a non-Jira task, Jira task, waiting task, unclear task, and done task.
- Test keyboard access to both disclosures and Jira confirmation.
- Check light/dark desktop and mobile.

---

### UX-A03 — Complete Today task cards and dark-theme contrast

Priority: P0  
Risk: Medium  
Migration: No  
Architecture change: No

#### Problem

Secondary cards hide Evidence and Done when. Dark-theme text on the primary Next action gradient fails normal-text contrast.

#### Files

Modify:

- `src/components/HumanReadableTodayView.tsx`
- `src/app/globals.css`

Potentially reuse:

- existing `EvidenceRow`;
- existing source disclosure patterns.

#### Implementation

- Add one visible Done when item to every secondary task card.
- Add one visible source name and meaningful evidence excerpt.
- Clamp long excerpts but never hide the source entirely.
- Keep secondary cards visually quieter than the primary card.
- Use `--action-primary-foreground` on the primary Next action gradient.
- Keep status and priority as separate labels.

#### Exact copy

- `Next action`
- `Done when`
- `Evidence`
- `Open task`
- `View all evidence`
- Missing evidence: `No source attached. Clarify before acting.`

#### Acceptance criteria

- Every task card visibly shows Evidence, Next action, and Done when.
- Missing-evidence tasks are visibly Unclear and cannot become first priority.
- Secondary cards remain subordinate to the focus card.
- Text over every point of the Next action gradient reaches WCAG AA 4.5:1.
- No horizontal overflow at 390 px.

#### Verification

- Measure computed-color contrast in light and dark themes.
- Test cards with zero, one, and many evidence items.
- Test short and multi-line done criteria.

---

### UX-A04 — Put confidence with evidence and unify presentation

Priority: P0  
Risk: Low  
Migration: No  
Architecture change: No

#### Problem

Confidence can be mistaken for priority, appears twice on task detail, and uses different label thresholds between Today and task detail.

#### Files

Modify:

- `src/components/ConfidenceBadge.tsx`
- `src/components/HumanReadableTodayView.tsx`
- `src/app/tasks/[id]/page.tsx`
- `src/app/how-ai-works/page.tsx`

Optional new shared helper:

- `src/lib/tasks/confidencePresentation.ts`

Test:

- `src/lib/tasks/confidencePresentation.test.mts`

#### Implementation

- Use one shared label helper.
- Use the existing product thresholds:
  - High: 70% and above;
  - Medium: 40–69%;
  - Low: below 40%;
  - Not scored: null.
- Do not change the underlying confidence model or recalibrate scores in Release A.
- Show confidence once per task context, inside or beside Evidence.
- Make the explanation available to pointer, keyboard, touch, and assistive technology.
- Do not place confidence only beside priority.

#### Exact copy

- `AI confidence: High (94%)`
- `AI confidence: Medium (40–69%)`
- `AI confidence: Low (under 40%)`
- `AI confidence: Not scored`
- Explanation: `How likely Worklight is to have understood this task correctly from these sources. This is not priority.`
- Low-confidence action: `Review evidence`

#### Acceptance criteria

- The same numeric value receives the same label everywhere.
- Confidence appears once on task detail.
- “AI confidence” is visible without hover.
- Low confidence uses text and an action, not color alone.
- How we decide describes the exact shared thresholds.

#### Verification

- Unit-test boundary values: null, 0, 0.39, 0.4, 0.69, 0.7, 1.
- Verify screen-reader label and keyboard disclosure.

---

### UX-A05 — Correct Settings trust copy and mount the existing hub

Priority: P1  
Risk: Low  
Migration: No  
Architecture change: No

#### Problem

Settings makes a false browser-only credential claim, exposes technical transport language as primary UX, and does not render the already-built `SettingsHubLinks`.

#### Files

Modify:

- `src/app/settings/page.tsx`
- `src/components/SettingsHubLinks.tsx`
- `src/components/ConnectionCard.tsx`

#### Implementation

- Mount `SettingsHubLinks` after Settings tabs.
- Keep Today, How we decide, and Settings as the only top-level links.
- Rewrite hub labels without Hydra jargon.
- Replace the false “Raw secrets never leave the browser” claim.
- Keep MCP, PAT, OAuth app setup, environment variables, and transport choice under Advanced setup.
- Present one obvious default connect action for each source.
- Keep the existing manual transcript path.
- Do not change credential storage or transport in Release A.

#### Exact copy

Settings:

- Heading: `Settings`
- Body: `Choose what Worklight can read and how it decides what belongs in Today.`
- Security note: `Credentials stay on this device. Worklight sends them only to its local server and the provider you connect.`

Tabs:

- `Connections`
- `Paste notes`
- `Extraction preferences`
- `AI model access`
- `Your profile`

Hub:

- Heading: `Setup and reference`
- Description: `Source health, work contexts, automated briefs, run history, and recent learnings.`
- Links:
  - `Source health`
  - `Work contexts`
  - `Automated briefs`
  - `Run history`
  - `Activity log`
  - `Recent learnings`

Connection cards:

- `Connect {source}`
- `Reconnect {source}`
- `Disconnect {source}`
- `Advanced setup`
- Error: `{source} connection failed`

Granola:

- Description: `Read meeting notes and transcripts from Granola.`
- Default action: `Connect Granola`
- Fallback: `Paste notes instead`

#### Acceptance criteria

- Every Settings child route is reachable from the mounted hub.
- The top-level navigation remains unchanged.
- No UI claims credentials never leave the browser.
- Common connection setup does not require knowing MCP, PAT, OAuth, or environment variables.
- Advanced technical controls remain available.
- Granola is not labelled universally recommended.

#### Verification

- Test disconnected, connected, and error cards.
- Test keyboard navigation through tabs and hub links.
- Verify mobile wrapping without horizontal tab overflow.

---

### UX-A06 — Repair onboarding and route state contracts

Priority: P1  
Risk: Medium  
Migration: No  
Architecture change: No

#### Problem

The generic welcome modal blocks secondary routes, the single loading skeleton is Today-shaped, no app error boundary exists, and Tomorrow points to a missing End day control.

#### Files

Modify:

- `src/components/WelcomeModal.tsx`
- `src/app/layout.tsx`
- `src/app/loading.tsx`
- `src/app/tomorrow/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/knowledge/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/audit/page.tsx`

Add:

- `src/app/error.tsx`
- `src/app/not-found.tsx`

Optional route loaders:

- `src/app/settings/loading.tsx`
- `src/app/projects/loading.tsx`
- `src/app/reports/loading.tsx`

#### Implementation

- Remove the generic welcome modal from secondary-route entry.
- Do not build a new modal. Use the existing Today first-use/empty state.
- Make the root loading state generic, or add route-specific loaders where shape materially differs.
- Add recoverable app error and not-found pages.
- Replace Tomorrow’s End day instruction until End day actually exists.
- Put relevant actions inside empty states.
- Preserve valid local content when an optional section fails.

#### Exact copy

Error:

- Heading: `{Page name} couldn’t load`
- Body: `Your local data is unchanged. Try again, or return to Today.`
- Actions: `Try again`, `Back to Today`

Not found:

- Heading: `This page isn’t available`
- Body: `It may have been removed or the link may be out of date.`
- Actions: `Back to Today`, `Open Settings`

Tomorrow:

- Heading: `Nothing planned for tomorrow`
- Body: `Move a task to Tomorrow from any task, or sync after your last update.`
- Actions: `Back to Today`, `Sync my day`

Projects:

- Heading: `No work contexts yet`
- Body: `Sync Jira or another source to find the projects that should shape your brief.`
- Actions: `Sync my day`, `Connect a source`

Knowledge:

- Heading: `No learnings yet`
- Body: `Sync a source or paste notes to extract recent, evidence-backed learnings.`
- Actions: `Sync my day`, `Paste notes`

Reports:

- Heading: `No brief runs yet`
- Body: `Run a brief now or set a weekday schedule.`
- Actions: `Run now`, `Set schedule`

#### Acceptance criteria

- A direct visit to Settings or another secondary route is never blocked by marketing copy.
- Every production page has a recoverable fatal-error path.
- Not-found routes offer a route back to Today.
- No empty state mentions a nonexistent control.
- Empty-state actions resolve to existing routes or controls.
- Loading shapes do not falsely imply Today content on unrelated pages.

#### Verification

- Force route errors in development and verify recovery.
- Open a missing task, project, and report ID.
- Check first-session navigation directly to Settings.
- Check all empty states at desktop and mobile widths.

---

### UX-A07 — Replace internal jargon on user-facing routes

Priority: P2  
Risk: Low  
Migration: No  
Architecture change: No

#### Files

Review and modify user-facing strings in:

- `src/app/reports/page.tsx`
- `src/app/reports/[id]/page.tsx`
- `src/app/schedule/page.tsx`
- `src/app/sources/page.tsx`
- `src/app/audit/page.tsx`
- `src/components/HydraConfigForm.tsx`
- `src/components/HydraScheduleSettings.tsx`
- `src/components/HydraRunNowButton.tsx`
- `src/components/TodayMeetingsCard.tsx`

Do not rename internal modules, database entities, API paths, or code identifiers in this release.

#### Copy replacements

- `Hydra` → user-configured project name, `brief`, or `automated brief`
- `Report ledger` → `Run history`
- `Trust trail` → `Activity log`
- `source-of-truth config` → `Brief scope`
- `Hydra / ASC scope` → `Work scope`
- `config snapshot` → `Settings version`
- `run-level health` → `Latest sync health`
- `connector hints` → `Source settings`
- `idempotency key` → remove from default UI; keep under developer details

#### Acceptance criteria

- “Hydra” is absent from user-facing copy unless it is the user’s configured project name.
- Technical terms remain available only in Advanced or developer details.
- Internal code and API names remain unchanged.

#### Verification

- Search rendered strings for the avoided terms.
- Verify Reports, Schedule, Sources, and Activity log in both themes.

---

### UX-A08 — Keep How we decide honest

Priority: P2  
Risk: Low  
Migration: No  
Architecture change: No

#### Files

Modify:

- `src/app/how-ai-works/page.tsx`

Add or extend behavior tests for the public claims using existing pure helpers.

#### Implementation

- Update the page only after UX-A01 through UX-A04 are complete.
- Describe shipped behavior, not intended future behavior.
- Keep the existing visual pipeline.
- Keep “Empty is better than a forced guess.”
- Do not claim persisted conflict resolution or criterion-specific evidence before Release B.

#### Temporary conflict copy

- `Worklight flags source disagreement for review. Open the task to compare available evidence.`

#### Acceptance criteria

- Every public rule has a corresponding behavior or rendering test.
- Confidence thresholds match UX-A04.
- The page does not claim criterion-specific evidence mapping before UX-B02.
- The page does not claim durable conflict decisions before UX-B03.

## 5. Release A completion gate

Release A is complete only when all checks pass:

- [x] `npm run lint`
- [x] `npm test`
- [x] `npm run build`
- [ ] Today desktop light
- [ ] Today desktop dark
- [ ] Today mobile light at 390 × 844
- [ ] Today mobile dark at 390 × 844
- [ ] Task detail desktop and mobile
- [ ] Outcome detail with mismatched evidence fixture
- [ ] Settings direct entry in a fresh session
- [ ] Loading, empty, error, and not-found states
- [ ] Keyboard-only navigation
- [ ] Visible focus styles
- [ ] 200% zoom without clipped controls
- [ ] Measured 4.5:1 contrast for normal text
- [ ] External Jira write confirmation still names issue and transition
- [ ] No database migration generated
- [ ] No connector or LLM-router changes

After this gate, stop and request approval before Release B.

## 6. Release B implementation

Release B changes persistence or local API semantics. It must be executed as separate reviewable work, not bundled into Release A.

### UX-B01 — Durable ownership decisions

Priority: P0 after Release A  
Risk: High  
Migration: Additive  
Architecture change: Local domain model only

#### Current limitation

The existing `not_mine` action sets status to `unclear` and appends text to `reason`. It does not store a first-class ownership decision. Visibility logic does not treat the appended sentence as a durable ownership signal.

#### Files

Modify:

- `src/db/schema.ts`
- `src/domain/workTask.ts`
- `src/services/workTasks.ts`
- `src/app/api/work-tasks/[id]/status/route.ts`
- `src/lib/filters/ownerFilter.ts`
- `src/lib/tasks/taskVisibility.ts`
- `src/lib/tasks/prioritizer.ts`
- `src/lib/dailyBrief/composer.ts`
- `src/components/BlockedWaitingCard.tsx`
- `src/components/TaskActionButtons.tsx`
- `src/app/tasks/[id]/page.tsx`

Add migration:

- generated Drizzle migration for nullable ownership decision

Add tests:

- `src/lib/tasks/ownershipDecision.test.mts`
- extend `src/lib/tasks/taskVisibility.test.mts`
- extend `src/lib/filters/ownerFilter.test.mts`

#### Data model

Add a nullable explicit decision:

- `confirmed_mine`
- `rejected_not_mine`
- null for no user decision

Do not encode the decision in reason text.

#### Behavior

- `Yes, this is mine` stores `confirmed_mine`, sets `statusManuallySet`, and returns the task to an eligible local queue position.
- `No, not mine` stores `rejected_not_mine`, sets `statusManuallySet`, removes the task from Today and priority composition, and preserves task/evidence for audit.
- Later syncs may add evidence but may not overwrite the explicit decision.
- External Jira state remains unchanged.

#### Acceptance criteria

- Both ownership actions are visible without disclosure on unclear ownership cards.
- Rejected tasks do not reappear after sync or queue rebuild.
- Confirmed tasks become eligible for prioritization.
- Original evidence remains queryable.
- No action writes to Jira.
- Legacy reason-note records are safely backfilled where unambiguous.

---

### UX-B02 — Criterion-to-evidence relationships

Priority: P0 after UX-B01  
Risk: High  
Migration: Additive relation store  
Architecture change: Evidence persistence and extraction contract

#### Files

Modify:

- `src/db/schema.ts`
- `src/services/workTasks.ts`
- `src/lib/llm/prompts/taskExtractor.ts`
- `src/lib/tasks/extractor.ts`
- `src/app/tasks/[id]/corrections/[index]/page.tsx`
- central output validation used by task extraction

Add:

- additive criterion/evidence relation storage;
- relation service;
- migration;
- grounding tests.

Coordinate with:

- WL-06 in `docs/architecture/worklight-accuracy-implementation-plan.md`.

Do not create a second competing evidence-relations architecture without reconciling WL-06.

#### Model requirement

Each criterion needs a stable identity and zero or more verified evidence links. Array position is never identity.

The implementation may use a stable criterion ID derived by the existing task-plan helper, but persistence must survive rendering order changes and must preserve historical relations.

#### Extraction requirement

- Extraction output identifies which verbatim quote supports each criterion.
- Validation confirms the quote exists in the source.
- A semantic grounding stage confirms the quote supports that criterion.
- Unsupported criteria route to missing evidence or Unclear; they are never force-filled.
- All LLM calls remain behind the central router.

#### Acceptance criteria

- Reordering criteria or evidence cannot change relationships.
- Every displayed criterion-specific quote exists in its source.
- Unsupported criteria use the honest missing-evidence state.
- Tests cover one-to-one, one-to-many, many-to-one, deleted sources, stale sources, and unrelated negative evidence.
- Migration preserves existing task evidence and does not invent relations.

---

### UX-B03 — Durable source-conflict resolution

Priority: P1  
Risk: High  
Migration: Likely additive  
Architecture change: Task-path evidence relation state

#### Files

Modify:

- `src/domain/dailyBrief.ts`
- `src/lib/tasks/conflictDetection.ts`
- `src/lib/dailyBrief/composer.ts`
- `src/components/HumanReadableTodayView.tsx`
- relevant services and API route

Coordinate with:

- WL-06 in the accuracy implementation plan.

#### Behavior

- Show both source names, timestamps, excerpts, and links.
- Allow local choices:
  - `Keep task open`
  - `Mark task done locally`
  - `Decide later`
- Persist the local interpretation and preserve both original sources.
- Keep external Jira transitions separate and confirmed.

#### Acceptance criteria

- Every conflict names both sides.
- Both sources are reachable.
- A local decision survives refresh and sync.
- No local decision silently mutates Jira.
- A later source revision may reopen the conflict without deleting decision history.

---

### UX-B04 — Persistent freshness and partial-sync state

Priority: P1  
Risk: Medium  
Migration: Prefer none if existing sync-run data is sufficient  
Architecture change: No provider orchestration rewrite

#### Files

Modify:

- `src/app/page.tsx`
- `src/components/HumanReadableTodayView.tsx`
- `src/components/SyncMyDayButton.tsx`
- `src/services/syncRuns.ts`

#### Behavior

Derive durable freshness from:

- overall run status;
- provider statuses;
- item and extraction failure counts;
- queue rebuild result;
- brief-build result.

Keep a partial/failed warning visible until superseded by a later successful run.

#### Exact copy

- Heading: `Some sources did not update`
- Body: `{source names} could not be refreshed. This brief may use older evidence.`
- Actions: `Review sync issues`, `Sync again`

Brief failure:

- Heading: `Sources updated, but Today did not refresh`
- Body: `Your existing priorities may be out of date.`
- Actions: `Rebuild Today`, `Review sync issues`

#### Acceptance criteria

- A partial run never appears fully current.
- A dismissed overlay does not remove the persistent warning.
- The warning names affected sources.
- Existing valid local content remains visible.
- No provider execution order or connector interface changes.

## 7. Deferred Release C

### UX-C01 — Provider-level continue/skip controls

Do not implement as part of this plan’s default execution.

This work changes sync control flow and freshness semantics:

- provider-level skip;
- continue without one provider;
- elapsed-time thresholds;
- final brief built from an explicitly incomplete source set.

Before implementation, write a separate architecture decision covering:

- safe cancellation boundary per provider;
- whether already-imported items remain committed;
- how skipped providers are recorded;
- how partial freshness is propagated;
- retry behavior;
- Inngest step identity and resumability.

Preserve the current provider-isolated waves until that decision is approved.

## 8. Dependency order

Use this exact order:

1. UX-A01 — stop false evidence claims immediately.
2. UX-A04 — unify confidence presentation.
3. UX-A02 — simplify task detail.
4. UX-A03 — complete Today cards and contrast.
5. UX-A05 — Settings trust copy and hub.
6. UX-A06 — route states and Tomorrow.
7. UX-A07 — remove internal jargon.
8. UX-A08 — update How we decide last.
9. Run the Release A completion gate and stop.
10. With explicit approval: UX-B01.
11. UX-B02 and UX-B03 coordinated with architecture WL-06.
12. UX-B04.
13. UX-C01 only after a separate architecture decision.

## 9. Review boundaries

Prefer small review units:

- PR 1: UX-A01 + regression test
- PR 2: UX-A04
- PR 3: UX-A02
- PR 4: UX-A03
- PR 5: UX-A05
- PR 6: UX-A06
- PR 7: UX-A07 + UX-A08
- PR 8: UX-B01 migration and UI
- PR 9: UX-B02
- PR 10: UX-B03 + UX-B04 if their persistence models do not conflict

Do not mix schema migrations with unrelated copy or layout changes.

## 10. Final release criteria

The UX implementation is complete when:

- no UI makes a source claim it cannot prove;
- every task card shows Evidence, Next action, and Done when;
- task detail has one primary action and a real local status;
- local status and Jira status are unmistakably separate;
- confidence appears with evidence and uses one shared threshold table;
- ownership can be confirmed or rejected durably;
- conflicts can be inspected and resolved locally;
- partial freshness remains visible;
- Settings explains credentials accurately;
- every production route is discoverable without expanding the top nav;
- every loading, empty, error, and not-found state offers a valid next step;
- desktop/mobile and light/dark verification pass;
- the existing connector, LLM-router, and sync-orchestration boundaries remain intact.
