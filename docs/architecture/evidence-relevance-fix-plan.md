# Evidence Relevance Fix Plan

> **Status: EV-00, EV-01, EV-02, EV-06 shipped** (persistence-side merge guard).
> EV-03 (extractor grouping), EV-04 (display bundle), EV-05 (retroactive
> prune) are **not yet implemented** — see "Still open" below.
> Companion to the UATL-380 contamination investigation.
>
> **Problem:** unrelated sources get attached to a prominent active task as
> "evidence" — both persisted (DB) and at render time. UATL-380
> ("Design Part Search Banner") accumulated 59 evidence rows; only **2** are
> genuinely relevant.
>
> **Guiding principle:** prefer a *new task* over attaching evidence to the wrong
> task. An LLM `existingTaskId` hint is a candidate, never a command. No claim
> without a traceable, relevant source (see `ai-safety.mdc`, `product.mdc`).

---

## Decisions (locked)

These answers drive the fix design below:

1. **What makes a source relevant to a task:** it **shares the task's Jira key**,
   **OR** it **explicitly names the user (Milos) as owner of this specific
   work.** Same project alone, or incidental topic-word overlap alone, is **not**
   sufficient.
2. **Topic-overlap metric (where used):** flat threshold of **≥ 2 shared domain
   tokens** — deterministic, no length scaling, no per-source LLM judge. Used
   only as a *confirmation* signal for rule (1b), never as a standalone reason to
   attach.
3. **When an extract fails the relevance test:** create a **new standalone task**
   if it is clearly the user's work; do not force it onto an existing task.
4. **Retroactive cleanup (EV-05):** **destructive** — irrelevant evidence rows
   are removed automatically on every queue rebuild (with logging).
5. **The "Share prototype branch name" item specifically:** becomes its **own
   task** (it is a real Milos action item), not evidence on the banner.
6. **Conflict detection scope:** **unchanged** for now — keep the narrow
   "Jira Done vs. transcript still open" detector; broader conflict types are out
   of scope for this plan.

---

## Golden fixture — UATL-380

**Genuinely relevant sources (must stay):**
1. Jira `UATL-380` — "DESIGN - Banner for Part Search" (source item #250).
2. Hydra Daily 2026-07-22 (`not_PVQq1lhT2HAovu`) — "create 2-3 more banner
   mockups… use James' previous images as loose guardrails… small per-module
   snippets combined into one banner."

**Must NOT attach (contamination seen today):**
- 40× Gmail "Mapping…" thread (June 2026) — unrelated column-mapping work.
- Granola "Share prototype branch name for cross-module guidance" — a *different*
  daily (`not_9un3DpZoWYGhET`), belongs to cross-module guidance, not the banner.
  Per Decision 5 this becomes **its own task**.
- Granola items on Christian attendance, SKU 18-files edge case, UPC tickets,
  confidence-score reposition, AI/SDLC presentation.

Any fix ships only when a fixture built from these source items yields
**exactly the two relevant sources** on UATL-380, and the "Share prototype
branch name" extract produces a **separate** task rather than banner evidence.

---

## Root causes (3 vectors)

**A. Merge persists foreign evidence** (`src/lib/tasks/transcriptTaskMerge.ts`,
`src/lib/tasks/extractor.ts`)
- Non-transcript `existingTaskId` is trusted with **no** topic/key guard
  (`transcriptTaskMerge.ts:221-233`).
- Transcript `existingTaskId` is trusted after a Jira-key check but with **no**
  topic-overlap gate (`transcriptTaskMerge.ts:274-283`).
- `findOnlyActiveTopicAnchor` attaches on a **single** shared token when there is
  one now/next task (`transcriptTaskMerge.ts:181-192`) — the sole focus task
  becomes an evidence magnet.
- Extractor collapses extracts with **different** titles into one group solely
  because they resolved to the same task, and overwrites each evidence `summary`
  with the target's `primary.reason` (`extractor.ts:289-303`).

**B. Display over-pulls** (`src/lib/tasks/focusEvidenceBundle.ts`)
- `minScore: 0` for project-scoped tasks (`focusEvidenceBundle.ts:209-213,
  224-228`); with `granolaRelevance` recency bonus alone worth 3-5,
  zero-token-overlap sources clear the bar (`granolaRelevance.ts:17-42`).

**C. No self-heal**
- Once wrong rows exist, nothing re-checks or prunes them on later rebuilds.

---

## Fix items

> **Shared relevance predicate** (Decisions 1–2), reused by EV-01/02/04/05:
> a source is relevant to a task iff
> **(a)** it shares the task's Jira key, **OR**
> **(b)** it explicitly names Milos as owner of this specific work, *confirmed*
> by `topicOverlapScore(source, task) ≥ 2`.
> Same project alone, recency alone, or a single shared token is **never**
> enough.

### EV-00 — Extract the shared relevance predicate (prerequisite) ✅ Shipped
Implemented as `isExtractRelevantToTask()` in
`src/lib/tasks/transcriptTaskMerge.ts` (not a separate file — it sits next to
`jiraKeyForTask`/`topicOverlapScore`, which it composes, avoiding a circular
import between a standalone module and this one). Combines: Jira-key match via
`jiraKeyForTask` + `extractJiraKeysFromText`, ownership via
`classifyTaskOwnership` (`src/lib/filters/ownerFilter.ts`), and confirmation via
`topicOverlapScore ≥ 2`. Unit-tested directly in
`transcriptTaskMerge.test.mts` ("isExtractRelevantToTask (EV-00 shared
predicate)").

### EV-01 — Guard the `existingTaskId` hint (highest impact) ✅ Shipped
The LLM hint is now a **candidate**, confirmed via a new
`resolveExistingTaskIdHint()` helper that calls the shared predicate before
merging. Applied at **all three** trust points inside
`resolveTranscriptMergeTarget`: the non-transcript branch, the
waiting/unclear (`mode: "evidence"`) branch, and the transcript-actionable
hint branch. When unconfirmed, falls through to **new task** (Decision 3).
`resolveTranscriptMergeTarget` now accepts `myName` and `extractor.ts` passes
`currentUserName` into it.
- Files: `src/lib/tasks/transcriptTaskMerge.ts`, `src/lib/tasks/extractor.ts`.
- Test-verified against the golden fixture: the Gmail "Mapping" extract with
  `existingTaskId = 487` no longer merges onto the banner
  (`transcriptTaskMerge.test.mts`, "EV-01: guards the existingTaskId hint").

### EV-02 — Demote topic-only anchoring ✅ Shipped
Per Decision 1, topic overlap **alone** may no longer attach evidence.
Removed the `focusActive.length === 1 && score >= 1` and
`active.length === 1 && score >= 1` shortcuts from `findOnlyActiveTopicAnchor`
— it is now a pure topic-scoring helper with no status privilege (a sole
"now"/"next" task must still be the clear topical winner, not an automatic
magnet). `resolveTranscriptMergeTarget` additionally gates any anchor result
through `isExtractRelevantToTask` (explicit ownership + confirmed overlap)
before trusting it.
- Files: `src/lib/tasks/transcriptTaskMerge.ts`.
- Test-verified: strong topic overlap without an owner signal no longer
  merges ("does NOT topic-anchor-merge on overlap alone without explicit
  ownership (EV-02)"); the "Share prototype branch name" cross-daily item is
  also blocked via this path when it carries no Jira key.

### EV-06 — Dedupe same-work tasks across sources by exact title ✅ Shipped
**Real incident, distinct from EV-01/02:** task `#468` ("Design Part Search
Banner") was created from a Hydra Daily transcript on 2026-07-21, a day before
Jira issue UATL-380 existed, so its title never got a Jira-key prefix. The
next day's Jira sync for UATL-380 created a **second**, unrelated task row
(`#487`, "UATL-380 · Design Part Search Banner") because the non-transcript
merge branch only trusted the LLM's `existingTaskId` hint — it never checked
whether an existing task's title was, in substance, identical. Both tasks then
surfaced on Today (once as the primary focus card, once again under "Next
up") because they are genuinely different DB rows, not a rendering bug.

Fix: `findTaskByExactTitleMatch()` in `transcriptTaskMerge.ts` strips a
leading `KEY · ` / `KEY: ` / `KEY - ` Jira-key prefix and compares the
remaining title text. An exact match is treated as the same underlying task
and merges into it — this is a stronger, independent signal from topic
overlap, so it applies as a **fallback** in all three resolution paths (
non-transcript, non-actionable transcript, and the actionable-transcript
"genuinely new work" tail) after the Jira-key and `existingTaskId`/topic-anchor
checks have already had a chance to match. Guarded by `classifyTaskOwnership`
on the *candidate* task so an identical title on someone else's task never
silently merges. `MergeCandidateTask` now carries `owner` so this guard has
something to check.
- Files: `src/lib/tasks/transcriptTaskMerge.ts`, `src/lib/tasks/extractor.ts`
  (`toMergeCandidates` now passes `owner`).
- Test-verified: Jira sync for UATL-380 merges onto the pre-existing `#468`-style
  task instead of duplicating it; an identically-titled task explicitly owned
  by someone else is not touched (`transcriptTaskMerge.test.mts`, "EV-06: exact-title
  dedupe across sources").
- **Not fixed by this item:** the already-persisted duplicate (`#468`/`#487`)
  in the live database — that still needs a one-off manual merge/cleanup;
  EV-06 only prevents the *next* occurrence of this class of bug.

### EV-03 — Don't collapse distinct work; keep per-evidence summary
In the extractor grouping, keep extracts separate when `title`/`nextAction`
differ materially even if resolved to the same target. Store each evidence's own
summary instead of overwriting with `primary.reason`.
- Files: `src/lib/tasks/extractor.ts:273-303` (grouping key + `evidenceInput`).

### EV-04 — Stop display over-pull
Do not lower `minScore` to 0 for project-scoped tasks. Gate the bundle's
gmail/granola pull through the shared predicate: recency alone must not qualify a
zero-overlap source; require the Jira key or `≥ 2` token overlap.
- Files: `src/lib/tasks/focusEvidenceBundle.ts:209-213, 224-228`;
  `src/lib/tasks/granolaRelevance.ts` (separate recency from topic so recency
  can't clear the bar on its own).

### EV-05 — Retroactive prune on rebuild (destructive self-heal)
On every queue rebuild, **delete** evidence rows whose source fails the shared
predicate for the task (Decision 4). Guarded: never remove the task's own Jira
snapshot; log every deleted row (task id, source id, reason). Ships after
EV-00…EV-02 so the predicate is settled.
- Files: new `src/lib/tasks/evidenceRelevancePrune.ts`; call site in the
  priority/queue rebuild path; persistence in `src/services/evidence.ts`.

---

## Order & dependencies

1. **EV-00** — shared relevance predicate + tests. No migration. ✅ Shipped.
2. **EV-01** — biggest cleanup (Gmail bulk). No migration. ✅ Shipped.
3. **EV-02** — removes topic-only anchoring. No migration. ✅ Shipped.
4. **EV-06** — exact-title dedupe across sources (independent of the shared
   predicate; a separate signal). No migration. ✅ Shipped.
5. **EV-04** — display honesty. No migration. Not started.
6. **EV-03** — prevents future collapse of distinct tasks. Not started.
7. **EV-05** — ongoing destructive cleanup of already-poisoned rows. Not started.

`EV-00 → EV-01, EV-02, EV-04, EV-05` (all reuse the shared predicate).

**Important:** EV-01/EV-02 only stop *new* contamination from the extraction
path going forward. The 59 already-persisted evidence rows on UATL-380 (task
#487) are untouched in the database — that cleanup is EV-05's job.

---

## Test fixtures (ship-gate)

- `transcriptTaskMerge.test.mts` — shipped:
  - `isExtractRelevantToTask` unit tests (EV-00): Jira-key match → relevant;
    explicit ownership + ≥2 overlap → relevant; ownership alone → not
    relevant; overlap alone → not relevant.
  - Gmail "Mapping" extract with `existingTaskId = 487` (the real UATL-380
    banner task id) and zero overlap → resolves to **new task**, not the
    banner (EV-01, Decision 3).
  - "Share prototype branch name for cross-module guidance" (the real
    cross-daily contamination) with `existingTaskId = 487` → **no merge**
    (EV-01/EV-02, Decision 5 — it becomes its own task upstream in
    `extractor.ts`, not covered by this module's tests).
  - Today's real banner daily body → **merges** onto UATL-380 (regression
    guard, proves the fix doesn't over-correct).
  - Strong topic overlap without an owner signal → **no merge** (EV-02).
- Not yet written (blocked on EV-03/04/05):
  - `focusEvidenceBundle.test.mts`: project-scoped banner task → bundle
    excludes zero-overlap June Gmail even with recency (EV-04).
  - Integration: rebuild over the UATL-380 source set → **exactly 2** relevant
    sources; EV-05 **deletes** any pre-existing foreign rows.

---

## Resolved (was: open questions)

1. EV-05 cleanup is **destructive** on rebuild, with logging (Decision 4).
2. Topic-overlap threshold is **flat `≥ 2`**, used only to confirm explicit
   ownership — never as a standalone attach reason (Decisions 1–2).
3. Failed-relevance extracts become a **new task**, not Unclear (Decision 3).

## Still open / to revisit later

- **Live duplicate not yet merged:** task `#468` ("Design Part Search Banner")
  and `#487` ("UATL-380 · Design Part Search Banner") are still two separate
  rows in the database today — EV-06 only stops new occurrences. Needs a
  one-off manual merge (move `#468`'s evidence onto `#487`, delete `#468`)
  before Today stops showing the same work twice.
- **EV-03, EV-04, EV-05 are not implemented.** Only the persistence-side merge
  guard (EV-00–02) shipped. The 59 pre-existing evidence rows on UATL-380 are
  still in the database; they are only removed once EV-05 ships.
- "Explicitly names Milos as owner" reuses `classifyTaskOwnership`
  (`src/lib/filters/ownerFilter.ts`) as-is — no dedicated check was added. This
  means ownership resolution inherits that function's existing rules (e.g. bare
  name mentions don't count, but an `owner` field match does).
- Whether destructive EV-05 needs an audit-log/undo surface before it removes
  human-visible evidence.
- Broader conflict detection (Figma/PRD vs. Jira, transcript-vs-transcript) —
  explicitly deferred (Decision 6).
