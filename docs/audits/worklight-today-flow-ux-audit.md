# Worklight app UX audit

Audit date: 21 July 2026

## Scope and method

This audit began with the Today flow and was extended across the complete application. It reviewed the actual implementation and the locally rendered application as an evidence-based daily work assistant, not as a generic task manager.

The Today flow remains scored separately at **6/10**. The app-wide score is **5/10** because the rendered outcome-detail flow can present unrelated evidence as an “Exact instruction,” which is a severity-4 trust failure.

Reviewed:

- primary focus and secondary task cards;
- confidence, evidence, source access, and AI conclusions;
- priority, task status, local actions, and external-action boundaries;
- ownership confirmation and rejection;
- source conflicts;
- complete, partial, failed, and cancelled sync behavior;
- loading, empty, and error states;
- responsive behavior at 1440 × 1000 and 390 × 844;
- light and dark themes.

Primary implementation evidence:

- `src/app/page.tsx`
- `src/components/HumanReadableTodayView.tsx`
- `src/components/BlockedWaitingCard.tsx`
- `src/components/ConfidenceBadge.tsx`
- `src/components/WhyThisButton.tsx`
- `src/components/SyncMyDayButton.tsx`
- `src/components/TaskActionButtons.tsx`
- `src/components/TodayMeetingsCard.tsx`
- `src/app/loading.tsx`
- `src/app/globals.css`

Current Today heuristic score: **6/10**.

The interface succeeds at orientation, calm hierarchy, one dominant priority, and a readable primary-card story. It does not yet provide a complete correction and recovery loop for the AI-assisted decisions it presents. The five findings below are the changes required to reach 10/10.

## Part I — Five most important Today findings

### 1. Ownership correction is promised but cannot be completed

**Severity: 3 — Major**

**Problem**

Ownership-unclear cards tell the user to confirm or reject ownership, but expanding “Show actions” reveals generic task controls rather than the two promised ownership outcomes. The backend already accepts `not_mine`, but no rendered control invokes it. “First today” and “To do” also replace the underlying task status instead of appearing as separate priority labels.

This breaks the core AI-correction loop. The user can see that Worklight is uncertain but cannot give Worklight the explicit answer it requests.

**Evidence**

- `src/components/BlockedWaitingCard.tsx:27-31` promises “Confirm this is yours, or mark it not mine.”
- `src/components/BlockedWaitingCard.tsx:67-90` expands the generic `TaskActionButtons`.
- `src/components/TaskActionButtons.tsx:276-407` offers Start, Done, Check if done, Skip, Snooze, Waiting, and Delete; it offers no ownership confirmation or rejection.
- `src/app/api/work-tasks/[id]/status/route.ts:5-12` already supports `not_mine`.
- `src/components/HumanReadableTodayView.tsx:122-140` substitutes “First today” or “To do” for several real task statuses.
- The rendered desktop and mobile views show four ownership-unclear items with the promised action sentence and only a “Show actions” disclosure.

**Recommended change**

Put the ownership decision directly on every ownership-unclear card. Keep priority rank and task status as separate labels. Do not require disclosure or task-detail navigation to make the decision.

**Exact replacement copy**

- Ownership badge: `Ownership unclear`
- Prompt: `Is this your task?`
- Primary action: `Yes, this is mine`
- Secondary action: `No, not mine`
- Evidence action: `Review evidence`
- Confirmed message: `Ownership confirmed. Added to your queue.`
- Rejected message: `Marked as not mine. Removed from Today.`

Use these separate priority and status labels:

- Priority: `First today`
- `now`: `In progress`
- `next`: `Up next`
- `later`: `Later`
- `waiting`: `Waiting`
- `tomorrow`: `Tomorrow`
- `unclear`: `Needs clarification`

**Acceptance criteria**

- Every ownership-unclear card shows “Is this your task?”, “Yes, this is mine”, and “No, not mine” without expansion.
- “Yes, this is mine” persists an explicit local ownership decision, refreshes Today, and makes the task eligible for normal prioritization.
- “No, not mine” invokes the existing local rejection path, removes the item from Today after refresh, and preserves an auditable correction.
- Priority rank and task status are rendered as separate text labels.
- Every action has a pending state, a specific success message, and a recoverable failure message.
- Both ownership actions have at least a 44 × 44 px touch target on mobile.
- Neither ownership action writes to Jira or another external source.

**Regression risk: High**

Changing ownership affects filtering, daily-brief composition, and persistence across future syncs. Tests must prove that a later queue rebuild cannot overwrite the user’s decision.

### 2. Task pillars fail completeness and dark-theme legibility

**Severity: 3 — Major**

**Problem**

The primary card visibly presents Next action, Done when, and Evidence. Secondary cards present a reason and Next, but completely hide Done when and Evidence. “More details” makes the user navigate away to answer the two questions every task card is required to answer.

In dark mode, the primary Next action uses near-black text (`#0d1424`) over a gradient whose dark stop is `#3f6fa8`. Those two tokens measure **3.54:1**, below the WCAG AA 4.5:1 requirement for this normal-size text. The most important instruction can therefore be less legible precisely where it receives the strongest visual emphasis.

This makes the quieter cards faster to scan only by removing the information needed to judge whether they are valid and actionable, while the dominant card does not preserve equivalent readability across themes.

**Evidence**

- `src/components/HumanReadableTodayView.tsx:360-391` renders status, title, reason, next action, and “More details.”
- The same component receives full task evidence and done criteria at `src/components/HumanReadableTodayView.tsx:25-45`.
- The desktop and mobile renders show both Next up cards without visible done criteria or evidence.
- The primary card correctly renders all three pillars at `src/components/HumanReadableTodayView.tsx:304-320`.
- `src/app/globals.css:1896-1899` applies the blue-to-violet gradient to Next action.
- `src/app/globals.css:1924-1940` uses `--accent-contrast` for its label and action copy.
- Dark tokens are `--accent-contrast: #0d1424` and `--action-primary: #3f6fa8` at `src/app/globals.css:176-208`; their measured contrast is 3.54:1.

**Recommended change**

Keep secondary cards visually quiet, but add one visible done criterion and one visible source line. Truncate long content and allow progressive disclosure; do not fully hide either pillar. Use the filled-action foreground token for text on the primary gradient in both themes.

**Exact replacement copy**

- `Next action`
- `Done when`
- `Evidence`
- Task link: `Open task`
- Missing evidence: `No source attached. Clarify before acting.`
- Additional evidence disclosure: `View all evidence`

The primary labels and action copy can remain unchanged:

- `Next action`
- Use `--action-primary-foreground` for its text in both themes.

**Acceptance criteria**

- Every primary and secondary task card visibly contains Next action, Done when, and Evidence.
- A secondary card shows at least one complete done criterion and the decisive source name plus a meaningful excerpt.
- Long excerpts may be clamped, but the source and enough text to understand the claim remain visible.
- “View all evidence” opens the existing evidence disclosure without losing the user’s Today position.
- A task with no traceable evidence is labelled Needs clarification and cannot appear as the primary focus.
- The added content does not make secondary cards compete visually with the primary card.
- Next-action label and body text measure at least 4.5:1 against every point of the gradient in light and dark themes.
- Contrast is verified from computed colors, not visual inspection alone.

**Regression risk: Medium**

The main risk is excess sidebar height. Preserve the hierarchy through typography and disclosure, not by removing required information.

### 3. Confidence is ambiguous, hover-dependent, and separated from its source

**Severity: 3 — Major**

**Problem**

The visible badge says only “High · 94%” or similar. Its meaning appears only in a tooltip, so it is unavailable to touch users and can be mistaken for priority, completion likelihood, or evidence quality. The badge sits in the card topline while the source it qualifies is farther down the card.

The percentage also looks more precise than the interface explains.

**Evidence**

- `src/components/ConfidenceBadge.tsx:6-20` renders High, Med, or Low plus a percentage without a visible noun.
- `src/components/ConfidenceBadge.tsx:22-30` explains extraction confidence only in a tooltip.
- `src/components/HumanReadableTodayView.tsx:283-289` places confidence beside “First today.”
- Evidence is rendered separately at `src/components/HumanReadableTodayView.tsx:304-320`.
- The rendered views show “High · 94%” next to the priority badge, not next to “Hydra Daily.”

**Recommended change**

Label the metric in plain language and place it inside or immediately beside Evidence. Keep the short explanation available on tap, click, keyboard focus, and screen readers. Explicitly say that confidence is not priority.

**Exact replacement copy**

- Visible label: `AI confidence: High (94%)`
- Medium label: `AI confidence: Medium (40–69%)`
- Low label: `AI confidence: Low (under 40%)`
- No score: `AI confidence: Not scored`
- Explanation: `How likely Worklight is to have extracted this task correctly. This is not its priority.`
- Low-confidence action: `Review evidence`

**Acceptance criteria**

- “AI confidence” is visible without hover everywhere a confidence value appears.
- Confidence is adjacent to the evidence it qualifies, not adjacent only to priority.
- The explanation is available by pointer, keyboard, touch, and assistive technology.
- Priority and confidence never share an unlabeled numeric treatment.
- Low confidence uses text and an action, not color alone.
- Mobile and desktop expose the same meaning.
- Percentages continue to use extraction/classification confidence and never reuse priority score.

**Regression risk: Medium**

Moving the badge can affect compact layouts. The metric definition must stay aligned with the confidence model; copy must not claim measured accuracy that the model has not established.

### 4. Source conflicts are dead ends

**Severity: 3 — Major**

**Problem**

A conflict card renders only a “Conflict” badge and one summary sentence. It does not show the two disagreeing facts, identify which source said what, open the evidence IDs already attached to the conflict, or offer a local resolution.

The interface therefore announces uncertainty without helping the user understand or correct it.

**Evidence**

- `src/domain/dailyBrief.ts:35-40` stores `evidenceIds` for every source conflict.
- `src/components/HumanReadableTodayView.tsx:395-404` discards those IDs and renders only `conflict.summary`.
- `src/lib/tasks/conflictDetection.ts:69-72` records both the Jira source and task evidence IDs.
- The conflict card has no link, disclosure, or action path.

**Recommended change**

Render conflicts as a comparison: source A, source B, timestamps, excerpts, and links. Let the user choose the current local interpretation. Keep any external Jira mutation as a separate, explicitly confirmed action.

**Exact replacement copy**

- Badge: `Sources disagree`
- Heading: `Jira says Done; a transcript says open`
- Summary: `Jira marks {issue key} as Done, but a transcript still describes it as open.`
- Attention section label: `Needs your input`
- Section labels: `Jira evidence` and `Transcript evidence`
- Evidence action: `Review conflicting evidence`
- Decision prompt: `Which source is current?`
- Local actions: `Keep task open` and `Mark task done locally`
- Deferral: `Decide later`
- External link: `Open in Jira`

**Acceptance criteria**

- Every conflict card names both source types and the exact disagreement.
- Both evidence excerpts, dates, and source links are available from the card.
- “Review conflicting evidence” works on desktop, keyboard, and mobile.
- A local decision persists and removes or updates the conflict on the next render.
- “Mark task done locally” does not change Jira.
- Any action that would change Jira names the issue and transition in a separate confirmation before execution.
- If either source cannot be opened, the card says which source is unavailable and how to refresh it.

**Regression risk: High**

Conflict resolution affects task lifecycle and reconciliation. Preserve both original sources and the user’s decision for later audits.

### 5. Partial sync, empty, loading, and fatal error states do not form a reliable freshness story

**Severity: 3 — Major**

**Problem**

The sync overlay communicates provider progress well, but Today’s persistent warning is derived only from provider runs marked failed or cancelled. A top-level `partially_completed` run, a completed provider with failed individual items, or a queue/brief rebuild failure can therefore leave no persistent warning after the overlay is dismissed.

The active Today view also uses one empty state whether the app has never synced or has synced and found no clearly owned work. Loading has no visible status copy and uses a skeleton shaped like an older layout. There is no app error boundary, while Today loads all dependencies through one `Promise.all`; a single rejected dependency can replace the entire brief with a framework error.

**Evidence**

- `src/app/page.tsx:61-66` includes only provider statuses `failed` and `cancelled` in the Today warning.
- `src/components/SyncMyDayButton.tsx:409-419` correctly recognizes top-level partial, failed, and cancelled outcomes inside the transient sync result.
- `src/components/SyncMyDayButton.tsx:127-134` records item failures in provider counters, but Today’s persistent warning does not receive them.
- `src/components/HumanReadableTodayView.tsx:480-487` always renders “Nothing clearly yours yet” when no primary task exists.
- `src/app/loading.tsx:3-42` provides an `aria-label` and skeletons but no visible loading explanation; its structure does not match the current primary-pillars/sidebar layout.
- No `src/app/error.tsx` exists.
- `src/app/page.tsx:30-49` uses one `Promise.all` for queue, sources, connections, profile, briefing, daily brief, sync status, and meetings.

**Recommended change**

Treat freshness as durable page state, not only overlay feedback. Derive it from the overall run, every provider run, failed item counts, and briefing rebuild. Add distinct never-synced, current-empty, loading, partial, and fatal-error states with a specific recovery action.

**Exact replacement copy**

Persistent partial-sync banner:

- Heading: `Some sources did not update`
- Body: `{source names} could not be refreshed. This brief may use older evidence.`
- Actions: `Review sync issues` and `Sync again`

Brief-rebuild failure:

- Heading: `Sources updated, but Today did not refresh`
- Body: `Your existing priorities may be out of date. Rebuild the brief or try syncing again.`
- Actions: `Rebuild Today` and `Review sync issues`

First-use empty state:

- Heading: `Build your first daily brief`
- Body: `Sync your sources to find clearly owned work and the evidence behind it.`
- Action: `Sync my day`

Current no-owned-work state:

- Heading: `No clearly owned work yet`
- Body: `Worklight found no open task clearly assigned to you. Review unclear items or sync after source updates.`
- Actions: `Review unclear items` and `Sync again`

Current all-clear state:

- Heading: `No open work for today`
- Body: `Your latest successful sync found no open, clearly owned tasks.`
- Metadata: `Last checked {relative time}`
- Action: `Sync again`

Loading state:

- Heading: `Building today’s brief…`
- Body: `Checking local tasks, evidence, meetings, and source freshness.`

Fatal page error:

- Heading: `Today’s brief couldn’t load`
- Body: `Your local data is unchanged. Try again, or review source connections if this keeps happening.`
- Actions: `Try again` and `Review connections`

**Acceptance criteria**

- Persistent sync health uses overall run status, provider status, item failure counts, and briefing/queue rebuild outcome.
- A partial or failed result remains visible on Today until a later successful sync supersedes it.
- The warning names affected sources and offers both inspection and retry.
- Priorities backed by stale evidence are visibly labelled until freshness is restored.
- Never-synced, successfully all-clear, and no-clearly-owned-work states are distinguishable.
- Loading includes visible status text and a skeleton matching the current responsive layout.
- A local `error.tsx` boundary preserves navigation, explains the failure, and offers retry.
- A meetings or secondary-data failure does not unnecessarily hide otherwise valid task priorities.
- All state messages are announced appropriately without repeatedly interrupting screen-reader users.

**Regression risk: High**

Freshness is a trust boundary. Avoid treating “some data rendered” as “current,” and avoid turning optional sidebar failures into a full-page blocker.

## Supporting mobile, light, and dark review

These checks did not outrank the five trust and task-completion findings above.

### Mobile

The 390 px render correctly collapses to one column, preserves the primary-first order, keeps the three primary pillars visible, and avoids horizontal overflow. Secondary and attention cards remain legible.

Minor issue to include while implementing finding 1: the unpadded “Show actions” text control in `src/app/globals.css:2101-2113` does not guarantee a 44 × 44 px touch target. “Why this?” and other compact actions should be verified against the same minimum.

### Light theme

The primary hierarchy is clear, surfaces remain calm, and semantic warning/confidence treatments are distinguishable. The action panel is the only strongly filled area inside the primary card, which supports the intended hierarchy.

### Dark theme

The information hierarchy, borders, source surface, and action surface remain distinct. Statuses pair text with color, and no theme-specific overflow was observed. The primary Next action contrast failure is covered in finding 2 and must be fixed before the dark theme passes accessibility review.

### Accessibility follow-up

Run automated contrast and keyboard checks after implementation. The visual review does not replace measured WCAG contrast, focus-order, screen-reader, or 200% zoom testing.

## What must remain unchanged

- One clearly dominant daily priority.
- A maximum of three clearly owned priorities; do not pad the list.
- “Empty is better than a forced guess.”
- The calm briefing hierarchy; do not turn Today into a dashboard.
- The primary card’s always-visible Next action, Done when, and Evidence structure.
- Evidence-backed conclusions and direct source access.
- The “Why this” separation between the AI conclusion and source material.
- Unclear work remaining visually distinct from normal work.
- User correction controls being local and auditable.
- Read-only connectors by default.
- Explicit, in-the-moment confirmation naming the exact target for every external write.
- Per-provider sync progress, cancellation, reduced-motion support, and resumable polling.
- Responsive one-column mobile behavior.
- The shared semantic token system across light and dark themes.
- Progressive disclosure for supporting detail, provided that evidence, next action, and done criteria are never fully hidden.

## Definition of done for the audit follow-up

The Today flow reaches 10/10 when a user can answer, from every surfaced task or exception:

1. What matters first?
2. Why does it matter?
3. What is the next action?
4. What proves it is done?
5. Which source supports it?
6. What exactly does confidence mean?
7. What is the real task status?
8. How do I correct ownership?
9. How do I inspect and resolve disagreement?
10. Is this brief current, partial, stale, loading, empty, or broken—and what can I do next?

## Part II — App-wide extension

### Route coverage

The extension reviewed all 14 page routes:

- Today: `/`
- Task detail: `/tasks/[id]`
- Outcome detail: `/tasks/[id]/corrections/[index]`
- How we decide: `/how-ai-works`
- Settings: `/settings`
- Projects: `/projects` and `/projects/[id]`
- Knowledge: `/knowledge`
- Tomorrow: `/tomorrow`
- Source health: `/sources`
- Report history: `/reports` and `/reports/[id]`
- Automated reports: `/schedule`
- Activity history: `/audit`

Representative rendered checks covered Today, task detail, outcome detail, Settings, and How we decide at desktop width, plus task detail at 390 × 844. Every representative route returned HTTP 200. The review also inspected the remaining route implementations, their forms, empty states, status controls, and mutation boundaries.

Primary additional implementation evidence:

- `src/app/tasks/[id]/page.tsx`
- `src/app/tasks/[id]/corrections/[index]/page.tsx`
- `src/components/TaskActionButtons.tsx`
- `src/components/JiraStatusDropdown.tsx`
- `src/components/WelcomeModal.tsx`
- `src/components/NavBar.tsx`
- `src/app/settings/page.tsx`
- `src/components/ConnectionCard.tsx`
- `src/components/IngestForm.tsx`
- `src/components/IngestionRulesPanel.tsx`
- `src/app/how-ai-works/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/knowledge/page.tsx`
- `src/app/tomorrow/page.tsx`
- `src/app/sources/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/reports/[id]/page.tsx`
- `src/app/schedule/page.tsx`
- `src/app/audit/page.tsx`
- `src/inngest/functions/syncMyDay.ts`
- `src/lib/imports/syncProvider.ts`

### Lucas feedback from Granola

The app-wide recommendations incorporate direct feedback from:

- **Milos & Lucas sync**, 21 July 2026 — Granola meeting `81d71534-18e4-4b98-aab5-aa8785b9aa34`
- **Content File Mgr - Review**, 16 July 2026 — Granola meeting `949b9a0f-85b7-4dc0-a281-04c1474f1ab6`

Lucas’s direct app feedback and its current status:

1. **Confidence placement is still open.** Lucas first read “High 92%” as importance or priority. He asked for confidence to sit with source/accuracy information. Today still places it beside “First today,” and task detail repeats it in the header and a separate rail card.
2. **Status and actions are still mixed.** Lucas said the current controls feel like actions mixed with status and suggested a status dropdown plus a distinct CTA. Task detail still exposes Start, Done, Check if done, Skip, Snooze, Waiting, Delete, and sometimes Jira status in one panel.
3. **“Needs your attention” is still too weak.** Lucas suggested “Needs your input” or “Confirm this is yours” because the current label reads as secondary rather than required.
4. **The UX-writing pass is still needed.** Lucas said labels make sense after explanation but are not self-evident without it. Settings, reports, scheduling, and task controls still expose internal terms or vague outcomes.
5. **The simplified top-level navigation should remain.** Lucas explicitly preferred the reduced menu and clearer priority. The correction must not restore the old five-option top nav.
6. **Light and dark themes should remain.** Lucas found the theme direction more consistent. Theme support should be corrected, not replaced.
7. **The process-flow request is substantially addressed.** `/how-ai-works` now contains a visual pipeline. Preserve it, but make every claim match shipped behavior.
8. **The orchestration recommendation is substantially addressed in code.** `syncMyDay.ts:90-250` runs providers as isolated provider steps in authority-ordered waves, then performs queue and brief aggregation at `src/inngest/functions/syncMyDay.ts:331-354`. Preserve this boundary.
9. **The project-scope control is implemented but hard to discover.** Active projects limit provider work through `src/lib/imports/syncProvider.ts:96-102`; project toggles exist, but Projects has no discoverable entry from Settings.
10. **The Granola fallback exists but is buried.** Manual transcript ingestion is available in Settings, while the Granola connection copy still calls MCP “recommended” despite Lucas reporting that it can be slow and less accurate for his workflow.
11. **The core MVP concept should remain intact.** Lucas assessed the idea and value as strong and close to being ready to show. The findings below correct trust and comprehension failures; they do not propose turning Worklight into a broader project-management product.
12. **Showing the work to Jackson was a rollout recommendation, not a UI requirement.** It is intentionally not converted into a product feature or acceptance criterion.

## App-wide findings and proposed corrections

### 6. Outcome detail can label unrelated evidence as an “Exact instruction”

**Severity: 4 — Catastrophic**

**Problem**

Outcome detail assumes that done criterion number N is supported by evidence item number N. There is no stored criterion-to-evidence relationship. If the arrays differ in order or meaning, Worklight presents an unrelated quote under the authoritative label “Exact instruction.”

The rendered task “Share Prototype Branch” demonstrated the failure. Outcome 01 says the prototype branch link was shared with Matt, while its “Exact instruction” quote discusses a decorator, services, and reducing Sentry noise. This is not merely weak relevance; it makes the UI state that one source said something it did not say.

**Evidence**

- `src/app/tasks/[id]/corrections/[index]/page.tsx:26-32` pairs `doneCriteria[criterionIndex]` with `evidence[criterionIndex]`, then falls back to `evidence[0]`.
- `src/db/schema.ts:103` stores done criteria as a string array.
- `src/db/schema.ts:121-133` stores task evidence without a criterion ID or relationship.
- `src/app/tasks/[id]/corrections/[index]/page.tsx:65-84` labels the selected quote “Exact instruction” and derives “What needs to change” from the task-wide next action.
- The locally rendered `/tasks/408/corrections/1` visibly showed the unrelated outcome and Sentry quote together.

**Recommended change**

Create an explicit many-to-many relationship between each done criterion and its supporting evidence. Never infer semantic relationships from array position. Backfill only relationships that can be verified; mark every ambiguous criterion as unsupported.

Do not render “Exact instruction” unless the stored source contains the quoted text and explicitly supports that outcome.

**Exact replacement copy**

When verified evidence is linked:

- Section label: `Supporting evidence`
- Source link: `Open original source`
- Next-step label: `Next action`
- Result label: `Done when`

When no verified relationship exists:

- Badge: `Evidence missing`
- Heading: `No source is linked to this outcome`
- Body: `Review the task evidence before acting. Worklight could not verify which source supports this outcome.`
- Primary action: `Review task evidence`
- Secondary action: `Back to task`

Do not use:

- `Exact instruction`
- `Verify the result against the attached source evidence`

unless a criterion-specific source has actually been verified.

**Acceptance criteria**

- Every outcome stores stable links to one or more evidence records.
- Outcome rendering never selects evidence by array index or first-item fallback.
- Every displayed quote is verified as a substring of its source.
- A semantic-grounding test proves that the evidence supports the specific criterion, not only the task generally.
- Ambiguous legacy outcomes show the missing-evidence state and cannot claim an exact instruction.
- The rendered task 408 example cannot show the Sentry quote as evidence for sharing a prototype branch.
- Tests cover reordered criteria, reordered evidence, fewer evidence items than criteria, deleted sources, and multiple sources per criterion.
- Existing source records remain immutable and auditable during backfill.

**Regression risk: High**

This changes persistence and extraction output. Migration must preserve original task evidence and must not manufacture criterion mappings to make old data appear complete.

### 7. Task detail still mixes seven local outcomes with external Jira state

**Severity: 3 — Major**

**Problem**

The task-detail “Corrections” panel is the action mess Lucas described. It can show Start, Done, Check if done, a Jira dropdown, Skip, Snooze, Waiting, and Delete. Status, scheduling, verification, destructive actions, and external writes share one visual group.

The header compounds the problem by turning every status except waiting and unclear into “Priority.” A user cannot see whether the task is In progress, Up next, Later, Tomorrow, or Done. On mobile, the actionable panel appears only after meeting context, outcomes, evidence, confidence, and next action, so the user scrolls through the entire page before reaching a crowded control cluster.

The codebase already contains a quieter action pattern. `DailyFocusCard` uses `TaskActionButtons` with `layout="focus"`, which keeps Mark done primary and hides the seven-button stack. Task detail does not use it. When a Figma sync-review report exists, the main column and the sidebar both render it, so audit content is duplicated while the re-run control itself is missing from the active Today and detail paths.

**Evidence**

- `src/app/tasks/[id]/page.tsx:59-65` renders “Priority” for most real task statuses and repeats source confidence.
- `src/app/tasks/[id]/page.tsx:248-279` separates Next action from a “Corrections” panel but puts all task controls inside that panel.
- `src/components/TaskActionButtons.tsx:276-409` renders the local and external control cluster.
- `src/components/TaskActionButtons.tsx:283-400` maps four status changes to unrelated verbs: Start, Skip, Snooze, and Waiting.
- `src/components/JiraStatusDropdown.tsx:183-208` correctly confirms the external Jira transition, but its trigger is visually mixed with local controls.
- `src/components/DailyFocusCard.tsx` already mounts `layout="focus"` with a reduced action set; task detail does not.
- `src/app/tasks/[id]/page.tsx:81-120` and `src/components/TaskActionButtons.tsx:483-493` can both render the same sync-review report.
- The rendered desktop and mobile task 408 views showed seven compact controls under “Corrections.”
- This directly matches Lucas’s 21 July recommendation: status dropdown plus a distinct CTA.

**Recommended change**

Replace the control cluster with:

1. one visible, context-sensitive primary action;
2. one labelled Worklight status select;
3. a separate Jira status section when a Jira issue is linked;
4. destructive actions under “More actions.”

Reuse or extend the existing `layout="focus"` pattern rather than inventing a third action system. Keep local status and Jira status visually and semantically separate. Do not call the entire section “Corrections.” Render any Figma sync-review report once, and expose re-run from that single surface.

**Exact replacement copy**

Local section:

- Heading: `Task status`
- Helper: `Changes here update Worklight only. Jira stays unchanged.`
- Field label: `Worklight status`
- Options: `In progress`, `Up next`, `Later`, `Tomorrow`, `Waiting`, `Needs clarification`, `Done`
- Primary action before work starts: `Start task`
- Primary action while in progress: `Check completion`
- Manual completion action: `Mark done`
- Overflow: `More actions`
- Destructive item: `Delete task`

Jira section:

- Heading: `Jira status · {issue key}`
- Helper: `This changes Jira after you confirm.`
- Confirmation heading: `Update {issue key} in Jira?`
- Confirmation body: `Move {issue key} from {current status} to {new status}.`
- Confirm action: `Update Jira`

Status success messages:

- `Task moved to In progress.`
- `Task moved to Later.`
- `Task moved to Tomorrow.`
- `Task marked Waiting.`
- `Task marked Done and removed from Today.`

**Acceptance criteria**

- No task-detail state shows more than one primary CTA.
- Local status is always visible by its real name; “Priority” never replaces status.
- Start, Skip, Snooze, and Waiting are removed as separate peer buttons and represented through the Worklight status control.
- Check completion remains a distinct operation and explains that it compares done criteria against evidence.
- Delete remains behind a confirmation and under “More actions.”
- Jira status is in a separately titled section naming the issue key.
- Every Jira transition retains an in-the-moment confirmation naming current and target status.
- On 390 px mobile, Next action, the primary CTA, and Worklight status appear before meeting context and long evidence.
- Keyboard and screen-reader users hear whether a control changes Worklight or Jira.
- Default first paint shows no more than three labeled action controls outside evidence links.
- Figma or sync-review content appears once; re-run remains confirmation-gated and read-only.

**Regression risk: High**

Status semantics drive queue placement. Preserve `statusManuallySet` so a later sync cannot overwrite a user’s explicit selection.

### 8. Trust explanations promise behavior the app does not consistently deliver

**Severity: 3 — Major**

**Problem**

“How we decide” is visually clear and useful, but it states rules as already enforced:

- every surfaced task shows Evidence, Next action, and Done criteria;
- conflict banners show both sides’ evidence;
- unclear items remain resolvable;
- confidence is distinct from urgency.

The current Today and task-detail implementations violate each of those claims in at least one place. A trust page that overstates shipped safeguards is worse than no trust page because it invites the user to rely on protections that are absent.

Task detail also duplicates confidence and separates it from the supporting sources Lucas said it should qualify. Confidence thresholds themselves disagree across surfaces: How we decide and `ConfidenceBadge` use High ≥ 70% / Med ≥ 40%, while task detail uses High ≥ 75% / Medium ≥ 50%. The same score can therefore change label between Today and the opened task.

**Evidence**

- `src/app/how-ai-works/page.tsx:99-125` says conflicts stay visible and confidence is not urgency.
- `src/app/how-ai-works/page.tsx:241-259` says every surfaced task must show all three pillars.
- Part I findings 1-4 document the corresponding implementation gaps.
- `src/app/tasks/[id]/page.tsx:63-65` shows confidence in the header.
- `src/app/tasks/[id]/page.tsx:238-247` shows confidence again in a separate rail card.
- `src/app/tasks/[id]/page.tsx:12-16` uses 0.75 / 0.5 thresholds.
- `src/components/ConfidenceBadge.tsx:7-8` and `src/app/how-ai-works/page.tsx:117` use 0.7 / 0.4 thresholds.
- Supporting sources do not begin until `src/app/tasks/[id]/page.tsx:209-235`.

**Recommended change**

Treat the trust page as executable product policy. Add integration tests for every public claim and block release when the UI violates one. Remove duplicated confidence and place one labelled confidence explanation directly with Supporting sources. Use one shared threshold table everywhere confidence is labelled.

No copy-only disclaimer is an acceptable permanent fix. Either ship the safeguard or remove the claim until it exists.

**Exact replacement copy**

Task detail:

- Source section heading: `Evidence`
- Confidence label inside that section: `AI confidence: High (94%)`
- Explanation: `How likely Worklight is to have understood this task correctly from these sources. This is not priority.`
- Low-confidence action: `Review evidence`

Temporary conflict-page copy until two-sided evidence ships:

- `Worklight detected a source conflict. Review the task evidence before choosing what is current.`

After the full conflict flow ships, retain:

- `Sources disagree`
- `Review conflicting evidence`
- `Which source is current?`

**Acceptance criteria**

- Every claim on How we decide has a named integration test.
- Every task card visibly exposes all three required pillars.
- Every source conflict exposes both sides, timestamps, and source links.
- Every unclear ownership item exposes both ownership decisions.
- Confidence appears once per task context and sits with evidence.
- Confidence is never visually grouped only with priority.
- High / Medium / Low thresholds are identical on How we decide, Today, and task detail.
- No trust copy describes a control or safeguard that is absent from the current release.

**Regression risk: Medium**

The risk is documentation drift. Assign ownership for trust copy and test it alongside the behavior it describes.

### 9. Settings contains a false security claim and exposes implementation language as primary UX

**Severity: 3 — Major**

**Problem**

Settings says “Raw secrets never leave the browser,” but the browser posts tokens to local API routes. The intended promise appears to be local-first storage and no client bundling, not literal browser-only handling. The current wording is technically false and undermines trust.

The page also leads with MCP, PAT, OAuth app credentials, environment-variable names, embedding providers, and connector terminology. Lucas’s feedback was that labels should work without verbal explanation. These labels require implementation knowledge.

The Granola card specifically says MCP is “recommended,” while Lucas reported that Granola MCP was slow and less accurate for his use. Manual paste is a valid fallback, but it is a separate Settings tab and is not offered at the point of Granola friction.

**Evidence**

- `src/app/settings/page.tsx:157-169` contains the browser-only secret claim and technical source/key counters.
- `src/components/ConnectionCard.tsx:66-83` posts the entered secret to `/api/connections/{provider}/secret`.
- `src/app/settings/page.tsx:36-40` exposes environment setup instructions.
- `src/app/settings/page.tsx:68-129` uses MCP, OAuth, PAT, API key, and environment-variable language in primary connection cards.
- `src/app/settings/page.tsx:199-217` labels the five tabs Transcript, Rules, Model keys, and Profile without task-oriented context.
- `src/app/settings/page.tsx:96-103` calls Granola MCP recommended.
- `src/components/IngestForm.tsx:121-150` provides the manual notes/transcript fallback.
- This matches Lucas’s 21 July request for a full labels-and-copy pass and his 16 July concern about Granola MCP friction.

**Recommended change**

Correct the security promise immediately. Present one plain-language default connection path per source. Put transport choices, tokens, OAuth app setup, and environment variables behind “Advanced setup.”

Rename settings sections around the user’s goal. Offer manual paste from the Granola error/slow state, not only from a separate tab.

**Exact replacement copy**

Settings header:

- Heading: `Settings`
- Body: `Choose what Worklight can read and how it decides what belongs in Today.`
- Security note: `Credentials stay on this device. Worklight sends them only to its local server and the provider you connect.`

Tabs:

- `Connections`
- `Paste notes`
- `Extraction preferences`
- `AI model access`
- `Your profile`

Connection controls:

- Default action: `Connect {source}`
- Secondary disclosure: `Advanced setup`
- Connected status: `{source} connected`
- Error status: `{source} connection failed`
- Recovery: `Reconnect {source}`
- Destructive action: `Disconnect {source}`

Granola:

- Description: `Read meeting notes and transcripts from Granola.`
- Default action: `Connect Granola`
- Fallback: `Paste notes instead`
- Slow-state heading: `Granola is taking longer than usual`
- Slow-state body: `You can keep waiting or continue this sync without Granola.`
- Actions: `Keep waiting`, `Continue without Granola`, `Paste notes`

Do not put `MCP`, `PAT`, environment-variable names, or OAuth app creation in the collapsed card summary.

**Acceptance criteria**

- No UI claims a secret stays in the browser when it is sent to a local API route.
- Security copy accurately describes storage, server handling, provider transmission, and client bundling.
- Every source has one obvious default connection action.
- Transport and developer configuration are available under Advanced setup.
- A user can connect common sources without knowing MCP, PAT, OAuth, or environment variables.
- Granola is not labelled universally recommended without measured product evidence.
- A slow or failed Granola sync offers the existing manual-paste path.
- Settings copy passes a plain-language review without requiring verbal explanation.

**Regression risk: High**

Security wording must be verified against actual credential storage and transport before release. Do not replace one absolute claim with another unverified absolute.

### 10. The information architecture is simplified at the top but incomplete underneath

**Severity: 3 — Major**

**Problem**

The three-item top navigation is a strength and matches Lucas’s direction. However, the repository has 14 page routes and most have no discoverable route from their supposed hub:

- Source health, Reports, Schedule, and Audit are marked as Settings routes in navigation state, but Settings does not link to them.
- Projects and Knowledge have no top-level or Settings entry.
- Tomorrow is reachable contextually in code but not oriented in the main information architecture.
- Visiting Projects, Knowledge, or Tomorrow leaves no top-nav item active.

This is not only missing IA. `SettingsHubLinks` already defines a complete Setup and reference hub for Schedule, Reports, Sources, Audit, Knowledge, and Projects, but it is never imported or rendered. The lowest-risk fix is to mount the existing component after the Settings tabs, then rewrite its Hydra-heavy labels.

The first visit to any non-Today, non-task, non-How-we-decide page also opens a generic welcome modal. A user who navigates directly to Settings, Reports, Projects, or Knowledge is blocked by product marketing before they can understand the page they requested.

**Evidence**

- `src/components/NavBar.tsx:9-22` defines three top-level links and five Settings-hub prefixes.
- `src/components/NavBar.tsx:24-31` cannot mark Projects, Knowledge, or Tomorrow as current.
- `src/app/settings/page.tsx:188-351` contains five tabs but no links to Sources, Reports, Schedule, Audit, Projects, Knowledge, or Tomorrow.
- `src/components/SettingsHubLinks.tsx:3-58` defines the hub links and is unused in Settings.
- `src/components/SettingsBackLink.tsx:3-18` labels several pages as Settings children even though there is no forward path from Settings.
- `src/components/WelcomeModal.tsx:14-23` suppresses the modal only on Today, task routes, and How we decide.
- The rendered Settings page was covered by “Welcome to Worklight” on first visit.

**Recommended change**

Keep Today, How we decide, and Settings as the only top-level navigation. Mount `SettingsHubLinks` on Settings as the calm Advanced / Setup and reference section. Rewrite its labels to remove Hydra jargon. Remove, feature-gate, or keep developer-only routes out of production navigation.

Use contextual links for Knowledge and Tomorrow rather than adding top-level tabs. Remove the generic modal from secondary pages; onboarding belongs on the first-use Today state.

**Exact replacement copy**

Settings hub section:

- Heading: `Setup and reference`
- Description: `Source health, work contexts, automated briefs, and activity history.`
- Links: `Source health`, `Work contexts`, `Automated briefs`, `Run history`, `Activity log`, `Recent learnings`

Contextual links:

- Today knowledge section: `View recent learnings`
- End-day result: `Review tomorrow’s first task`

First-use Today onboarding:

- Heading: `Build your first daily brief`
- Body: `Connect a source or paste notes to find clearly owned work and its evidence.`
- Primary action: `Connect a source`
- Secondary action: `Paste notes`

Remove:

- the generic `Welcome to Worklight` modal from Settings and all secondary routes;
- any top-level menu expansion beyond Today, How we decide, and Settings.

**Acceptance criteria**

- Every production user-facing route has a discoverable path and a clear parent.
- Settings mounts the existing hub links and forwards to every page that presents a Settings breadcrumb.
- Projects, Knowledge, and Tomorrow either receive a contextual parent or are removed from production navigation.
- Every page passes the Trunk Test: page, current section, parent, and available next action are clear.
- First-use onboarding appears only in the first-use Today flow and never blocks a requested secondary page.
- Top-level navigation remains limited to the current three destinations.
- Advanced routes do not turn Today into a dashboard or add a sidebar.

**Regression risk: Medium**

The main risk is reintroducing menu sprawl. Preserve the three-item top nav and solve discoverability through hierarchy and contextual links.

### 11. Lucas’s sync architecture direction is mostly implemented; the remaining gap is user control and status

**Severity: 2 — Minor**

**Problem**

Lucas suggested discrete source workers followed by a separate comparison/orchestration pass. The current implementation already follows that pattern closely and should not be rewritten merely to mirror meeting language.

The UX gap is that users cannot see this boundary clearly or respond at provider level. A slow Granola provider can dominate perceived sync time, and the UI does not make the manual transcript fallback or project scope control easy to reach from the affected source.

**Evidence**

- `src/inngest/functions/syncMyDay.ts:90-250` executes provider-specific steps in waves.
- `src/lib/imports/syncProvider.ts:76-87` defines one read-only provider sync boundary.
- `src/inngest/functions/syncMyDay.ts:331-354` performs linked-Jira import, queue rebuild, Figma audits, and briefing only after provider collection.
- `src/lib/imports/syncProvider.ts:96-102` scopes providers with active projects.
- `src/components/SyncMyDayButton.tsx` already shows per-provider progress and supports cancellation.
- Settings contains project and transcript controls, but finding 10 documents their weak discoverability.

**Recommended change**

Preserve provider isolation and orchestration. Improve the product surface with provider duration, provider-level skip when safe, a direct path to Work contexts, and a manual-paste fallback for meeting sources.

**Exact replacement copy**

Sync progress:

- `Reading {source}…`
- `{source} updated`
- `{source} finished with issues`
- `{source} is taking longer than usual`
- `Continue without {source}`
- `Review source issues`

Scope:

- Setting label: `Include this work context in Sync my day`
- Disabled message: `{project} will be skipped during sync. Existing local evidence stays available.`

Process explanation:

- `Worklight reads each source separately, then compares the results before building Today.`

**Acceptance criteria**

- Provider-specific steps and connector interfaces remain isolated and testable.
- The final brief runs only after provider results are collected or explicitly skipped.
- The sync UI shows which provider is active, elapsed duration, and partial/failed status.
- A provider-level skip cannot mark that provider successful and cannot discard data already imported.
- Active-project scope is reachable from Settings → Advanced → Work contexts.
- Skipping a project reduces future source scope without deleting existing local tasks or evidence.
- Granola slow/failure states link directly to Paste notes.

**Regression risk: Medium**

Provider-level skipping affects freshness semantics. A brief built without a skipped source must remain visibly partial.

### 12. Secondary routes lack a consistent loading, empty, and error contract

**Severity: 3 — Major**

**Problem**

The app has one root loading file and no app error boundary. Secondary routes perform multi-service reads but provide no route-specific recovery. Several empty states explain absence without a direct CTA, and technical routes expose raw backend wording.

The Tomorrow empty state is worse than incomplete: it tells the user to “Use End day on Today,” but no End day control exists in the active Today UI. That instruction is a dead end.

The result is inconsistent with the strong sync overlay: long operations are explained in one flow, while direct route failures can become framework errors or dead-end empty cards.

**Evidence**

- Only `src/app/loading.tsx` exists; no route-level `error.tsx` files were found.
- `src/app/projects/[id]/page.tsx:123-131` loads six dependencies together.
- `src/app/knowledge/page.tsx:13-17` loads three dependencies together.
- `src/app/tomorrow/page.tsx:71-74` says to use End day on Today.
- No End day control exists in `HumanReadableTodayView` or other active Today components.
- `src/app/projects/page.tsx:64-82` explains empty projects but provides no action.
- `src/app/reports/page.tsx:52-54` says to run Hydra without placing the run action in the empty state.
- `src/app/audit/page.tsx:21-23` uses a bare sentence for the empty state.

**Recommended change**

Define one app-wide state contract: loading says what is being checked; empty distinguishes first use from current-empty; errors say what failed, what data is safe, and how to recover. Put the relevant action inside the state.

**Exact replacement copy**

Generic route error:

- Heading: `{Page name} couldn’t load`
- Body: `Your local data is unchanged. Try again, or return to Today.`
- Actions: `Try again`, `Back to Today`

Projects first use:

- Heading: `No work contexts yet`
- Body: `Sync Jira or another source to find the projects that should shape your brief.`
- Actions: `Sync my day`, `Connect a source`

Knowledge first use:

- Heading: `No learnings yet`
- Body: `Sync a source or paste notes to extract recent, evidence-backed learnings.`
- Actions: `Sync my day`, `Paste notes`

Tomorrow, until End day ships:

- Heading: `Nothing planned for tomorrow`
- Body: `Move a task to Tomorrow from any task, or sync after your last update.`
- Actions: `Back to Today`, `Sync my day`

Tomorrow, if End day ships:

- Heading: `Nothing planned for tomorrow`
- Body: `End today when you are ready to choose tomorrow’s first task.`
- Action: `End day`

Reports:

- Heading: `No brief runs yet`
- Body: `Run a brief now or set a weekday schedule.`
- Actions: `Run now`, `Set schedule`

**Acceptance criteria**

- Every user-facing route has a recoverable error boundary.
- Loading copy is visible and specific to the page.
- First-use, filtered-empty, all-clear, and failed-load states are distinct.
- Every recoverable empty state contains its most relevant CTA.
- No empty state mentions a control that is absent from the current UI, including End day.
- Optional sidebar or diagnostics failures do not hide otherwise valid primary content.
- Error messages never expose raw stack traces, transport terms, or provider codes without explanation.
- Status messages are announced once to assistive technology.

**Regression risk: Medium**

Avoid making every partial dependency failure fatal. Preserve valid local content and identify only the unavailable section.

## App-wide copy decisions

Use one term for each concept:

- `Today` — the current daily brief
- `Task status` — local Worklight lifecycle state
- `Jira status` — external Jira workflow state
- `Priority` — ordering, never task status
- `AI confidence` — extraction/interpretation confidence, never urgency
- `Evidence` — source material supporting a claim
- `Done when` — checkable completion criteria
- `Needs your input` — user decision required
- `Needs clarification` — requirement or ownership is unresolved
- `Work context` — a project used to scope sync
- `Run history` — previous automated or manual brief runs
- `Activity log` — local configuration and run events

Avoid as primary user-facing labels:

- `Hydra`
- `MCP`
- `PAT`
- `source-of-truth config`
- `config snapshot`
- `idempotency key`
- `run-level health`
- `connector hints`
- `Corrections` when the section primarily changes status
- `Priority` when the value is a lifecycle status
- `Verify` when the required user action is ownership confirmation

Technical terms may remain inside an explicitly labelled Advanced or developer-details disclosure.

## App-wide implementation order

1. Stop false evidence claims in outcome detail and add criterion-to-evidence persistence.
2. Replace the task-detail action cluster with Task status, one CTA, a separate Jira section, and More actions; reuse `layout="focus"` as the starting pattern.
3. Complete the Today ownership, conflict, confidence, pillar, and freshness fixes from Part I.
4. Correct Settings security copy and move technical setup under Advanced.
5. Mount `SettingsHubLinks` and rewrite its labels; repair route hierarchy without expanding top-level navigation.
6. Fix Tomorrow’s End day dead end and add route-level loading, empty, and error recovery.
7. Unify confidence thresholds and add integration tests that keep How we decide synchronized with shipped safeguards.
8. Improve provider-level sync control while preserving the current isolated orchestration.

## App-wide preservation constraints

In addition to Part I’s “What must remain unchanged”:

- Keep exactly one dominant daily priority.
- Keep the three-item top navigation: Today, How we decide, Settings.
- Keep light and dark themes and the shared semantic token system.
- Keep the visual process flow on How we decide.
- Keep provider-isolated read-only connectors and the post-collection comparison/orchestration pass.
- Keep active-project scoping so users do not spend time or model tokens on irrelevant work.
- Keep manual transcript ingestion as a fast, accurate fallback.
- Keep direct access to original sources.
- Keep every external write separate and explicitly confirmed with its exact target.
- Keep local corrections auditable and protected from later AI overwrite.
- Do not turn Projects, Reports, Knowledge, or source health into a project-management dashboard.

## App-wide definition of done

The complete app reaches 10/10 when:

1. No outcome can display evidence that is merely adjacent by array position.
2. Every task exposes one next action, one real status, done criteria, evidence, and a correction path.
3. Local Worklight changes and external Jira changes are visibly separate.
4. Confidence always sits with evidence and cannot be read as priority.
5. Every public trust claim is backed by a passing behavior test.
6. Settings copy accurately explains credentials and works without implementation jargon.
7. Every production route is discoverable without expanding top-level navigation.
8. Loading, empty, partial, stale, and failed states identify a next step.
9. Mobile users reach the next action and status before long supporting context.
10. Lucas’s approved direction remains intact: simpler navigation, clear daily focus, consistent themes, source-specific processing, project scope control, and transparent evidence.
