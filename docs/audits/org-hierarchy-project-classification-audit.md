# Org hierarchy and project classification audit

Audit date: 2026-07-28
Scope: committed roster (`docs/org/si-org-chart.json`), hardcoded-stakeholder code
sites, deterministic identity resolution, and evidence-backed project membership
in the local PostgreSQL database.
Method: executable code and SELECT-only database queries were treated as
authoritative. Where the audit brief's premise disagreed with runtime code or
data, the code and data win and the discrepancy is recorded explicitly.

Classification vocabulary (carried from the prior audits):
**Implemented** / **Partially implemented** / **Mocked** / **Hardcoded** /
**Not found** / **Unknown**.

## Prior audit coverage (not restated here)

- `docs/audits/company-identity-hierarchy-current-state.md` (2026-07-19) covers
  application authentication, session state, the singleton user profile,
  API-route authorization, credential ownership, background jobs, and audit
  logging. Its finding that no authentication, session, or server-side
  ownership boundary exists is a precondition for everything below and is not
  re-argued.
- `docs/audits/confluence-drive-company-directory-audit.md` (2026-07-19) covers
  the Confluence connector, the absent Google Drive provider, candidate
  directory documents, and the proposed directory ingestion/publication
  architecture. Its finding that no canonical directory source is configured is
  the reason the Figma board is currently the only roster of record.

This audit adds three things those two do not cover: verification of the
committed roster data, the behavior of the hardcoded stakeholder checks against
that roster, and evidence-backed person-to-project membership derived from the
local database.

## Reproduction

Two SELECT-only scripts were added for this audit and are the evidence behind
every count below:

- `scripts/auditOrgProjectClassification.mts` — table census, distinct
  author/assignee/owner strings, metadata-key census, roster resolution buckets.
- `scripts/auditProjectMembership.mts` — per-person, per-project membership rows
  with source ids, dates, and quotes; plus the unresolved set.

Run with `node --experimental-strip-types --no-warnings scripts/<file>.mts`.
Neither script writes to the database or to any external system.

## A. Roster data verification

`docs/org/si-org-chart.json` — **Implemented**. The file parses, and its
`provenance` block is internally consistent with its payload:

| Field | Value | Verified |
|---|---|---|
| `fileKey` | `DHfQm8F66zFlWB9dxC7CeV` | matches `boardUrl` |
| `lastModified` | 2026-07-16T08:42:04Z | — |
| `extractedAt` | 2026-07-28T10:44:51.634Z | — |
| `ruleVersion` | 1 | matches `scripts/extractOrgChart.mts` |
| `shapeCount` / `connectorCount` | 92 / 91 | 92 shapes, 91 edges = one tree |
| `rosterCount` | 92 | `roster.length === 92` |

Structural checks all pass: no duplicate full names (after diacritic folding),
every non-null `managerName` resolves to a roster entry, and exactly one entry
(`Joshua Segall`, depth 0) has `managerName: null`.

Depth distribution: depth 0 = 1, depth 1 = 4, depth 2 = 18, depth 3 = 43,
depth 4 = 26.

### A.1 First-name collisions confirmed, with two corrections to the rules doc

`docs/org/hierarchy-decoding-rules.md` section 4 claims 10 first names shared by
27 people. Recomputed from the roster with `normalizePersonName` semantics, this
is exactly right: **10 colliding first names covering 27 people**.

Two details in that table are wrong and should be corrected at the source:

1. The `ivan` row lists "Ivan Jurić" and "Ivan (one more)". There is no Ivan
   Jurić in the roster. The seven are: Ivan Vučak (d1), Ivan Pavao Lozančić
   (d2), Ivan Lozić (d3), Ivan Dumančić (d3), Ivan Lacković (d3), Ivan Tamarut
   (d3), Ivan Augustinović (d4).
2. The `david` row lists "David (one more)". The second David is David Davtian
   (Product Manager, d3, reports to Michael Ballard).

Full verified collision set:

| First name | Count | Full names (depth) |
|---|---|---|
| ivan | 7 | Ivan Vučak (1), Ivan Pavao Lozančić (2), Ivan Lozić (3), Ivan Dumančić (3), Ivan Lacković (3), Ivan Tamarut (3), Ivan Augustinović (4) |
| luka | 4 | Luka Dugi (2), Luka Vilagoš (4), Luka Renjić (4), Luka Pancirov (4) |
| lucas | 2 | **Lucas Saeed (2)**, **Lucas Thomas (3)** |
| david | 2 | David Brubacher (1), David Davtian (3) |
| mateo | 2 | Mateo Premuš (2), Mateo Mataja (4) |
| neven | 2 | Neven Mendrila (2), Neven Vučinić (4) |
| goran | 2 | Goran Nikšić (2), Goran Malić (4) |
| karlo | 2 | Karlo Siladi (3), Karlo Mijaljević (4) |
| ante | 2 | Ante Ristovski (3), Ante Radić (4) |
| alex | 2 | Alex Diaz (3), Alex Junior Valerio Moreira (4) |

### A.2 Lucas Thomas is at depth 3, not depth 4

The audit brief states Lucas Thomas is depth 4. The roster (`figmaNodeId`
`19:331`) records **depth 3**, `managerName: "Ivan Pavao Lozančić"`. The
correction does not weaken the collision finding — Lucas Thomas still holds no
management authority and sits on the Engineering branch, not Product/Design —
but any implementation keyed to a depth number must use the roster value.

### A.3 `depth <= 2` is not a usable authority test

The proposed rule "depth ≤ 2 means high authority" admits **23 of 92 people**,
including four who are not managers of anything relevant to stakeholder
authority: Ivan Pavao Lozančić, Neven Mendrila, and Goran Nikšić (all titled
"Software Engineer", and all recorded as `ic_with_reports` anomalies), plus
Connor McLaren (Assistant Product Manager). It also admits Ashley Frericks
(Assistant to the CEO) and the title-less `Mitchell Maddox Austin, TX` record.
Depth alone cannot carry the authority decision — see the proposal's schema
amendment (b).

## B. Hardcoded-stakeholder census

Every site in the brief was opened and confirmed at the stated location. All 14
are **Hardcoded**; none reads a roster, role, or reporting line.

| # | File:line | Symbol | Verified | Blast radius if wrong |
|---|---|---|---|---|
| 1 | `src/domain/hydraReport.ts:102` | `DEFAULT_HYDRA_CONFIG.stakeholders = ["Matt", "Lucas"]` | Yes | Root of the whole chain. Every consumer of `DEFAULT_HYDRA_CONFIG` and everything re-exporting it inherits the two bare first names. |
| 2 | `src/lib/tasks/sourceAuthority.ts:47` | `HIGH_AUTHORITY_STAKEHOLDERS` | Yes | Default argument for `hasHighAuthorityStakeholderInstruction`, so ranking, conflict resolution, and confidence all silently use `["Matt","Lucas"]` unless a caller overrides it. No caller does. |
| 3 | `src/lib/tasks/sourceAuthority.ts:213` | `hasHighAuthorityStakeholderInstruction` | Yes, with a correction (B.1) | Decides the +160 boost, `compareSourceAuthority` precedence, and the source-authority confidence bump. |
| 4 | `src/lib/tasks/sourceAuthority.ts:350–355` | `score += 160` | Yes (`score += 160` is line 351) | A wrong stakeholder match displaces correctly-ranked work from the focus view. 160 is larger than the Jira (+40), PRD (+20), and "recent transcript this week" (+70) signals combined. |
| 5 | `src/lib/hydra/decisionEngine.ts:38` | `stakeholders ?? ["Matt", "Lucas"]` | Yes | Runtime fallback for Hydra evidence scoring when config is absent. |
| 6 | `src/lib/hydra/decisionEngine.ts:52–54` | `author.toLowerCase().includes(name.toLowerCase())` + `"Instruction from Matt or Lucas"` | Yes | +80 Hydra score. Substring, not word-boundary — the widest matcher in the codebase (see B.2). |
| 7 | `src/lib/hydra/orchestrator.ts:447–449` | `["Matt", "Lucas"]` fallback | Yes | Supplies site 6 during real runs; also hardcodes `currentUserName: profile?.name ?? "Milos Dostanic"` on line 454. |
| 8 | `src/lib/llm/prompts/taskExtractor.ts:74, 76` | "Matt or Lucas" in prompt text | Yes (lines 74 and 76; line 97 is the `reason` field comment in `OUTPUT_SHAPE`, not a stakeholder mention) | The extractor LLM is instructed to treat any "Matt or Lucas" as authoritative and cannot disambiguate. |
| 9 | `src/lib/llm/prompts/deliverySyncReview.ts:74` | "a direct Matt or Lucas instruction" | Yes | Sync review inherits the same ambiguity when reconciling delivery against requirements. |
| 10 | `src/lib/llm/prompts/taskQa.ts:59` | "Matt/Lucas transcript instructions still win" | Yes | Question answering asserts stakeholder precedence to the user in prose. |
| 11 | `src/lib/llm/prompts/figmaFrameDiscovery.ts:35` | "a direct Matt or Lucas transcript instruction" | Yes | Frame discovery ranks design evidence by the same ambiguous rule. |
| 12 | `src/components/DecisionTrail.tsx:11` | "If Matt or Lucas explicitly said it, that instruction still wins." | Yes | User-facing. This is the sentence that makes the ambiguity invisible: it names a first name the user must disambiguate mentally. |
| 13 | `src/components/HydraConfigForm.tsx:20` | `useState(... : "Matt, Lucas")` | Yes | Placeholder default in settings. Saving the form writes bare first names into `reportTasks.config.stakeholders`, so the ambiguity becomes persisted configuration. |
| 14 | `src/lib/tasks/priorityExplanation.test.mts:10` | `"Explicit instruction from Matt or Lucas"` | Yes | Asserted substring inside a longer raw explanation string; must change with the reason text. |

### B.1 Correction: site 3 is narrower than the brief describes

The brief states site 3 "scans source `author`, title, and body for stakeholder
names using word-boundary regex". The actual implementation
(`sourceAuthority.ts:220–233`) has two disjuncts:

- `authorHit` — word-boundary match against `source.author` **only**.
- `spokenHit` — word-boundary match against the full haystack, but only when a
  directive verb (`said|says|asked|wants?|needs?|told|please|can you|you
  should|you need`) appears within 80 characters.

Verified behavior (probe run against the real function):

| Input | Result |
|---|---|
| `author: "Lucas Thomas"` | **+160 boost** |
| `author: "Lucas Saeed"` | +160 boost |
| `author: "Lucas Vale"` (not in roster) | **+160 boost** |
| `author: "lucas.thomas@spaceinch.com"` | **+160 boost** |
| body: "Lucas Thomas said please fix the nav labels." | **+160 boost** |
| body: "Lucas asked for lighter banner elements." | **+160 boost** (which Lucas is unknowable) |
| body: "Lucas is on holiday this week." | no boost |
| body: "Matthew needs the file." | no boost |
| `author: "hydra-support-service"` | no boost |

So a bare mention with no directive verb does **not** fire. That narrows the
false-positive surface relative to the brief, but every case that matters for
the collision still fires. The finding stands; the mechanism is different.

### B.2 Site 6 is the widest matcher, and it misfires on unrelated names

`decisionEngine.ts:52` uses `author.toLowerCase().includes(name.toLowerCase())`
with no word boundary. Verified: author `"Matthew Adams"` receives the +80
stakeholder boost and the reason `"Instruction from Matt or Lucas"`, because
"matthew" contains "matt". Any author string containing the substring `matt` or
`lucas` — including `lucas.thomas@spaceinch.com` — is treated as a
high-authority stakeholder. This is a stricter defect than the Lucas collision
because it can misattribute authority to people who share no first name at all.

### B.3 Eight further sites the brief's census omits

These are in the same blast radius and must change together with the 14 above:

| File:line | What it does | Classification |
|---|---|---|
| `src/domain/hydraReport.ts:91` | `HYDRA_SOURCE_PRIORITY` contains the literal `"matt_or_lucas_instruction"` | Hardcoded |
| `src/lib/tasks/sourceAuthority.ts:405–409` | `compareSourceAuthority` uses `hasHighAuthorityStakeholderInstruction` to override date ordering | Implemented (inherits the defect) |
| `src/lib/tasks/sourceAuthority.ts:457–459` | `isIncomingSourceAuthoritative` gates task updates through `compareSourceAuthority` | Implemented (inherits the defect) |
| `src/lib/tasks/taskConfidence.ts:131` | Feeds `hasStakeholderInstruction` into the confidence model | Implemented (inherits the defect) |
| `src/lib/tasks/confidenceModel.ts:107` | `+0.1` confidence bump for a stakeholder instruction | Implemented (inherits the defect) |
| `src/lib/tasks/priorityExplanation.ts:33` | Regex `/explicit instruction from matt or lucas/i` decides which user-facing sentence is rendered | Hardcoded |
| `src/lib/llm/prompts/priorityPlanner.ts:97` | "a Matt/Lucas transcript instruction still outranks…" | Hardcoded |
| `src/lib/tasks/transcriptTaskMerge.ts:63–64` | `"lucas"` and `"matt"` in the stop-word set that blocks topic-anchor merging | Hardcoded |
| `src/lib/hydra/decisionEngine.ts:8` | `DIRECT_PATTERN` hardcodes `miloš|milos` as the "directly relevant" signal (+100) | Hardcoded |

`priorityExplanation.ts:33` matters more than it looks: it means the rendered
explanation "This is first because it was explicitly committed in a recent
meeting you attended" can be triggered by a Lucas Thomas mention, and the user
is shown a confident sentence with the ambiguous attribution stripped out.

## C. The Lucas collision

### C.1 The two roster entries

| | Lucas Saeed | Lucas Thomas |
|---|---|---|
| `figmaNodeId` | `4:171` | `19:331` |
| Title | Design Team Lead | Software Engineer |
| Depth | 2 | 3 |
| Manager | David Brubacher (CPO/COO) | Ivan Pavao Lozančić |
| Location | Buenos Aires, Argentina | Braga, Portugal |
| Escalation path | David Brubacher → Joshua Segall | Ivan Pavao Lozančić → Ivan Vučak → Joshua Segall |

The escalation paths share only the root. Lucas Saeed reports into
Product/Design under the CPO/COO; Lucas Thomas reports into Engineering under
the CTO. They are not near-misses in the hierarchy — they are different
branches.

### C.2 Both Lucases are in the same recurring meeting

This is not a theoretical collision. In the local database:

- **13 `granola` source rows list both "Lucas Saeed" and "Lucas Thomas" as
  participants.** Twelve are titled "Hydra Daily"; one is the "🖐️ All hands 🖐️"
  transcript. Source ids: 38, 43, 187, 192, 193, 194, 195, 199, 202, 223, 247,
  268, 274.
- **8 `calendar` rows carry both `lucas.saeed@spaceinch.com` and
  `lucas.thomas@spaceinch.com` in `metadata.attendees`**, all titled "Hydra
  Daily".

So the single most frequent transcript in the corpus — the daily standup for the
project the app is configured around — contains both Lucases every time. Any
line in a Hydra Daily transcript reading "Lucas said…" is genuinely ambiguous in
production data today.

### C.3 There are four Lucases in play, not two

The roster has two. The database has two more that are not in the roster at all:

| Name | Where | Rows | Resolution |
|---|---|---|---|
| Lucas Saeed | `source_items.author`, granola participants, calendar attendees, figma comment author | 22 + 1 (author), 14 (participant), 13 (attendee), 1 (figma) | roster, depth 2 |
| Lucas Thomas | granola participants, calendar attendees | 11 (participant), 8 (attendee) | roster, depth 3 |
| **Lucas Vale** | Jira `Assignee:` body line, `hydra - Submittal Manager` (source id 233) | 1 | **not in roster** |
| **Lucas Sellanes** | `work_tasks.owner` | 16 | **not in roster** |

`hasHighAuthorityStakeholderInstruction` grants the +160 boost to "Lucas Vale"
(verified in B.1). A full-name roster check would reject both non-roster names
outright, which is a second reason to prefer it over first-name matching.

### C.4 Blast radius

1. **Ranking.** A transcript where Lucas Thomas gives an instruction receives
   +160 in `sourceAuthorityScoreBoost`, which can move a task ahead of the
   user's actual highest-priority work. Because 12 of the 13 both-Lucas
   transcripts are Hydra Dailies, this is the most likely path in practice.
2. **Conflict resolution.** `compareSourceAuthority` returns "stakeholder wins"
   before it compares dates, and `isIncomingSourceAuthoritative` gates task
   updates on that comparison. A Lucas Thomas remark can therefore overwrite a
   task's `nextAction` and `doneCriteria` against a newer, better source.
3. **Confidence.** `computeSourceAuthorityConfidence` adds +0.1 for a
   stakeholder instruction, so a misattributed match makes the app *more*
   confident about a task it ranked for the wrong reason.
4. **The decision trail shown to the user.** `DecisionTrail.tsx:11` and the
   stored reason `"Explicit instruction from Matt or Lucas"` both name a first
   name. The user cannot tell which Lucas triggered the boost, and
   `priorityExplanation.ts:33` rewrites the raw signal into a confident sentence
   that drops the attribution entirely. This violates the ai-safety rule that
   evidence must be traceable, not merely asserted.
5. **The LLM cannot resolve it either.** Sites 8–11 instruct the model that
   "Matt or Lucas" are high-authority, and the prompts never carry a roster,
   full names, or roles. The model has strictly less information than the
   deterministic code.
6. **Hydra scoring is wider still.** `decisionEngine.ts:52` matches the
   substring, so `lucas.thomas@spaceinch.com` in an author field fires the +80
   boost and stores the reason `"Instruction from Matt or Lucas"`.

### C.5 Fix direction (proposed, not implemented)

Replace bare first-name matching with a full-name plus role check against the
roster (see the proposal's service-layer section). The test at
`priorityExplanation.test.mts:10` must be updated
when the reason text changes; `sourceAuthority.test.mts` also asserts
first-name behavior at lines 68–86, 109–128, and 275–285 and will need the same
treatment.

## D. Identity-resolution analysis

`src/lib/tasks/personIdentity.ts` — **Implemented**, and it behaves exactly as
its header comment claims. Two resolution paths:

1. Exact alias match, diacritic- and case-insensitive (lines 42–45). Returns
   `null` when two different people already hold the same exact alias.
2. Unambiguous first-name fallback (lines 47–54). Returns a person id only when
   exactly one existing person shares that first name; otherwise `null`.

### D.1 Current database state

| Table | Rows |
|---|---|
| `people` | **1** — `id 1, display_name "Milos Dostanic", merged_into_id NULL` |
| `person_aliases` | **2** — `(1, "Milos")`, `(1, "Milos Dostanic")` |

So the "sparse `people` table" premise is stronger than the brief assumes: there
is one person in the table, and it is the user.

### D.2 The predicted post-import regression does not occur

The brief predicts that importing 92 roster rows will make the first-name
fallback "return `null` for all 27 affected people", framed as a regression.
Measured against every distinct person string actually in the database, this is
**not** what happens. No string that resolves today stops resolving after
import; the change is a large net improvement with a bounded set of names that
remain unresolved.

`source_items.author` — 36 distinct strings:

| Bucket | Today (1 person, 2 aliases) | After importing 92 roster names |
|---|---|---|
| Resolved by exact alias | 1 | 7 |
| Resolved by unique first name | 0 | 6 |
| Unresolved — first-name collision | 0 | 5 |
| Unresolved — no match | 35 | 18 |

`work_tasks.owner` — 41 distinct strings:

| Bucket | Today | After import |
|---|---|---|
| Resolved by exact alias | 2 | 14 |
| Resolved by unique first name | 4 | 16 |
| Unresolved — first-name collision | 0 | 6 |
| Unresolved — no match | 35 | 5 |

Jira `Assignee:` body lines — 5 distinct strings: 1 resolved today, 3 after
import, 1 blocked by the `lucas` collision (`"Lucas Vale"`), 1 permanently
unresolvable (`"unknown"`).

The names blocked by a collision after import, with the colliding bucket:

| String | Bucket | Rows |
|---|---|---|
| `Lucas Saeed <lucas.saeed@spaceinch.com>` | lucas = 2 | 22 |
| `Lucas Sellanes` (`work_tasks.owner`) | lucas = 2 | 16 |
| `Lucas Saeed, Matt` / `Lucas Saeed, Milos Dostanic` / `Lucas` | lucas = 2 | 3 + 2 + 3 |
| `Lucas Vale` (Jira assignee) | lucas = 2 | 1 |
| `Ivan Pavao Lozancic <iplozancic@spaceinch.com>` | ivan = 7 | 3 |
| `Ivan at Notion <ivan@mail.notion.so>` | ivan = 7 | 1 |
| `Ivan` / `Ivan Vucak and Mateo Premuš` (`work_tasks.owner`) | ivan = 7 | 6 + 1 |
| `David Davtian <david@spaceinch.com>` | david = 2 | 3 |
| `Luka Dugi <luka.dugi@spaceinch.com>` | luka = 4 | 1 |

Note the pattern: most of these fail not because of the collision itself but
because the string is an email-wrapped display name that never gets unwrapped.
`Lucas Saeed <lucas.saeed@spaceinch.com>` contains an exact full-name match and
still falls through to the ambiguous first-name path, because
`normalizePersonName` does not strip the `<...>` wrapper. Fixing the wrapper
alone resolves 22 + 3 + 3 + 1 = 29 author rows without touching the collision
logic. That is the higher-value fix and it is independent of the roster import.

### D.3 The real regression is duplicate person creation, not `null`

`resolvePersonIdFromAliases` returning `null` is not the end of the story.
`src/services/people.ts:85` `resolveOrCreatePerson` does this:

```
const matchedId = resolvePersonIdFromAliases(trimmed, aliases);
if (matchedId != null) { ...return existing... }
const person = await createPerson(trimmed);   // <- creates a NEW person row
```

And `src/lib/tasks/extractor.ts:99–107` calls it for every extracted owner.
Therefore, after a roster import, an ambiguous string such as `"Lucas"`,
`"Ivan"`, or `"Lucas Vale"` does **not** produce a null owner — it produces a
brand-new `people` row that duplicates or shadows a roster person. The header
comment justifies this as "always additive, never a merge, so it carries no
ambiguity risk", which is true for merges but false for the resulting identity
graph: the table accumulates one row per unresolvable spelling.

This compounds into a confidence defect. `src/lib/tasks/confidenceModel.ts:66`:

```
if (signals.resolvedPersonId != null) return 1; // durable identity match (WL-10)
```

Identity confidence is 1.0 whenever *any* person id came back — including a
freshly minted row for an ambiguous first name. The app reports maximum identity
confidence precisely in the cases where identity is least certain. Classification:
**Partially implemented** — the resolver is correct, but its failure mode is
laundered into a durable id and a perfect confidence score.

### D.4 Correction: `ownerFilter.ts` does not use `resolvePersonIdFromAliases`

The brief states that `ownerFilter.ts:361` (`ownerFilterLabel`) and the filter
function "rely on `resolvePersonIdFromAliases` to match the `owner` query
parameter to a person record". This is **Not found** in the code:

- `src/lib/filters/ownerFilter.ts` has no import from `personIdentity`. The only
  two callers of `resolvePersonIdFromAliases` in the entire tree are
  `src/services/people.ts:92` and its own test file.
- `ownerFilterLabel` (lines 361–369) takes `selectedOwners`, an unused `_owners`
  array, and `myName`, and returns one of two constant strings. It performs no
  person lookup.
- `parseSelectedOwners` (lines 52–58) is deprecated and **ignores its
  `_rawOwners` argument entirely**, always returning `myOwnerFilter(myName)`.
  There is no owner query-parameter matching left to regress.

So the roster import cannot break owner filtering through that path. What
`ownerFilter` does instead is its own prefix matching in `personMatchesFilter`
(lines 25–45), and that has two independent defects, both verified by probe:

| Selected owner | Candidate | Result | Problem |
|---|---|---|---|
| `lucas saeed` | `"Lucas"` | **true** | A bare first name matches the full name by prefix, so a task owned by "Lucas" is attributed to whichever Lucas is selected. The opposite failure mode from `personIdentity` — a false positive, not a null. |
| `lucas saeed` | `"Lucas Thomas"` | false | correct |
| `milos dostanic` | `"Miloš Dostanić"` | **false** | `normalizePerson` (line 10) only trims and lowercases. It does **not** fold diacritics, unlike `normalizePersonName`. |

The second row is a live hazard for the roster work: the roster spells the user
`Miloš Dostanić`, the profile and every database row spell him `Milos Dostanic`.
The moment a roster-derived name reaches `myOwnerFilter`, owner filtering stops
matching the user's own tasks. Classification: **Partially implemented**, and the
two normalizers must be unified before any roster value flows into the filter.

## E. Project classification

Deterministic only: full-name match, email-local-part expansion, and
unique-first-name match against the roster. No LLM, no fuzzy scoring, no
invented membership.

### E.1 Source inventory

`source_items` totals 279 rows:

| Source type | Rows | With author | With `project_id` |
|---|---|---|---|
| gmail | 159 | 159 | 87 |
| jira | 60 | 45 | 24 |
| granola | 28 | 0 | 25 |
| calendar | 27 | 27 | 16 |
| figma | 4 | 2 | 4 |
| confluence | 1 | 0 | 1 |

### E.2 Audit of the brief's six signal sources

| # | Brief's claim | Verified state |
|---|---|---|
| 1 | `source_items.author` is the Jira reporter display name (`jira.ts` L123, L219); join to project via `projects.jiraKeys` matched against the key prefix in `source_items.url` | **Implemented**, but the join is ambiguous — see E.3. 45 of 60 jira rows have an author; 45 have a recoverable key prefix in `url`. |
| 2 | `Assignee: <name>` lines in the Jira body (L130–131, L227–228) | **Implemented**. 5 distinct assignee strings across 60 rows; 41 of them are `Milos Dostanic`. |
| 3 | `metadata.involvement = 'assignee'` — 24 rows; "prefer over body parse" | **Wrong premise.** `jira.ts:254` sets `involvement: "assignee"` as a *query-provenance marker* recording that the issue came from the assigned-to-me JQL. It names no person. 25 rows carry it (not 24), plus 1 row with `'mentioned'`. It cannot be preferred over the body parse because it contains no person at all. |
| 4 | Calendar attendees via `metadata.participants` on calendar rows | **Wrong key and wrong source type.** `participants` exists only on the 28 `granola` rows. Calendar rows carry `metadata.attendees` (emails) and `metadata.organizer` (email), 27 rows each. Both are usable; the brief's join is not. |
| 5 | Gmail senders/recipients via `metadata.from` and `metadata.to` | **Not found.** A full metadata-key census over all 279 rows returns no `from` or `to` key on any row. Gmail metadata keys are `threadId`, `importedFrom`, `query`, `projectMatch`, and processing markers. The sender is in `source_items.author` (159 rows), which is usable. |
| 6 | GitHub logins joined via `projects.githubRepos` | **Not found in data.** Zero `github` source rows exist, and all 13 projects have an empty `github_repositories` array. |

### E.3 The `projects.jiraKeys` join is not deterministic

Nine of the thirteen configured Jira keys are claimed by **two** projects each,
because project 18 ("Hydra") is an umbrella that lists all of them:

| Key | Claimed by |
|---|---|
| ASCSI | 6 `hydra - Main`, 18 `Hydra` |
| BOM | 8 `hydra - BOM`, 18 `Hydra` |
| CON | 9 `hydra - Content`, 18 `Hydra` |
| DATHUB | 10 `hydra - Data Hub`, 18 `Hydra` |
| HF | 11 `hydra - Funnel`, 18 `Hydra` |
| HS | 12 `hydra - Spec`, 18 `Hydra` |
| SEIS | 15 `hydra - SeisBrace`, 18 `Hydra` |
| SUBMGR | 16 `hydra - Submittal Manager`, 18 `Hydra` |
| UATL | 17 `hydra - Umbrella App`, 18 `Hydra` |

Only `AT`, `LWD`, `RUX` (projects 7, 13, 14) are unique. The effect is visible
in the data: five `UATL` rows exist, and `source_items.project_id` splits them
between project 18 and project 17. The same key therefore produces two different
project answers depending on which row you read.

This audit resolves projects as follows, and never guesses: use
`source_items.project_id` when set; otherwise use `projects.jiraKeys` only when
exactly one project claims the key; otherwise emit the row as Unresolved.

Additional gap: 21 jira rows have a recoverable key prefix but a NULL
`project_id`. All 21 belong to `LWD`, `RUX`, and `AT` — projects whose `status`
is `inactive`. The key-prefix fallback recovers them; the persisted
`project_id` never got set for them.

### E.4 Membership rows

408 raw evidence observations collapse to 104 (person × project × role) rows,
after which 43 rows whose only evidence is a company-wide meeting are separated
out (E.5). The remaining **61 rows cover 15 roster people plus 2 externals**.
`x N` is the number of independent evidence observations; the id, date, and quote
are from the most recent one.

| name | project | jira_key | role | evidence_source_id | evidence_date | resolved_via | x |
|---|---|---|---|---|---|---|---|
| Brandon Scott | Hydra | — | email_sender | 143 | 2026-03-23 | full_name | 6 |
| Connor McLaren | Hydra | — | email_sender | 123 | 2026-04-13 | full_name | 1 |
| Daniel Breda | Hydra | — | meeting_participant | 268 | 2026-07-24 | unique_first_name | 11 |
| Ivan Pavao Lozančić | Hydra | — | email_sender | 11 | 2026-06-15 | full_name | 2 |
| Ivan Pavao Lozančić | Hydra | — | meeting_participant | 268 | 2026-07-24 | full_name | 11 |
| Joao Pedro Vieira Leao | Hydra | — | meeting_participant | 268 | 2026-07-24 | unique_first_name | 11 |
| Jurica Ćapin | Hydra | — | meeting_participant | 268 | 2026-07-24 | unique_first_name | 11 |
| Lisa Amelina | Hydra | — | meeting_participant | 260 | 2026-07-24 | unique_first_name | 1 |
| Lucas Saeed | Hydra | — | email_sender | 262 | 2026-07-23 | full_name | 14 |
| Lucas Saeed | Hydra | — | figma_commenter | 275 | 2026-07-27 | full_name | 1 |
| Lucas Saeed | Hydra | — | meeting_attendee | 266 | 2026-07-24 | email_local_part | 10 |
| Lucas Saeed | Hydra | — | meeting_participant | 260 | 2026-07-24 | full_name | 14 |
| **Lucas Thomas** | Hydra | — | meeting_attendee | 266 | 2026-07-24 | email_local_part | 7 |
| **Lucas Thomas** | Hydra | — | meeting_participant | 268 | 2026-07-24 | full_name | 11 |
| Matt Pettit | Hydra | — | email_sender | 86 | 2026-06-05 | full_name | 6 |
| Matt Pettit | Hydra | — | meeting_participant | 268 | 2026-07-24 | full_name | 12 |
| Matt Pettit | Hydra | UATL | reporter | 250 | 2026-07-27 | full_name | 1 |
| Miloš Dostanić | Hydra | UATL | assignee | 250 | 2026-07-27 | full_name | 1 |
| Miloš Dostanić | Hydra | — | email_sender | 54 | 2026-06-12 | email_local_part | 39 |
| Miloš Dostanić | Hydra | — | figma_commenter | 276 | 2026-07-27 | full_name | 1 |
| Miloš Dostanić | Hydra | — | meeting_organizer | 259 | 2026-07-23 | email_local_part | 6 |
| Miloš Dostanić | Hydra | — | meeting_participant | 260 | 2026-07-24 | full_name | 22 |
| Nenad Veljković | Hydra | — | email_sender | 144 | 2026-03-23 | full_name | 2 |
| Nenad Veljković | Hydra | — | meeting_participant | 260 | 2026-07-24 | full_name | 1 |
| Sebastian Zamora | Hydra | — | meeting_participant | 260 | 2026-07-24 | full_name | 1 |
| Sofija Zec-Baškarad | Hydra | — | meeting_participant | 268 | 2026-07-24 | unique_first_name | 11 |
| Ivan Pavao Lozančić | hydra - BOM | — | email_sender | 6 | 2026-06-23 | full_name | 1 |
| Joao Pedro Vieira Leao | hydra - BOM | BOM | reporter | 269 | 2026-07-27 | full_name | 1 |
| Matt Pettit | hydra - BOM | — | email_sender | 92 | 2026-05-27 | full_name | 2 |
| Matt Pettit | hydra - BOM | BOM | reporter | 207 | 2026-06-24 | full_name | 8 |
| Miloš Dostanić | hydra - BOM | BOM | assignee | 269 | 2026-07-27 | full_name | 12 |
| Miloš Dostanić | hydra - BOM | BOM | reporter | 211 | 2026-06-23 | full_name | 3 |
| Daniel Breda | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | unique_first_name | 1 |
| Ivan Pavao Lozančić | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | full_name | 1 |
| Ivan Pavao Lozančić | hydra - Content | CON | reporter | 203 | 2026-07-21 | full_name | 1 |
| Joao Pedro Vieira Leao | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | unique_first_name | 1 |
| Jurica Ćapin | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | unique_first_name | 1 |
| Lucas Saeed | hydra - Content | — | meeting_attendee | 279 | 2026-07-24 | email_local_part | 1 |
| Lucas Saeed | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | full_name | 1 |
| **Lucas Thomas** | hydra - Content | — | meeting_attendee | 279 | 2026-07-24 | email_local_part | 1 |
| **Lucas Thomas** | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | full_name | 1 |
| Matt Pettit | hydra - Content | CON | assignee | 224 | 2026-07-16 | full_name | 1 |
| Matt Pettit | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | full_name | 1 |
| Matt Pettit | hydra - Content | CON | reporter | 15 | 2026-07-09 | full_name | 3 |
| Miloš Dostanić | hydra - Content | CON | assignee | 15 | 2026-07-09 | full_name | 2 |
| Miloš Dostanić | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | full_name | 1 |
| Sofija Zec-Baškarad | hydra - Content | CON | assignee | 232 | 2026-04-17 | full_name | 1 |
| Sofija Zec-Baškarad | hydra - Content | — | meeting_participant | 274 | 2026-07-28 | unique_first_name | 1 |
| Matt Pettit | hydra - Submittal Manager | SUBMGR | reporter | 219 | 2026-04-21 | full_name | 2 |
| Miloš Dostanić | hydra - Submittal Manager | SUBMGR | assignee | 219 | 2026-04-21 | full_name | 1 |
| Matt Pettit | hydra - Umbrella App | UATL | reporter | 206 | 2026-07-21 | full_name | 4 |
| Miloš Dostanić | hydra - Umbrella App | UATL | assignee | 206 | 2026-07-21 | full_name | 4 |
| Brandon Scott | Loki - Wex Experience Design | LWD | reporter | 18 | 2026-03-04 | full_name | 2 |
| **Erin Rose** (external) | Loki - Wex Experience Design | LWD | reporter | 19 | 2026-03-03 | external allowlist | 1 |
| Miloš Dostanić | Loki - Wex Experience Design | LWD | assignee | 18 | 2026-03-04 | full_name | 3 |
| **Brian Dailey** (external) | on-atlas | AT | reporter | 34 | 2024-07-31 | external allowlist | 4 |
| Miloš Dostanić | on-atlas | AT | assignee | 34 | 2024-07-31 | full_name | 4 |
| Brandon Scott | rwanda-design | RUX | reporter | 21 | 2026-01-19 | full_name | 8 |
| Connor McLaren | rwanda-design | RUX | reporter | 22 | 2026-01-19 | email_local_part | 4 |
| Miloš Dostanić | rwanda-design | RUX | assignee | 21 | 2026-01-19 | full_name | 14 |
| Nadim Yazdani | rwanda-design | RUX | reporter | 30 | 2025-05-04 | full_name | 2 |

A `jira_key` of `—` means the evidence is not a Jira row; no key is fabricated
from `projects.jiraKeys[0]`.

Note the row this audit is fundamentally about: **Lucas Thomas has genuine,
evidence-backed membership in the same two projects as Lucas Saeed.** He is not
a stranger who occasionally appears. Any heuristic that tries to disambiguate
"Lucas" by project context will also fail.

### E.5 Company-wide meetings inflate membership and must be excluded

Three `granola` transcripts are company- or department-wide and are nevertheless
attached to project 18 ("Hydra") or to no project:

| Source id | Title | Participants | `project_id` |
|---|---|---|---|
| 189 | Daily: Projects 👀 | 51 | 18 (`Hydra`) |
| 40 | Daily: Code Review 🐱‍💻 | 50 | 18 (`Hydra`) |
| 193 | 🖐️ All hands 🖐️ | 84 | NULL |
| 197 | Daily - All together now | 51 | NULL |

Attendance at an all-hands is not project membership. **43 roster people would
gain a "Hydra" membership row from this signal alone**: Alen Štruklec, Ante
Radić, Anton Lovrić, Antonio Vogrin, Borna Raić, Filip Gadžo, Goran Malić, Ivan
Augustinović, Ivan Dumančić, Ivan Lacković, Ivan Lozić, Ivan Tamarut, Ivan
Vučak, Jakob Yousri, Jakov Ćurić, Jelena Šverko, Josip Pavlović, Karlo
Mijaljević, Karlo Siladi, Katarina Milanović-Litre, Krešimir Ćosić, Kristijan
Kotris, Leo Govorko, Luka Dugi, Luka Pancirov, Luka Vilagoš, Marijo Kiš, Marin
Glavaš, Mario Tupek, Marko Barić, Matea Korbar, Matej Luburić, Mateo Mataja,
Mateo Premuš, Mihaela Kenđel, Mirko Bojčić, Renato-Zaneto Lukež, Robert Dokša,
Sandi Zeher, Šime Andrijašević, Tomislav Vrbošić, Vinko Ivanković, Zlatko
Vlašić.

They are recorded here under the distinct role `broadcast_meeting_attendee` and
must not be treated as project membership. Any implementation needs a
participant-count or title-based threshold before writing membership from a
transcript.

### E.6 Coverage

| Population | Count |
|---|---|
| Roster people with real project evidence | **15** of 92 |
| Roster people whose only evidence is a company-wide meeting | 43 |
| Roster people with no project signal at all | **34** |
| Non-roster people with project evidence (external) | 2 (Erin Rose, Brian Dailey) |

The 34 with no signal include the entire top of the company — Joshua Segall
(d0), David Brubacher (d1), Ashley Frericks (d1), Mitchell Maddox (d1) — plus
Pedro Thomé, Michael Ballard, Jason Ary, Matan Barnea, Neven Mendrila, Goran
Nikšić, Maria Jimena Ormeno Salinas, Tania Montoya, Tassio Jordao Silva, Paulo
Radicchi, David Davtian, Halley Lisieski, Kristian Radoš, Gabriel de Castro
Michelassi, Leonardo Balsalobre, Fabio Rachid, Ante Ristovski, Alex Diaz, Marian
Jones, Andrea Fresa, Piero Desenzi, Luciano Santos, Renato De Matos, Luka
Renjić, Neven Vučinić, Michel Carlos, Alex Junior Valerio Moreira, Vedran Lebo,
Felipe Leal Luppo, Ugo Castro.

Conclusion: the local corpus is a single person's work corpus. It can support
membership claims for roughly a sixth of the company and no more. A
`project_membership` table populated from it would be sparse by nature, which is
correct behavior — but it means membership must never be assumed absent, only
reported as unknown.

### E.7 Unresolved

400 raw observations could not be joined; they collapse to 161 distinct
(string, reason, signal) rows.

| Reason | Raw observations |
|---|---|
| `no_project_signal` — `project_id` NULL and no Jira key in `url` | 311 |
| `person_not_in_roster` | 81 |
| `person_ambiguous` — 2+ roster candidates share the first name | 8 |

Ambiguous persons, in full:

| String | Signal | Candidates |
|---|---|---|
| `Lucas Vale` | Jira `Assignee:` line (source 233) | Lucas Saeed, Lucas Thomas |
| `Goran` | granola participants | Goran Nikšić, Goran Malić |
| `Neven` | granola participants | Neven Mendrila, Neven Vučinić |
| `Ante` | granola participants | Ante Ristovski, Ante Radić |
| `Ivan Sakic` | granola participants | 7 Ivans — and `Ivan Sakic` is not in the roster at all, so the first-name path produced 7 wrong candidates for a person who does not exist in the org chart |

People-shaped strings that are not in the roster:

| String | Signal | Note |
|---|---|---|
| `Bru` | granola participants | Nickname for David Brubacher; also `bru@spaceinch.com` in calendar attendees |
| `Jimena` | granola participants | Maria Jimena Ormeno Salinas — her *first* name is Maria, so no first-name path exists |
| `Hlisieski` / `hlisieski@apollo-advisors.com` | granola participants, calendar attendees | Halley Lisieski, external domain |
| `Ivan Sakic` | granola participants | Not in the roster |
| `Lucas Sellanes` | `work_tasks.owner` (16 rows) | Not in the roster |
| `Lucas Vale` | Jira assignee | Not in the roster |
| `Erin Rose` | Jira reporter (1), `work_tasks.owner` (30) | **External** — classified as external, no roster entry invented |
| `Brian Dailey` | Jira reporter (4), `projects.people` on project 7 | **External** — classified as external |
| `Loza`, `Wolf`, `Say`, `design team` | `work_tasks.owner` | Nicknames and non-person strings; not resolvable and must not be guessed |
| `SICS-all-employees`, `SICS-balkan-team` | calendar attendees | Distribution lists, not people |
| `Gemini <gemini-notes@google.com>`, `hydra-support-service`, `Granola`, `Medium Daily Digest`, `Maven`, `Cursor Team`, `Coda`, `Claude Team`, `Ivan at Notion` | `source_items.author` | Bots and newsletters. `Gemini` alone is the single most frequent author in the corpus at 42 rows. |

Single-token company emails that cannot be resolved deterministically:
`matt@spaceinch.com` (9 calendar rows + 10 author rows), `david@spaceinch.com`,
`daniel@spaceinch.com`, `joao@spaceinch.com`, `jurica@spaceinch.com`,
`sofija@spaceinch.com`, `kristijan@spaceinch.com`, `iplozancic@spaceinch.com`,
`goran@spaceinch.com`, `karlo@spaceinch.com`, `neven@spaceinch.com`,
`mateo@spaceinch.com`, `ivan@spaceinch.com`, `sebastianz@spaceinch.com`,
`marcio@spaceinch.com`, `gabriel.marson@spaceinch.com`,
`renato.dematos@spaceinch.com`. Six of these (`david`, `goran`, `ivan`, `karlo`,
`mateo`, `neven`) are ambiguous by first name; the rest have no roster match
because the local part is an abbreviation, a surname-first form, or a person not
in the org chart.

The important asymmetry: **`lucas.saeed@spaceinch.com` and
`lucas.thomas@spaceinch.com` both resolve exactly**, because their local parts
are `first.last`. Email is the one signal already in the data that disambiguates
the two Lucases without any inference. It appears on all 27 calendar rows and it
is currently unused by every stakeholder check.

### E.8 Correction: `Mitchell Maddox` cannot be matched by full name

Because anomaly 2 in the rules doc stores the raw text `"Mitchell Maddox Austin,
TX"` as `name`, the author string `Mitchell Maddox <mitch@spaceinch.com>` has no
exact roster match and resolves only through the unique-first-name path. Any
full-name-only matcher will fail on him. His record needs `name: "Mitchell
Maddox"`, `location: "Austin, TX"` before a full-name rule is enforced.

## F. Escalation semantics

`escalationPath(person)` is **Not found** — no such function exists in the
repository. The rule it must implement, per
`docs/org/hierarchy-decoding-rules.md`: walk `managerName` one level at a time,
never skip a level, stop at the root (Joshua Segall, depth 0, `managerName:
null`).

Both required paths were computed from the committed roster and match exactly:

```
Miloš Dostanić  ->  Lucas Saeed  ->  David Brubacher  ->  Joshua Segall
Matt Pettit     ->  David Brubacher  ->  Joshua Segall
```

For contrast, the same walk on the other Lucas:

```
Lucas Thomas    ->  Ivan Pavao Lozančić  ->  Ivan Vučak  ->  Joshua Segall
```

Three levels, entirely inside Engineering, never touching David Brubacher. Two
observations follow. First, an escalation implementation is inherently safe from
the collision because it operates on a resolved roster entry, not a name string;
the collision risk is entirely in the resolution step that precedes it. Second,
one intermediate hop is currently unreadable: `Connor McLaren -> Mitchell Maddox
Austin, TX -> Joshua Segall` would render a malformed name in any user-facing
escalation sentence (see E.8).

### What "escalate to stakeholder" must mean in practice

When the app needs to attribute high authority to a decision, the check is not
"does the text contain Lucas". It is:

1. Resolve the author string to exactly one roster entry, using — in order —
   email local part (`first.last@`), exact full name after diacritic folding,
   and known alias. **Stop and return unresolved on a bare first name that
   collides.** Never fall through to a first-name guess for an authority
   decision.
2. Confirm the resolved entry is `Lucas Saeed` (`figmaNodeId 4:171`), not any
   Lucas: depth 2, title "Design Team Lead", manager David Brubacher.
3. Store the resolved full name and the roster node id in the decision trail, so
   the rendered reason reads "Explicit instruction from Lucas Saeed (Design Team
   Lead)" rather than "from Matt or Lucas".

Point 1 is the whole fix. Points 2 and 3 are what make it auditable.

## Findings summary

Ordered by how much damage each one does today.

| # | Finding | Classification | Where |
|---|---|---|---|
| 1 | `decisionEngine.ts:52` substring match grants stakeholder authority to any author containing "matt" or "lucas", including `Matthew Adams` and `lucas.thomas@spaceinch.com` | Hardcoded, defective | B.2 |
| 2 | Both Lucases attend the same daily standup in 13 stored transcripts; "Lucas said…" is ambiguous in production data | Hardcoded, defective | C.2 |
| 3 | `resolveOrCreatePerson` creates a duplicate `people` row on ambiguity, and `confidenceModel.ts:66` then reports identity confidence 1.0 for it | Partially implemented | D.3 |
| 4 | `ownerFilter.normalizePerson` does not fold diacritics, so a roster-spelled `Miloš Dostanić` stops matching the user's own tasks | Partially implemented | D.4 |
| 5 | `normalizePersonName` does not strip `Name <email>` wrappers, costing 29 author rows that contain an exact full-name match | Partially implemented | D.2 |
| 6 | 9 of 13 Jira keys are claimed by two projects, so the `projects.jiraKeys` join is non-deterministic | Partially implemented | E.3 |
| 7 | Company-wide meetings attached to project 18 would fabricate "Hydra" membership for 43 people | Partially implemented | E.5 |
| 8 | `metadata.involvement` is a query-provenance marker, not a per-person role | Documentation defect in the brief | E.2 |
| 9 | `metadata.from` / `metadata.to` do not exist on any row; Gmail sender lives in `source_items.author` | Not found | E.2 |
| 10 | `escalationPath` does not exist | Not found | F |
| 11 | Two non-roster Lucases (`Lucas Vale`, `Lucas Sellanes`) and two externals (`Erin Rose`, `Brian Dailey`) carry real evidence | Unknown / external | C.3, E.7 |
| 12 | Rules-doc errors: nonexistent "Ivan Jurić"; Lucas Thomas depth stated as 4, actually 3; `Mitchell Maddox Austin, TX` name still unparsed | Documentation defect | A.1, A.2, E.8 |
| 13 | `ownerFilter.ts` does **not** call `resolvePersonIdFromAliases`; `parseSelectedOwners` ignores its argument entirely | Not found (brief premise incorrect) | D.4 |

---

## Proposed implementation (not yet implemented)

Everything below is design only. No schema, service, or migration work was
performed during this audit.

### 1. Schema

The brief's proposed tables are sound. Four amendments follow from the findings.

```sql
-- org_roster: one row per person from si-org-chart.json
CREATE TABLE org_roster (
  id              SERIAL PRIMARY KEY,
  figma_node_id   TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,          -- normalizePersonName(name)
  first_name      TEXT NOT NULL,          -- amendment (a)
  title           TEXT NOT NULL DEFAULT '',
  location        TEXT NOT NULL DEFAULT '',
  manager_id      INTEGER REFERENCES org_roster(id),
  depth           INTEGER NOT NULL DEFAULT 0,
  is_authority    BOOLEAN NOT NULL DEFAULT FALSE,   -- amendment (b)
  extracted_at    TIMESTAMPTZ NOT NULL,
  source_version  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX org_roster_normalized_name_idx ON org_roster (normalized_name);
CREATE INDEX org_roster_first_name_idx ON org_roster (first_name);

-- org_roster_alias: additional name forms
CREATE TABLE org_roster_alias (
  id         SERIAL PRIMARY KEY,
  roster_id  INTEGER NOT NULL REFERENCES org_roster(id),
  alias      TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL,   -- 'email' | 'username' | 'display_name' | 'nickname'
  is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,   -- amendment (c)
  UNIQUE (normalized_alias, alias_type, roster_id)
);

-- project_membership: evidence-backed project affiliation
CREATE TABLE project_membership (
  id           SERIAL PRIMARY KEY,
  roster_id    INTEGER REFERENCES org_roster(id),   -- null for externals
  person_name  TEXT NOT NULL,                       -- raw name as found
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  role         TEXT NOT NULL DEFAULT 'contributor',
  resolved_via TEXT NOT NULL,     -- amendment (d): 'email' | 'full_name' | 'alias' | 'unique_first_name' | 'legacy_people_array' | 'external_allowlist'
  evidence_source_id INTEGER REFERENCES source_items(id),
  evidence_date TIMESTAMPTZ,
  evidence_quote TEXT,
  is_external  BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (roster_id IS NOT NULL OR is_external)
);
CREATE INDEX project_membership_project_idx ON project_membership (project_id);
```

**(a) `first_name`, precomputed and indexed.** Every collision check needs it,
and computing it per query with `split_part(normalized_name,' ',1)` prevents
index use.

**(b) `is_authority`, not a `depth <= 2` predicate.** Section A.3 shows depth 2
admits 23 people including three ICs recorded as `ic_with_reports` anomalies and
one assistant. Authority is a curated flag on the roster row, set by the
extractor or an administrator, not derived from depth alone. Depth stays as data.

**(c) `is_ambiguous` on the alias.** When two roster rows would receive the same
normalized alias (`lucas`, `ivan`, `david@spaceinch.com`), mark both and let the
resolver reject in one indexed lookup rather than counting rows at query time.
This also makes the ambiguity visible in the database instead of implicit in
resolver code.

**(d) `resolved_via` on the membership row.** Section E.4 shows the same person
resolving through four different mechanisms with materially different
trustworthiness. A membership row asserting "Daniel Breda is on Hydra" via
`unique_first_name` is weaker than one via `email`, and the row must say so.

Additionally: `role` must include `'broadcast_meeting_attendee'` (E.5) so
all-hands attendance is representable without being mistaken for membership.

### 2. Service layer

```ts
resolvePersonFromRoster(
  raw: string,
  roster: OrgRosterRow[],
  aliases: OrgRosterAliasRow[]
): { rosterId: number; via: ResolvedVia } | { ambiguous: string[] } | null
```

Resolution order, stopping at the first hit:

1. **Email local part** — `first.last@domain` folded to `first last`. This is the
   only signal in the corpus that separates the two Lucases (E.7), so it must
   run first, not last.
2. **Display-name unwrap, then exact full name** — strip `Name <email>` and
   `(via Google Docs)` before normalizing. Recovers 29 author rows on its own
   (D.2).
3. **Registered alias** where `is_ambiguous = false`.
4. **Unique first name** — permitted for membership and filtering, and returned
   with `via: 'unique_first_name'` so callers can weigh it.

Returns `{ ambiguous: [...] }` on a colliding first name and `null` on no match.
It never falls through to a first-name guess, and it never creates a row.

```ts
isHighAuthorityStakeholder(authorRaw: string, roster, aliases): AuthorityResult
```

Returns authority **only** when `resolvePersonFromRoster` produced a single
roster row with `is_authority = true`, and returns the resolved full name, title,
and `figma_node_id` alongside the boolean so the decision trail can cite them.
An `{ ambiguous }` result must return "no authority" and record the ambiguity —
per the ai-safety ambiguity rule, an unresolvable "Lucas" belongs in Unclear, not
in a confident boost.

```ts
escalationPath(rosterId: number, roster: OrgRosterRow[]): OrgRosterRow[]
```

Walks `manager_id` one level at a time, returns rows (not name strings, so
callers cannot re-introduce string matching), stops at `manager_id IS NULL`, and
guards against a cycle with a visited set.

Three prerequisite fixes, each independently shippable and each fixing a live
defect rather than enabling new work:

1. Unify the two normalizers. `ownerFilter.normalizePerson` must fold diacritics
   like `normalizePersonName`, or be replaced by it (D.4).
2. Replace the substring match at `decisionEngine.ts:52` with the same resolver
   (B.2).
3. Change `confidenceModel.ts:66` so identity confidence 1.0 requires a
   *resolved* roster match, not merely a non-null person id (D.3). A person id
   minted from an unresolvable string should score at or below the current 0.6
   "guessed" tier.

### 3. Migration path for the legacy `projects.people` arrays

Four projects have populated arrays; all eight entries were resolved for this
audit:

| Project | `people` | Resolution |
|---|---|---|
| 7 `on-atlas` | `Milos Dostanic`, `Brian Dailey` | roster (Miloš Dostanić); **external** |
| 13 `Loki - Wex Experience Design` | `Milos Dostanic`, `Brandon Scott` | roster; roster |
| 14 `rwanda-design` | `Milos Dostanic`, `Brandon Scott` | roster; roster |
| 18 `Hydra` | `Milos Dostanic`, `Matt Pettit` | roster; roster |

Correction to the brief: **`Erin Rose` is not in any `projects.people` array.**
She appears as a Jira reporter on source 19 (`LWD`) and as `work_tasks.owner` on
30 task rows. She still needs an external classification, but not as part of this
migration.

Steps:

1. Resolve each of the 8 names with `resolvePersonFromRoster`. All 8 resolve
   today; no ambiguity blocks the migration.
2. Insert `project_membership` rows with `role = 'legacy_people_array'`,
   `resolved_via = 'legacy_people_array'`, and `evidence_source_id = NULL` —
   these arrays are user-entered configuration, not source evidence, and must
   not be given a fabricated evidence citation.
3. Set `is_external = true` and `roster_id = NULL` for `Brian Dailey`.
4. Clear `projects.people` only after step 2 is verified, and keep the column
   nullable for one release so the migration is reversible.

### 4. Test list

Regression tests, ordered by the defect each one pins:

1. **Lucas Thomas must not receive stakeholder authority.** Build a transcript
   authored by `"Lucas Thomas"`, run `sourceAuthorityScoreBoost`, assert the
   +160 boost and the stakeholder note are absent.
2. **Lucas Saeed does receive authority.** Same input with `"Lucas Saeed"`,
   assert +160 present and the note names the full name and title.
3. **Bare `"Lucas"` is ambiguous, not authoritative.** Assert
   `resolvePersonFromRoster("Lucas", ...)` returns `{ ambiguous: ["Lucas Saeed",
   "Lucas Thomas"] }` and that `isHighAuthorityStakeholder` returns no authority
   for it.
4. **Email disambiguates.** Assert `lucas.saeed@spaceinch.com` resolves to Lucas
   Saeed with authority and `lucas.thomas@spaceinch.com` resolves to Lucas
   Thomas without it.
5. **Non-roster Lucases are rejected.** `"Lucas Vale"` and `"Lucas Sellanes"`
   must return `null` or `ambiguous`, never authority. (Today both receive +160 —
   see B.1.)
6. **Substring matching is gone.** Author `"Matthew Adams"` must receive no
   stakeholder boost from the Hydra decision engine. This test fails against
   current `main`.
7. **Display-name wrappers are unwrapped.** `Lucas Saeed
   <lucas.saeed@spaceinch.com>` and `"Matt Pettit (via Google Docs)"
   <drive-shares-dm-noreply@google.com>` must both resolve.
8. **Diacritics fold in owner filtering.** `personMatchesFilter("Miloš
   Dostanić", myOwnerFilter("Milos Dostanic"), "Milos Dostanic")` must be true.
   This test fails against current `main`.
9. **Ambiguity does not mint a person.** After a roster import, calling the
   owner-resolution path with `"Ivan"` must not insert a new `people` row, and
   identity confidence for that task must not be 1.0.
10. **Escalation is one level at a time.** `escalationPath("Miloš Dostanić")`
    returns `["Lucas Saeed", "David Brubacher", "Joshua Segall"]`;
    `escalationPath("Lucas Thomas")` returns `["Ivan Pavao Lozančić", "Ivan
    Vučak", "Joshua Segall"]`.
11. **Ambiguous Jira keys do not produce a membership row.** A `UATL` source with
    `project_id` NULL must land in Unresolved, not be assigned to project 17 or
    18 arbitrarily.
12. **Company-wide meetings do not create membership.** A transcript with 50+
    participants must produce `broadcast_meeting_attendee` rows only.
13. **`priorityExplanation.test.mts:10`** — update the asserted raw string when
    the reason text changes from "Explicit instruction from Matt or Lucas" to the
    full-name form. `sourceAuthority.test.mts` lines 68–86, 109–128, and 275–285
    assert the same first-name behavior and need the same update.

### 5. Suggested sequencing

The three prerequisite fixes in section 2 are independent of the roster import
and each resolves a defect that is live today. Doing them first means the roster
import lands on a resolver that is already correct, rather than importing 92 rows
into a resolver that would mint duplicates from them.

1. Fix the substring matcher, the diacritic normalizer, and the confidence-1.0
   shortcut. No schema change; tests 6, 8, 9 turn green.
2. Add display-name unwrapping to resolution. No schema change; test 7 turns
   green and 29 author rows begin resolving.
3. Correct `si-org-chart.json` (Mitchell Maddox's name/location split) and the
   two rules-doc errors, then re-run `scripts/extractOrgChart.mts`.
4. Land `org_roster` / `org_roster_alias` and the resolver, with the ambiguity
   contract tested before any caller uses it.
5. Replace the 14 hardcoded sites plus the 8 in B.3 with resolver calls, in one
   change, so no code path is left comparing name strings.
6. Land `project_membership` and the legacy array migration last, once
   resolution is trustworthy.

## Constraints observed

- **Read-only against all external systems.** No writes to Figma, Jira,
  Confluence, GitHub, or the database. Every SQL statement executed was a
  `SELECT`; both audit scripts are SELECT-only and end their connection without
  a transaction.
- **No LLM in identity matching or hierarchy construction.** All matching above
  is deterministic string comparison over `normalizePersonName` semantics, plus
  email local-part expansion. No model was consulted for any resolution,
  membership, or hierarchy claim.
- **Every claim cites a `file:symbol` or a data query.** Behavioral claims in
  sections B.1, B.2, and D.4 were produced by executing the real functions
  against the strings quoted, not by reading the regexes.
- **Nothing was implemented.** The proposal section is design only. The only
  files added are
  the two SELECT-only audit scripts named under Reproduction.

---

## Decisions taken (2026-07-28) and implementation delivered

The five live defects identified by this audit were fixed in a single
implementation pass following the audit. Decisions made per the project owner
and the resulting code changes are recorded here for traceability.

### D1 — Scope

**Decision:** Defects only. No `org_roster`/`org_roster_alias` schema,
no `project_membership`, no migration of `projects.people`.

### D2 — Authority allowlist format

**Decision:** Explicit full-name allowlist with declared aliases.
`DEFAULT_HYDRA_CONFIG.stakeholders` now stores `["Matt Pettit", "Lucas Saeed"]`.
`src/lib/tasks/highAuthorityPeople.ts` declares the canonical table.
Bare `"Matt"` and `"Lucas"` configs resolve to the correct full name via
`resolveStakeholder`, so no data migration is needed for existing saved configs.

### D3 — Ambiguity: bare "Lucas" in a transcript

**Decision:** `"Lucas"` means Lucas Saeed (Design Team Lead), always.
The `highAuthorityPeople.ts` alias table declares this explicitly. The
word-boundary matcher prevents "Lucas Thomas" (Software Engineer) from
receiving the stakeholder boost through the `authorField: true` flag on author
fields and the capitalised-next-word guard in sentence mode.

### D4 — Unknown people (Erin Rose, Lucas Sellanes, Lucas Vale, Brian Dailey)

**Decision:** Erin Rose and Lucas Sellanes are former SpaceInch employees, no
longer active. They own 30 and 16 work tasks respectively. These tasks are
classified as "other" (not the user's) and stay off the brief — no action
required. Lucas Vale (1 Jira assignee) and Brian Dailey (4 Jira reports) are
treated as external collaborators.

**Deferred follow-up:** The 46 tasks owned by former employees should
eventually be reassigned, archived, or closed. This requires a notion of
"departed person" in the schema that is out of scope here.

### D5 — Jira-key umbrella/specific conflict

**Decision:** Most specific project wins (fewest `jiraKeys`, tiebreaker by
lowest `id`). The "Hydra" umbrella project stops claiming child boards'
dedicated keys for resolution purposes.
Implementation: `src/lib/projects/projectForJiraKey.ts`.

### D6 — Roster extractor: Mitchell Maddox corrupted record

**Decision:** Fix the extractor's title/location parser (two-word name
heuristic for cards with no recognised title), then re-extract.
Re-extraction was run on 2026-07-28; the record now reads
`name: "Mitchell Maddox"`, `location: "Austin, TX"`, `title: ""`.
Connor McLaren's manager field now renders correctly.

### Files changed by the implementation

| File | Change |
|---|---|
| `src/lib/tasks/highAuthorityPeople.ts` | New — declared authority table and matchers |
| `src/domain/hydraReport.ts` | `stakeholders` default → full names |
| `src/lib/tasks/sourceAuthority.ts` | `hasHighAuthorityStakeholderInstruction` uses new module |
| `src/lib/hydra/decisionEngine.ts` | Substring match replaced; reason string uses full names |
| `src/lib/hydra/orchestrator.ts` | Fallback uses `DEFAULT_HYDRA_CONFIG.stakeholders` |
| `src/components/DecisionTrail.tsx` | Copy updated to full names |
| `src/components/HydraConfigForm.tsx` | Placeholder updated to full names |
| `src/lib/llm/prompts/{4 files}` | "Matt or Lucas" replaced with full names and roles |
| `src/lib/tasks/personIdentity.ts` | Added `extractDisplayName` helper |
| `src/lib/filters/ownerFilter.ts` | `normalizePerson` delegates to `normalizePersonName`; `NON_PERSON_ACTORS` exported |
| `src/lib/tasks/extractor.ts` | `resolvePersonIdForOwner` returns `verified` flag; skips non-person strings |
| `src/lib/tasks/taskConfidence.ts` | Added `resolvedPersonVerified` to input |
| `src/lib/tasks/confidenceModel.ts` | `computeIdentityConfidence` requires `resolvedPersonVerified: true` for score 1.0 |
| `src/lib/projects/projectForJiraKey.ts` | New — most-specific-project resolver |
| `src/lib/projects/jiraSync.ts` | Uses `projectForJiraKey` |
| `src/lib/imports/jiraDoneNotifications.ts` | Uses `projectForJiraKey` |
| `src/services/hydra.ts` | UATL lookup uses `projectForJiraKey` |
| `src/services/projects.ts` | `isSourceFromInactiveProject` uses `projectStatusForJiraKey`; `getProjects()` ordered by id |
| `scripts/extractOrgChart.mts` | Two-word name fallback for cards with no recognised title |
| `docs/org/si-org-chart.json` | Re-extracted: Mitchell Maddox record corrected |
| `docs/org/hierarchy-decoding-rules.md` | Added fix note, `depth <= 2` warning, Lucas collision resolution |

### Tests added / updated

| Test file | Change |
|---|---|
| `src/lib/tasks/highAuthorityPeople.test.mts` | New — 17 cases |
| `src/lib/tasks/sourceAuthority.test.mts` | Extended with Matthew Adams / Lucas Thomas false-positive tests |
| `src/lib/filters/ownerFilter.test.mts` | Extended with diacritic-folding and `extractDisplayName` tests |
| `src/lib/tasks/confidenceModel.test.mts` | Updated: `resolvedPersonVerified: true` required for 1.0 |
| `src/lib/tasks/priorityExplanation.test.mts` | Updated reason string to full names |
| `src/lib/projects/projectForJiraKey.test.mts` | New — 8 cases |


