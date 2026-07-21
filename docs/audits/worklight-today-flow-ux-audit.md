# Worklight Today flow UX audit

Audit date: 21 July 2026

## Scope and method

This audit reviewed the actual Today implementation and the locally rendered application as an evidence-based daily work assistant, not as a generic task manager.

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

Current heuristic score: **6/10**.

The interface succeeds at orientation, calm hierarchy, one dominant priority, and a readable primary-card story. It does not yet provide a complete correction and recovery loop for the AI-assisted decisions it presents. The five findings below are the changes required to reach 10/10.

## Five most important findings

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
