# Daily Work Operator — visual redesign audit

Status: audit only; no UI implementation included  
Date: 18 July 2026  
Reference: `/Users/milosdostanic/Downloads/daily_work_operator_priority_light_blue (2).html`

## 1. Executive summary

The HTML reference is a strong visual and interaction direction for the existing
application, but it must be treated strictly as a prototype. Its page hierarchy,
component language, responsive behavior and contextual explanation pattern are
useful. Its static data, `localStorage` checklist, fake review request, fake sync
and hardcoded AI/source hierarchy are not suitable for the real application.

The current application already has most of the technical foundations needed for
the redesign:

- a Next.js App Router frontend;
- a reusable HeroUI-backed primitive layer in `src/components/ui`;
- semantic theme variables in `src/app/globals.css`;
- a real Today data flow in `src/app/page.tsx`;
- real task status mutations and Jira transitions;
- a real incremental sync with per-provider progress;
- evidence, source links, timestamps and task confidence;
- a reusable Sheet/Drawer primitive;
- verification and sync-review reports;
- structured Hydra conflicts and evidence relations;
- responsive Tailwind layouts, reduced-motion support and global toast support.

The largest work is therefore not a backend rebuild. It is a frontend
recomposition:

1. make the daily priority the first meaningful content;
2. make “open the work and start” the primary action;
3. split the current large focus component into reusable product components;
4. replace fragmented explanation/evidence overlays with one contextual
   `AIExplanationDrawer`;
5. show execution steps and Definition of Done honestly according to existing
   persistence support;
6. present conflicts only when the application has real conflict evidence;
7. make secondary work quieter and more explanatory;
8. apply the reference’s light-blue visual system through existing tokens and
   primitives, not page-local CSS;
9. move sync progress to an in-context pattern while preserving the current sync
   implementation;
10. improve mobile hierarchy, sheet behavior, focus handling and source layouts.

No new database model, authentication system, routing system, state library, API
client, sync mechanism or AI pipeline is required for the core redesign.

## 2. Non-negotiable implementation boundary

### Preserve as technical source of truth

The redesign must continue to use:

- `src/app/page.tsx` and the current App Router route tree;
- services under `src/services`;
- existing API routes under `src/app/api`;
- PostgreSQL/Drizzle persistence and current schemas;
- current user/profile/workspace behavior;
- current provider connectors and connection state;
- current Inngest sync orchestration and sync-run persistence;
- current task extraction, prioritization and briefing generation;
- current task status actions and Jira status transitions;
- current verification and sync-review flows;
- current cache/hash behavior and server-rendered data flow;
- current error handling, audit behavior and permission model.

### Explicitly do not copy from the prototype

Do not copy:

- its `localStorage` step persistence;
- its hardcoded task, people, dates, sources or confidence;
- its hardcoded explanation dictionary;
- its hardcoded source-priority order;
- its fake `setTimeout` sync;
- its fake “review requested” state;
- its direct DOM manipulation;
- its static navigation assumptions;
- its data ownership or JavaScript state architecture;
- its external asset color extraction;
- its GSAP dependency or Color Thief dependency.

The existing app already uses React, Tailwind, HeroUI, Framer Motion and Sonner.
Those are sufficient for the target interactions.

## 3. Sources reviewed

### Visual prototype

The audit reviewed:

- the final light-blue palette and semantic CSS variables;
- sticky header and sync health treatment;
- primary-priority composition;
- AI conclusion and confidence blocks;
- current-next-action block;
- verification and waiting side panels;
- execution-plan and Definition-of-Done sections;
- approval presentation;
- decision trail and inline conflicts;
- secondary-work strip;
- sources table;
- AI explanation drawer;
- responsive rules at 1000, 820 and 600 pixels;
- reduced-motion handling;
- hover, active, progress, accordion and drawer microinteractions.

### Existing application

The audit reviewed the current implementation centered on:

- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/TodayFilteredView.tsx`
- `src/components/TodayBriefing.tsx`
- `src/components/DailyFocusCard.tsx`
- `src/components/TaskCard.tsx`
- `src/components/TaskActionButtons.tsx`
- `src/components/TaskWorkContext.tsx`
- `src/components/EvidencePanel.tsx`
- `src/components/SourceBadge.tsx`
- `src/components/ConfidenceBadge.tsx`
- `src/components/SyncMyDayButton.tsx`
- `src/components/LastSyncSummary.tsx`
- `src/components/NavBar.tsx`
- `src/components/ui/*`
- `src/domain/workTask.ts`
- `src/domain/evidenceItem.ts`
- `src/db/schema.ts`
- current pages and API route structure.

## 4. Reference design language worth adopting

### Visual direction

The final prototype direction is a light, cool workspace:

- page background near `#f5f8fc`;
- white primary surfaces;
- very light blue supporting surfaces;
- violet-blue accent near `#655cf4`;
- dark indigo text near `#17192b`;
- muted blue-gray text near `#70778a`;
- pale blue borders;
- mint success, warm yellow warning and soft red danger;
- large, quiet radii between 18 and 28 pixels;
- subtle cool shadows rather than heavy elevation;
- restrained gradients used to distinguish AI conclusions and current action;
- one colored edge/rail on the primary priority surface.

This should be translated into the existing semantic variables in
`src/app/globals.css`. Do not add prototype variables such as `--space-1` or
hardcode prototype colors inside components.

### Typography

The prototype succeeds through hierarchy more than decoration:

- a large, compact priority title;
- 14–18px readable body copy;
- short uppercase section labels;
- clear separation between conclusion, next action and supporting evidence;
- restrained metadata.

The app’s existing Geist + Space Grotesk setup is compatible with this
direction. A font replacement is unnecessary. Use Space Grotesk for display
hierarchy and Geist for operational text.

### Layout

The useful composition pattern is:

1. compact sticky application header;
2. date/user context;
3. primary priority as the first meaningful section;
4. primary work surface plus a narrow supporting column;
5. execution and done criteria;
6. explanation/conflicts;
7. quiet secondary work;
8. collapsible source inventory.

The current max content width is already close to the reference. The redesign
should preserve the existing page container and change composition inside it.

### Motion

Adopt:

- 140–180ms control transitions;
- 240–320ms drawer, accordion and surface transitions;
- subtle active-step glow;
- progress transitions;
- small hover lift on large interactive surfaces;
- check/complete state transitions;
- backdrop and sheet transitions;
- reduced-motion fallbacks.

Do not adopt:

- cursor-following spotlights;
- decorative sparkles;
- ripple DOM injection;
- continuous floating blobs on every card;
- motion that shifts rows horizontally;
- GSAP solely for page entrance effects.

The app already has Framer Motion and CSS reduced-motion rules.

## 5. Current-state strengths to retain

### Existing primitive layer

`src/components/ui` already provides:

- Button;
- Badge;
- Card;
- Dialog;
- AlertDialog;
- Sheet/Drawer;
- Tooltip;
- Tabs;
- Collapsible;
- Alert;
- Skeleton;
- Input, Textarea, Select, Label and Separator.

These are HeroUI-backed wrappers with application-specific sizing and token
mapping. They should be extended, not duplicated.

### Existing product components

Useful existing product components include:

- `DailyFocusCard`;
- `TaskCard`;
- `TaskActionButtons`;
- `TaskWorkContext`;
- `EvidencePanel`;
- `SourceBadge`;
- `ConfidenceBadge`;
- `SyncMyDayButton`;
- `LastSyncSummary`;
- `TodayBriefing`;
- `TodayQueueTabs`;
- `TodayMeetings`;
- `EmptyState`;
- `HydraReportView`;
- `HydraRunStatus`.

The redesign should decompose and recombine these components rather than build a
second parallel UI.

### Existing data that can drive the redesign

The current focus flow already exposes:

- title;
- status and queue position;
- project;
- reason;
- next action;
- action steps from the generated briefing;
- Definition-of-Done strings;
- Jira key and URL;
- reference links;
- evidence quotes;
- source type, title, timestamp and URL;
- waiting-on text;
- task confidence;
- latest verification report;
- latest Figma/GitHub sync-review report;
- Figma frame, local repository and GitHub repository context.

The redesign can use real data for most of the reference composition.

## 6. Findings by severity

### Critical

### C1. Never implement prototype checklist persistence

The prototype persists execution-step state in `localStorage`. The real
application has no persisted per-step or per-criterion completion model.

Current evidence:

- `work_tasks` stores task-level status and `doneCriteria`, but no step state;
- generated `actionSteps` live in the daily briefing output;
- `/api/work-tasks/[id]/status` supports task-level lifecycle changes;
- verification reports store a task-level verdict and lists of matches/missing.

Required redesign behavior:

- execution steps may be displayed and selected/focused locally;
- step text may reveal contextual evidence;
- steps must remain non-completable until an existing persisted completion
  mechanism exists;
- do not show interactive checkboxes that reset on refresh;
- do not create a new persistence model merely to match the prototype;
- use the existing task-level Start/Done flow for actual status changes.

Implementation note: an ephemeral “selected step” is acceptable presentation
state. A “completed step” is business state and is not currently supported.

### C2. Never implement the prototype’s fake final-review action

The prototype changes “Not requested” to “Waiting” and shows success without
contacting a real workflow. No equivalent general review-request workflow was
found in the existing application.

Current supported actions are:

- open Jira/Figma/GitHub/provider links;
- transition a Jira issue through the existing Jira status control;
- mark a local task done;
- run local delivery verification;
- inspect a sync-review report.

Required redesign behavior:

- show external approval as read-only `ApprovalState`;
- derive its label only from existing provider/report/task state;
- when no real request action exists, show “Not requested” or “Waiting” and
  provide only real navigation such as “Open Jira”;
- do not simulate review request success;
- do not add a new backend endpoint only for visual parity.

### C3. Conflict UI must not infer disagreement from different timestamps

`EvidencePanel.hasConflictingSources()` currently treats multiple distinct source
dates as a conflict. Different timestamps do not prove that claims disagree.
This can falsely tell the user “Sources disagree”.

Required change before expanding conflict UI:

- remove date-only conflict inference;
- show a conflict only when real structured conflict data exists;
- use existing Hydra `evidence_relations`, Hydra report conflicts or an existing
  sync-review conflict;
- if only recency is known, label it “newer source available”, not “conflict”;
- show old/new claims only when both claims are real and attributable.

This is an evidence-integrity issue, not just visual polish.

### C4. Do not repurpose task extraction confidence as recommendation confidence

`work_tasks.confidence` and `ConfidenceBadge` describe confidence that a task was
correctly extracted from source material. The prototype’s “91% confidence”
visually implies confidence in the final recommendation.

Required behavior:

- label existing confidence according to its real meaning;
- place extraction confidence in the explanation/evidence drawer, not as an
  unqualified headline metric;
- if no explicit recommendation-confidence value is available through the
  existing flow, omit the percentage;
- never hardcode confidence.

### High

### H1. The daily priority is not the first meaningful section

Current Today order is:

1. greeting/actions;
2. profile warning;
3. last sync summary;
4. meetings;
5. resume card;
6. daily focus.

This conflicts with the product goal and mobile requirement. A long sync summary
or meetings list can push the primary decision below the fold.

Recommended order:

1. compact header/date/sync control;
2. primary focus;
3. execution/verification;
4. meetings and important news;
5. waiting/blockers;
6. secondary work;
7. sync/source details.

`LastSyncSummary` should become compact status near Sync My Day or a collapsed
“What changed” section after the primary focus.

### H2. Primary CTA hierarchy is inverted

The current focus card gives the largest high-emphasis action to “Mark done”.
“Open Jira” is secondary and “More information” competes beside it.

The user’s next likely action is to start/open the work, not mark it complete.

Required hierarchy:

- primary: `Open work and start`;
- secondary: `Why this priority?`;
- tertiary: `View evidence`;
- task completion: located near execution/Definition of Done, with confirmation;
- Jira transition: available but not visually competing with the start action.

The primary link must resolve through current data:

- Figma link when the concrete work target is Figma;
- GitHub/repository link when appropriate;
- Jira link when Jira is the only real target;
- existing internal route for internal modules;
- no invented universal task route.

### H3. Explanation and evidence are fragmented

Current behavior:

- `DailyFocusCard` opens “More information” in a Sheet;
- `EvidencePanel` opens a separate Dialog;
- task chat and sync review render other explanation surfaces;
- no shared contextual selection model exists.

Required:

- one reusable `AIExplanationDrawer`;
- contextual initial view: overview, evidence, conflict, criterion, step or
  blocker;
- every Why/Explain/Evidence trigger sends selected-item real data;
- evidence action scrolls/focuses the evidence section;
- one drawer instance per focus context;
- no nested dialog from inside the drawer.

### H4. Current evidence overlay uses a Dialog for long contextual content

`EvidencePanel` opens a modal dialog with a scrollable evidence list. Evidence is
contextual explanation and should preserve the user’s position.

Required:

- move long evidence to the shared Sheet/Drawer;
- reserve Dialog for confirmation, destructive actions and short blocking forms;
- keep existing `AlertDialog` for task Done/Delete confirmation;
- keep short verification input as Dialog if it remains brief.

### H5. Sync currently blocks the page in a modal

The current sync logic is real and must remain unchanged, but
`SyncMyDayButton.SyncOverlay` uses a pointer-blocking Dialog.

Target interaction:

- button enters loading state;
- compact provider progress appears in context;
- current daily plan remains visible and usable;
- expanded provider detail is optional;
- completion refreshes the current plan through the existing flow;
- meaningful changes are highlighted;
- partial/failure state remains visible;
- retry uses the existing sync action only.

Recommended UI:

- compact sticky/inline `SyncMyDayControl`;
- progress text and provider count beside/under the button;
- optional expandable provider status panel;
- result summarized by the existing `LastSyncSummary`;
- toast only for concise completion/error announcement;
- cancel remains connected to the current cancel route.

If product intentionally keeps a modal, closing it while running must be labeled
as cancellation. An “X” that silently triggers cancellation is ambiguous.

### H6. Focus reason is truncated before the user can understand it

`FocusContextSummary` applies `line-clamp-5`. The visible card can cut off the
reason at an arbitrary point while “More information” is generic.

Required:

- visible conclusion should be a short, deliberate 1–3 sentence summary;
- long reasoning belongs in the shared explanation drawer;
- “Why this priority?” should be the explicit entry point;
- avoid relying on CSS truncation to create content hierarchy.

### H7. Source metadata is incomplete in the Today view model

`SourceItem` already contains `author`, but `SourceLookup` and `EvidenceItem` do
not pass it through to Today. The target evidence view requires author/owner.

Frontend data-plumbing work:

- extend the existing view type with optional author;
- map it from already-loaded `sourceItems`;
- pass availability/health where it already exists;
- do not add an endpoint or database column.

### H8. Secondary work does not explain activation conditions

Current “After that” rows show only title and next action. Remaining queue tabs
show full task cards, which are visually heavy.

Required `SecondaryWorkItem` content:

- title;
- why it is not current;
- blocker or waiting-on state;
- activation condition;
- current status;
- existing target navigation.

Keep the section collapsed or visually quiet by default.

### Medium

### M1. The current component is too large and mixes product concerns

`DailyFocusCard.tsx` currently contains:

- title/meta;
- next action;
- done criteria;
- reason;
- evidence source summary;
- task mutations;
- provider links;
- work context;
- drawer content.

Split it into product components while preserving data ownership in the parent.

### M2. Sync component is too large

`SyncMyDayButton.tsx` contains request logic, polling, issue normalization,
progress derivation, modal presentation and post-sync result UI in one file.

Refactor without changing sync architecture:

- keep the current request/poll behavior;
- extract pure presentation components;
- extract pure formatting/derivation helpers;
- do not create a second sync hook or API client unless it merely wraps the same
  existing calls and remains local to this feature.

### M3. Token system is mature but the reference direction is not reflected

The app has semantic dark/light tokens. The reference uses a light-blue system
with violet accent and quieter surface contrast.

Required:

- update semantic light tokens centrally;
- decide a deliberate dark translation rather than auto-inverting prototype
  colors;
- preserve state semantics for Now, Waiting, Tomorrow, Unclear, Good and Danger;
- avoid per-component hardcoded prototype colors;
- remove duplicate `.btn` styling where HeroUI Button already owns behavior.

### M4. Navigation is dense on small screens

The sticky NavBar exposes eight horizontally scrolling links. The active link is
reordered on mobile, which can move controls unexpectedly.

Recommended:

- keep current routes;
- use a compact mobile navigation disclosure;
- do not reorder DOM/visual position of the active item;
- keep Today directly accessible;
- maintain keyboard navigation and `aria-current`.

### M5. Source inventory needs responsive list behavior

The prototype table is useful on desktop but not suitable as-is on mobile.

Required:

- desktop: compact source table/list with provider, source, timestamp, claim
  usage and open action;
- mobile: stacked source cards/rows;
- no horizontal table dependency for primary evidence;
- unavailable URLs render a state, not a dead action.

### M6. Loading and server error states are inconsistent

Several routes have no route-level loading/error UI and some Suspense fallbacks
are `null`.

For the redesign:

- reuse `Skeleton`, `LoadingState`, `InlineAlert` and `EmptyState`;
- add page/section fallbacks only in the current routing architecture;
- do not introduce client-side duplicate fetching to imitate skeletons.

### M7. Status and metadata labels need semantic consistency

The app mixes:

- queue status;
- Jira workflow status;
- provider health;
- sync run status;
- verification verdict;
- confidence.

Create a consistent visual API but keep these meanings separate. Do not collapse
them into one generic “status”.

### Low

### L1. Motion should be quieter than the prototype

Retain subtle lift, progress and state transitions. Skip sparkle, spotlight and
perpetual decorative animations.

### L2. Text scale is not fully consistent

The prototype enforces 14px supporting copy. The app frequently uses 11–13px
metadata. Keep 12px only for compact labels; important operational details,
errors and source metadata should be at least 14px where space permits.

### L3. Repeated provider labels should be centralized

Provider labels currently exist in multiple components. Reuse one frontend label
map to avoid “Gmail”, “Gmail & Gemini notes” and similar divergence.

## 7. Recommended Today page composition

### A. Compact page header

Contents:

- date;
- user context;
- concise connection/sync health;
- `SyncMyDayControl`;
- End Day as lower-emphasis action.

Behavior:

- sticky navigation remains;
- sync progress does not cover the page;
- provider details expand only on demand;
- mobile header stays compact.

### B. `PrimaryFocus`

Main column:

- “Do this today” label;
- real work-item key/status;
- title;
- concise user-facing reason;
- `AIConclusion`;
- `CurrentNextAction`;
- primary `Open work and start`;
- secondary Why and Evidence actions.

Supporting column:

- `VerificationList`;
- `WaitingItem` / `BlockerItem`;
- minimal source/confidence metadata.

Do not place “Mark done” as the main action at the top.

### C. `ExecutionPlan`

Use generated `actionSteps` when present.

Initial supported behavior:

- step text is selectable;
- selected step reveals its evidence/context;
- first step is initially active;
- no persisted completion checkbox;
- task-level Start/Done uses existing task status API;
- motion is presentational and reduced-motion aware.

If a future existing persistence mechanism becomes available, checkbox
completion can be enabled without changing the visual component.

### D. `DefinitionOfDone`

Use:

- current `doneCriteria`;
- latest verification report;
- latest sync-review report.

Presentation:

- criterion text;
- verified/missing/unknown state only when real report data supports it;
- “Run check” invokes the current verification action;
- no manually completable external approvals;
- task-level completion remains an explicit confirmed action.

### E. `DecisionTrail` and conflicts

Use:

- `priorityExplanation`;
- evidence timestamps;
- evidence source metadata;
- real structured Hydra/sync-review conflict data when available.

Default:

- compact summary;
- conflicts collapsed;
- expand in place;
- deeper Explain action opens `AIExplanationDrawer`.

### F. Important news and meetings

Keep the existing “Important for you” functionality, but place it after the
primary task and execution context.

Meetings are supporting constraints, not the first priority surface.

### G. Secondary work

Default collapsed/quiet.

Each row explains:

- why not current;
- what blocks it;
- what activates it;
- where the real work opens.

### H. Sources and sync detail

Place full source inventory and per-provider sync detail late in the page or in
contextual drawers. Keep concise source references next to every supported claim.

## 8. Reusable component plan

### Existing primitives to extend

### `Button`

File: `src/components/ui/button.tsx`

Extend only if needed:

- outcome-oriented variants remain semantic;
- preserve current HeroUI wrapper;
- icon-only size already exists;
- add loading presentation through existing props/composition;
- avoid a duplicate `IconButton` implementation unless it is a very thin alias
  around `Button size="icon"`.

### `Badge`

File: `src/components/ui/badge.tsx`

Compose into:

- `StatusBadge`;
- `ProviderStatus`;
- `ApprovalState`;
- `ConfidenceIndicator`.

Do not add unrelated badge primitives.

### `Sheet`

File: `src/components/ui/sheet.tsx`

Extend for:

- `AIExplanationDrawer`;
- mobile full-screen placement;
- sticky header;
- safe-area bottom padding;
- optional initial section anchor;
- focus restoration through HeroUI’s existing trigger behavior.

### `Dialog` and `AlertDialog`

Keep:

- destructive confirmation;
- mark-done confirmation;
- short verification form;
- other short blocking decisions.

Remove long evidence/explanation content from Dialog.

### `Collapsible`

Use for:

- conflict comparison;
- secondary work;
- source inventory;
- optional sync provider details.

### `Skeleton`, `Alert`, `Tooltip`, `Toast`

Reuse for:

- loading state;
- provider failure;
- unavailable source;
- icon-label clarification;
- concise completion announcements.

### Product components to create or extract

### `PrimaryFocus`

Extract from `DailyFocusCard`.

Responsibilities:

- compose hierarchy;
- receive real focus data;
- own no data fetching;
- expose callbacks/links from existing behavior.

### `AIConclusion`

Display concise reason/conclusion and optional correctly labeled confidence.

### `CurrentNextAction`

Display:

- next concrete action;
- target/provider;
- primary open/start action;
- active execution step when available.

### `VerificationItem` / `VerificationList`

Read-only manual verification prompts. Contextual Explain opens the shared
drawer with that selected item.

### `ExecutionStep` / `ExecutionPlan`

Initial API should distinguish:

- selected;
- supported completion state;
- unavailable completion control;
- contextual explanation.

Do not infer persistence from the component.

### `DefinitionOfDone`

Merge criteria with existing verification report state. External approval is a
separate child region.

### `ApprovalState`

Read-only unless a real supported action is passed in.

### `DecisionTrail`

Render user-facing reasoning, not raw debug score text.

### `ConflictComparison`

Require real old/new claims and source metadata. Do not render from timestamps
alone.

### `SourceLink` / `SourceEvidence`

Centralize:

- provider badge;
- source title;
- author;
- timestamp;
- stale/unavailable/error state;
- direct external link behavior.

### `SourcesTable`

Responsive desktop table / mobile list using existing source data.

### `SecondaryWorkItem`

Compact, quiet row/card with activation reason.

### `SyncMyDayControl`

Extract visual presentation from the existing `SyncMyDayButton`, but keep all
current endpoints and run lifecycle.

### `AIExplanationDrawer`

One shared contextual drawer. Proposed content contract:

- selected item identifier and type;
- title;
- concise conclusion;
- reasoning summary;
- source hierarchy when real;
- conflicts when real;
- confidence with explicit semantics;
- manual verification prompts;
- evidence records;
- initial section: overview/evidence/conflict/verification.

The drawer should receive prepared real data. It should not fetch from a new API
or contain a second AI pipeline.

## 9. Interaction-flow specification

### Sync My Day

1. Click current Sync action.
2. Call the current `POST /api/day/sync`.
3. Keep Today visible.
4. Show current per-provider run progress from the existing status endpoint.
5. Allow current supported cancellation.
6. On terminal state, call the existing refresh flow.
7. Highlight new/updated source items through existing run metrics and
   `LastSyncSummary`.
8. Preserve task-level states because existing sync already owns merge logic.
9. Show completed/partial/failed result.
10. Retry only by starting the current sync action again.

Do not add:

- fake timer progress;
- a second polling implementation;
- a separate loading route;
- mock provider states.

### Open work and start

1. Resolve the best existing real target.
2. External provider target opens in a new tab.
3. Internal route stays in the same tab.
4. If task-level Start is appropriate, invoke the existing status action without
   inventing navigation.
5. If no valid target exists, show a clear unavailable state and keep the task
   actionable through its existing controls.

### Why this priority?

1. Open `AIExplanationDrawer`.
2. Start at overview.
3. Show concise conclusion.
4. Show user-facing reasoning.
5. Show real source hierarchy or omit hierarchy if unavailable.
6. Show real conflicts.
7. Show evidence links.
8. Show correctly labeled confidence.
9. Show manual verification prompts.
10. Close by close button, Escape or backdrop.
11. Return focus to trigger.

### View evidence

Use the same drawer:

1. open with the focus item selected;
2. scroll/focus evidence heading;
3. show provider, title, timestamp, author, claim, effect and direct link;
4. show unavailable/error states;
5. do not open a second modal.

### Explain / Why / Evidence on child items

Pass a selected contextual item into the same drawer:

- verification;
- execution step;
- criterion;
- conflict;
- blocker;
- secondary recommendation.

The selected item controls initial copy and evidence. Do not reuse one generic
explanation.

### Execution steps

Supported now:

- text click selects step;
- selected step reveals supporting context;
- selection animates;
- no completion checkbox;
- no navigation from checkbox area because no checkbox is shown.

Blocked until an existing persisted mechanism exists:

- marking individual steps complete;
- restoring step completion after refresh;
- auto-advancing based on persisted completion.

### Definition of Done

Supported now:

- render criteria;
- run existing verification;
- map verification matches/missing to visible states;
- confirm task-level Done.

Not supported:

- persist manual criterion checkboxes;
- manually complete external approval;
- simulate approval request.

### Conflicts

1. Compact real conflict summary inline.
2. Expand in place.
3. Show old and new claim.
4. Show timestamps and owners when available.
5. Show selected current source and reason.
6. Show confidence impact only when real.
7. Direct links open externally.
8. Optional deeper explanation opens shared drawer.

### Secondary work

1. Keep collapsed/quiet.
2. Click uses existing route/link.
3. Explain why it is secondary.
4. Show blocker/activation condition.
5. Do not auto-open details.

## 10. Mobile behavior

### Required order

On mobile:

1. compact navigation/header;
2. date + Sync control;
3. primary focus;
4. current next action;
5. open/start CTA;
6. supporting verification;
7. remaining sections.

### AI explanation sheet

At mobile width:

- width and height become full screen;
- header remains sticky;
- close target remains visible;
- content scrolls independently;
- bottom uses `env(safe-area-inset-bottom)`;
- direct source links remain 44px-friendly;
- trigger context appears in header/subtitle;
- focus returns to trigger.

### Responsive layout

Suggested breakpoints can follow current Tailwind conventions:

- desktop: focus + narrow support column;
- tablet: main first, support panels below or in two columns;
- mobile: one column;
- primary actions full width;
- sources become stacked rows;
- no horizontal navigation or table required for core tasks.

## 11. Accessibility requirements

### Must retain

- semantic headings;
- `aria-current` on navigation;
- text labels in addition to color/animation;
- visible focus rings;
- reduced-motion handling;
- external-link semantics;
- Dialog/Sheet keyboard management from HeroUI.

### Must add or verify

- every icon-only control has an accessible name;
- drawer title and description are connected;
- initial drawer focus is sensible;
- evidence-section focus does not move unexpectedly;
- progress uses determinate/indeterminate semantics accurately;
- sync updates use a restrained live region;
- conflict accordion uses button/summary semantics;
- active execution step is not communicated by color alone;
- source availability/error states use text;
- pointer targets are at least 44px for primary mobile actions;
- no 11–12px text for errors or required operational detail;
- light-blue token contrast is tested in both light and dark schemes;
- backdrop click is disabled only when an action truly must block dismissal.

## 12. Existing support vs. blocked behaviors

### Supported with current architecture

- visual token update;
- Today page reorder;
- reusable component extraction;
- responsive priority composition;
- external target links;
- local task Start/Done/Skip/Snooze/Waiting;
- real Jira status transition;
- task Done/Delete confirmation;
- real sync progress, cancel and result;
- source links, titles and timestamps;
- source author plumbing from existing source records;
- task evidence;
- task extraction confidence with correct label;
- generated action-step display;
- Definition-of-Done display;
- delivery verification;
- Figma/GitHub sync-review display;
- Hydra structured conflicts;
- contextual drawer state;
- mobile sheet;
- loading/empty/error visual states.

### Partially supported

- source hierarchy: ranking explanation exists, but it is not a normalized
  source-priority model for every focus item;
- conflicts: rich Hydra conflict data exists, but ordinary focus-task evidence
  does not always carry structured claim pairs;
- confidence: extraction confidence exists; recommendation confidence semantics
  are not consistently persisted;
- approval: waiting-on text exists, but no general final-review workflow;
- “open work”: links exist, but target selection needs a deterministic frontend
  rule using current links/context.

### Not supported and must not be simulated

- per-step persisted completion;
- per-criterion persisted self-checks;
- generic final-review request;
- automatic external approval completion;
- universal internal task route;
- hardcoded AI confidence;
- fake provider health;
- fake conflict claims.

## 13. File-level implementation map

### Theme and shared primitives

- `src/app/globals.css`
  - map the light-blue direction to semantic tokens;
  - define motion durations/easing centrally;
  - add safe-area utilities if needed;
  - avoid page-specific prototype classes.

- `src/components/ui/button.tsx`
  - preserve HeroUI wrapper;
  - normalize loading/icon behavior if required.

- `src/components/ui/sheet.tsx`
  - add full-screen mobile treatment;
  - sticky header and safe-area body/footer support.

- `src/components/ui/collapsible.tsx`
  - use for conflicts and secondary sections.

- `src/components/ui/alert.tsx`
  - use for provider/source unavailable states.

### Today composition

- `src/app/page.tsx`
  - preserve server queries and service calls;
  - pass only additional existing source fields needed by views;
  - do not add client fetching.

- `src/components/TodayFilteredView.tsx`
  - reorder sections;
  - prepare primary/secondary presentation data;
  - keep owner filtering and current queue logic.

- `src/components/TodayBriefing.tsx`
  - compose new priority/execution/news/source sections;
  - keep current briefing data.

- `src/components/DailyFocusCard.tsx`
  - refactor into smaller product components;
  - replace generic More Information flow with drawer triggers;
  - correct action hierarchy.

- `src/components/TaskCard.tsx`
  - reuse new status/source/secondary components;
  - preserve three required pillars.

### Explanation and evidence

- create `src/components/AIExplanationDrawer.tsx`;
- refactor `src/components/EvidencePanel.tsx` to render content or trigger the
  shared drawer instead of owning a long Dialog;
- extend `src/domain/evidenceItem.ts` only as a view type with optional existing
  metadata such as author;
- reuse `SourceBadge`;
- add `SourceLink`/`SourceEvidence` as product components.

### Execution and verification

- create `ExecutionPlan`, `ExecutionStep` and `DefinitionOfDone`;
- adapt `TaskActionButtons` to provide existing task actions without owning the
  primary composition;
- reuse current verification Dialog and reports;
- do not add persistence.

### Sync

- split presentation from `SyncMyDayButton.tsx`;
- keep the exact current API and polling/cancel behavior;
- create `SyncMyDayControl` and `ProviderStatus`;
- integrate `LastSyncSummary` as post-sync change disclosure.

### Secondary work and sources

- create `SecondaryWorkItem`;
- adapt current queue rows in `TodayFilteredView`;
- create responsive `SourcesTable` from current evidence/source data.

## 14. Recommended implementation phases

### Phase 0 — baseline and contracts

Deliverables:

- screenshot baseline at desktop/tablet/mobile;
- keyboard walkthrough;
- map every proposed control to an existing action or mark unsupported;
- define shared presentation types;
- document confidence semantics;
- remove false date-based conflict wording before adding richer conflict UI.

No backend changes.

### Phase 1 — tokens and primitives

Deliverables:

- light-blue semantic token update;
- dark-mode translation;
- motion tokens;
- Sheet mobile/full-screen behavior;
- `StatusBadge`, `SourceLink`, `ProviderStatus`, `SectionHeading`;
- visual regression coverage where available.

No page restructuring yet.

### Phase 2 — primary Today hierarchy

Deliverables:

- priority first;
- corrected CTA hierarchy;
- extracted `PrimaryFocus`, `AIConclusion`, `CurrentNextAction`;
- support column with verification/waiting;
- compact header/sync health;
- responsive composition.

Use existing data/actions only.

### Phase 3 — shared explanation drawer

Deliverables:

- one `AIExplanationDrawer`;
- Why/Evidence/Explain contextual triggers;
- evidence author/timestamp/source link plumbing;
- mobile full-screen mode;
- focus return and Escape/backdrop behavior;
- remove long evidence Dialog.

No new AI endpoint.

### Phase 4 — execution, done and conflicts

Deliverables:

- read-only/selectable execution steps;
- Definition of Done mapped to verification reports;
- task-level Done in the correct location;
- read-only approval state;
- structured conflict comparison where real data exists;
- no unsupported checkboxes or request-review action.

### Phase 5 — sync and change communication

Deliverables:

- in-context Sync control;
- provider progress disclosure;
- meaningful changed-item highlight;
- partial/failure state;
- cancel clarity;
- Last Sync moved below primary or into disclosure.

Keep current sync implementation.

### Phase 6 — secondary work and page-wide rollout

Deliverables:

- quiet secondary work;
- responsive source inventory;
- consistent components across Projects, Knowledge, Reports, Sources, Schedule,
  Audit and Settings;
- route-level loading/error polish;
- mobile navigation refinement.

## 15. Validation plan

### Functional regression

Verify:

- Sync starts the same existing run;
- provider progress matches persisted run state;
- cancellation uses the current cancel route;
- page refresh displays the same server data;
- Start/Done/Skip/Snooze/Waiting remain functional;
- Done/Delete confirmations remain;
- Jira status transition remains real;
- all external links use real source URLs;
- verification still creates current reports;
- no check state appears without persistence;
- no review request reports false success.

### Evidence integrity

Verify:

- every recommendation claim links to evidence;
- source title/provider/time are accurate;
- author is shown only when available;
- “conflict” appears only with real disagreement data;
- unavailable/failed providers are explicit;
- confidence labels match their true semantics;
- Unclear tasks remain visually distinct.

### Accessibility

Test:

- keyboard-only Today flow;
- focus return from drawer;
- Escape and backdrop close;
- screen-reader drawer landmarks;
- live sync updates;
- reduced motion;
- 200% zoom;
- mobile safe areas;
- contrast for all semantic states.

### Responsive

Test at minimum:

- 1440px desktop;
- 1024px tablet landscape;
- 820px tablet portrait;
- 600px narrow tablet;
- 390px mobile;
- 320px minimum supported width.

### Performance

Verify:

- no new client fetch for data already loaded by the server;
- no large animation dependency added;
- no page-wide continuous animation;
- drawer/evidence components load without duplicating source payloads;
- existing force-dynamic behavior is unchanged.

## 16. Definition of done for the redesign

The redesign is complete when:

- Today immediately answers what to do first, why, the next action and what done
  means;
- the primary work-opening action is visually dominant;
- recommendation evidence is one action away without navigation;
- all Why/Explain/Evidence actions use the same contextual drawer;
- source claims are attributable and directly linked;
- conflicts are real, not inferred from date differences;
- sync remains the current real sync and does not block the page unnecessarily;
- execution steps do not claim persistence that does not exist;
- approvals do not claim actions or outcomes that do not exist;
- secondary work is quiet and activation conditions are clear;
- mobile shows the daily priority first;
- all primitives come from or extend the current component library;
- no new backend, database, auth, routing, state or AI architecture was
  introduced;
- existing task, Jira, sync, verification and provider flows pass regression
  testing.

## 17. Final recommendation

Proceed as a staged frontend refactor, starting with evidence correctness and
interaction contracts, then tokens/primitives, then Today composition and the
shared explanation drawer.

Do not start by copying the prototype page. Do not start with execution
checkboxes or review-request behavior. Those are the highest-risk places to
accidentally introduce fake state.

The safest high-value first implementation slice is:

1. remove the false conflict inference;
2. update light semantic tokens;
3. move primary focus above sync/meeting detail;
4. correct CTA hierarchy;
5. extract the shared AI explanation drawer;
6. move current evidence into that drawer;
7. leave execution and approval read-only until supported by existing state.

