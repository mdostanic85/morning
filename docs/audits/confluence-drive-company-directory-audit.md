# Confluence and Google Drive Company Directory Audit

Date: 2026-07-19  
Scope: repository audit before SpaceInch-only authentication, employee hierarchy, and manager visibility  
Method: executable code was treated as authoritative. Repository documentation and UI copy were checked against runtime paths. A read-only Confluence search was used only to identify candidate documents; it does not make those documents configured or authoritative.

Classification vocabulary:

- **Implemented** — an executable path exists and performs the stated behavior.
- **Partially implemented** — a related path exists but lacks required directory semantics or guarantees.
- **Mocked** — prototype, fixture, or non-runtime behavior.
- **Hardcoded** — static values or labels are embedded in code.
- **Not found** — no repository capability or configuration was found.
- **Unknown** — the repository and available read-only evidence cannot establish the answer.

## 1. Executive summary

The application is not ready for SpaceInch-only authentication or manager-scoped visibility.

The existing Confluence connector is real and read-only, but it is designed to ingest generic project evidence as lossy plain text. It supports project-configured space keys and page URLs, uses a stable Confluence page ID as `sourceExternalId`, and has timestamp-based incremental synchronization for direct API connections. It does not preserve Confluence revision numbers, table rows, sections, or immutable source revisions. MCP-backed Confluence synchronization bypasses the incremental cursor path.

Google Drive is not implemented. The application has Gmail and Google Calendar providers only. The Sources screen and Hydra report pipeline relabel Gmail-derived material as “Google Drive” or `drive`; no runtime path lists or reads Drive files, exports Google Docs or Sheets, or records Drive revisions.

The current people model is a singleton local profile plus unstructured strings such as task owner, Jira assignee, source author, meeting participant, and Hydra stakeholder. There is no organization, membership, employment, team, department, manager, directory snapshot, or authorization model.

No exact Confluence page or Drive file is configured as the SpaceInch directory. Supplemental read-only Confluence search found two candidate pages:

- `PC` page `1990950926`, “5. How We're Organized”, version 4, last revised 2026-06-18. It is narrative and links to a Figma org chart. It does not contain explicit employee rows, emails, employment status, effective dates, or manager edges.
- `apollo` page `420347910`, “Space Inch Team”, version 3, last revised 2025-01-28. It contains four `name - title` paragraphs for one team. It lacks emails, employment status, department, stable employee IDs, direct-manager rows, and effective dates and appears too narrow and stale to be authoritative.

Neither candidate is sufficient. No exact Drive file ID was found in the repository or Confluence search evidence. SpaceInch must explicitly nominate the source IDs and field authority before authentication work starts.

The safe target architecture is a separate directory ingestion subsystem:

`configured allowlisted sources → fetch exact revisions → parse explicit rows → normalize identities → validate hierarchy and source conflicts → produce immutable proposed snapshot → administrator review → atomically publish → invalidate affected sessions/permissions → append audit events`

Authentication and authorization must read only the last successfully published snapshot. A failed or invalid synchronization must leave that snapshot untouched.

### Blocking conclusion

**[Not found]** Repository-wide directory configuration — no SpaceInch organization record, canonical Confluence page ID, canonical Drive file ID, field-authority mapping, directory parser, validated snapshot, or publication path exists. Authentication implementation is blocked until the source contract and canonical data model are confirmed.

## 2. Current Confluence capability

### Authentication and connection behavior

- **[Implemented]** `src/lib/connectors/oauth.ts` — `CONFLUENCE_SCOPES`, `getOAuthConfig("confluence")`: direct Atlassian OAuth 2.0 uses `read:confluence-content.all`, `read:confluence-space.summary`, `read:me`, and `offline_access`.
- **[Implemented]** `src/app/api/connections/[provider]/connect/route.ts` — `GET`: builds an Atlassian authorization redirect for the validated Confluence provider.
- **[Implemented]** `src/app/api/connections/[provider]/callback/route.ts` — `GET`: exchanges the OAuth code, stores the server-side secret, and records `authType: "oauth"` with API transport metadata.
- **[Implemented]** `src/lib/connectors/auth.ts` — `getAccessToken`, `bearerFetch`: refreshes expired OAuth access tokens when a refresh token is available.
- **[Implemented]** `src/lib/connectors/mcp/capabilities.ts` — `MCP_OAUTH_PROVIDERS.atlassian`; `src/app/api/mcp/[provider]/connect/route.ts`; `src/app/api/mcp/[provider]/callback/route.ts`: shared Atlassian MCP authentication marks Jira and Confluence connected.
- **[Partially implemented]** `src/lib/connectors/atlassian.ts` — `getDefaultAtlassianResource`: selects the first accessible Atlassian site. There is no explicit site allowlist or multi-site selection, which is unsafe for an authoritative directory.

### Configured scope and stable identifiers

- **[Implemented]** `src/db/schema.ts` — `projects.confluenceSpaces`, `projects.confluencePageUrls`: stores free-form arrays of project-scoped Confluence spaces and page URLs.
- **[Implemented]** `src/components/ProjectIntegrationSettingsForm.tsx` — Confluence settings fields; `src/app/api/projects/[id]/integration-settings/route.ts` — `PATCH`: allows users to configure project space keys and page URLs.
- **[Implemented]** `src/lib/connectors/registry.ts` — `confluenceConnector.configError`, `confluenceConnector.listItems`: rejects sync when no project or request scope is present.
- **[Implemented]** `src/lib/connectors/confluence.ts` — `pageIdFromUrl`, `pageToCandidate`: extracts a numeric page ID from `/pages/{id}` or `pageId={id}` and stores that stable ID as `sourceExternalId`.
- **[Hardcoded]** `src/components/SyncMyDayButton.tsx` — `humanizeSyncIssue`: error help references Hydra space, project `/projects/18`, and Confluence page `2078605317`. These values are setup hints, not canonical directory configuration.
- **[Not found]** Environment/configuration layer — no `directorySources`, SpaceInch page allowlist, authoritative space, canonical page ID, or field mapping exists.

### Content, metadata, versions, parsing, and limits

- **[Implemented]** `src/lib/connectors/confluence.ts` — `fetchPageById`, `fetchConfluenceSpacePages`, `fetchConfluencePages`: direct API fetches request `body.storage,version,space`.
- **[Partially implemented]** `src/lib/connectors/confluence.ts` — `pageToCandidate`: persists page ID, cloud ID, space key, current status, author display name, `version.when` as `sourceDate`, URL, and plain-text body.
- **[Not found]** `src/lib/connectors/confluence.ts` — `ConfluencePage.version`: the type and mapper omit `version.number`; exact revision number, revision message, and revision author ID are not stored.
- **[Partially implemented]** `src/lib/connectors/confluence.ts` — `stripHtml`: regex-removes tags and collapses whitespace. It destroys table row/column boundaries, section locators, macro semantics, local IDs, and rich links needed for row-level provenance.
- **[Partially implemented]** `src/lib/imports/confluenceConnectionCursor.ts` — `commitConfluenceResourceCursorOnSuccess`: accepts `pageVersion`, but current callers do not supply one; the runtime cursor is timestamp-based.
- **[Partially implemented]** `src/lib/imports/syncIncrementalProviders.ts` — `syncConfluenceIncremental`: direct API transport syncs each configured space/page with per-resource cursors.
- **[Partially implemented]** `src/lib/connectors/confluence.ts` — `fetchConfluenceSpacePages`: CQL uses day-precision `lastModified >= YYYY-MM-DD`, batches 25, and caps results at 50.
- **[Hardcoded]** `src/lib/connectors/confluence.ts` — `fetchConfluencePages`: legacy full-fetch path caps each space at 20 pages and does not paginate.
- **[Partially implemented]** `src/lib/connectors/mcp/adapters/atlassian.ts` — `fetchConfluencePagesViaMcp`, `confluencePageToCandidate`: reads pages via MCP but does not provide revision-number or incremental-cursor parity.
- **[Not found]** Confluence directory parser — no parser for Confluence tables, explicit employee rows, headings/sections, employee IDs, manager relationships, or effective dates.
- **[Not found]** Confluence history fetch — no path fetches an immutable historical revision by page ID and version.
- **[Not found]** Confluence-specific tests — no tests validate page ID parsing, revision capture, table preservation, or directory semantics.

### Polling, synchronization, and errors

- **[Implemented]** `src/app/api/day/sync/route.ts` — `POST`; `src/inngest/functions/syncMyDay.ts` — `syncMyDay`: manual Sync My Day creates a durable sync run and invokes connected providers in parallel through Inngest.
- **[Implemented]** `src/app/api/connections/[provider]/sync/route.ts` — `POST`: supports a synchronous single-provider sync.
- **[Implemented]** `src/lib/imports/syncProvider.ts` — `syncProvider`: uses the Confluence incremental path only for non-MCP transport, imports candidates, and records connection error state on thrown failure.
- **[Implemented]** `src/lib/imports/syncResourceScopes.ts` — `syncResourceScopes`: isolates per-space/page failures and avoids committing the failed scope cursor.
- **[Partially implemented]** `src/lib/imports/syncResourceScopes.ts` — `syncResourceScopes`: a run can return overall success when at least one scope succeeds, so directory publication cannot reuse that result without stricter all-required-source validation.
- **[Not found]** Confluence polling or webhook — no dedicated scheduled directory check exists.
- **[Implemented]** `src/lib/hydra/orchestrator.ts` — `fetchHydraSources`, `withConnectorRetry`: Hydra can refetch Confluence with three attempts and a 15-second timeout, but this is report evidence collection, not directory publication.
- **[Partially implemented]** `docs/provider-incremental-sync-checklist.md` — Confluence “page version” claim: executable code uses `version.when`/`lastModified`, not revision numbers.
- **[Partially implemented]** `docs/current-app-architecture.md` — Sync My Day sequencing claim: code uses parallel Inngest provider steps, not sequential processing.

## 3. Current Google Drive capability

### Runtime provider

- **[Not found]** `src/lib/connectors/providers.ts` — `CONNECTION_PROVIDERS`: includes Gmail and Calendar but no `drive`.
- **[Not found]** `src/domain/sourceItem.ts` and `src/db/schema.ts` — `SOURCE_TYPES`: no `drive` source type.
- **[Not found]** `src/lib/connectors/`: no Drive connector or Google Docs/Sheets adapter exists.
- **[Not found]** `src/inngest/functions/syncMyDay.ts` — `syncMyDay`: Drive cannot be scheduled or manually synchronized because it is not a registered provider.

### OAuth and API support

- **[Implemented]** `src/lib/connectors/oauth.ts` — `GMAIL_SCOPES`: Gmail requests only `https://www.googleapis.com/auth/gmail.readonly`.
- **[Implemented]** `src/lib/connectors/oauth.ts` — `CALENDAR_SCOPES`: Calendar requests only `https://www.googleapis.com/auth/calendar.readonly`.
- **[Not found]** `src/lib/connectors/oauth.ts` — Drive scopes: no `drive.readonly`, `drive.metadata.readonly`, Docs, or Sheets scope exists.
- **[Implemented]** `src/lib/connectors/gmail.ts` — `fetchGeminiMeetNotes`, `fetchMessageCandidate`: lists and reads Gmail messages; it does not list or read Drive files.
- **[Implemented]** `src/lib/connectors/calendar.ts` — `fetchCalendarEventsIncremental`: lists Google Calendar events; it is unrelated to Drive.
- **[Not found]** Drive `files.list`, `files.get`, `files.export`, `changes.list`, or `revisions.list`.
- **[Not found]** Google Docs structured document parsing.
- **[Not found]** Google Sheets values/grid parsing or CSV export.
- **[Not found]** Drive `modifiedTime`, `version`, revision ID, checksum, export MIME type, shared-drive ID, or file-owner metadata persistence.
- **[Not found]** Exact configured Drive file IDs, folder IDs, URLs, expected sheet/tab names, or ranges.

### UI and documentation claims

- **[Hardcoded]** `src/app/sources/page.tsx` — `SOURCES`: renders `{ key: "drive", connection: "gmail", label: "Google Drive" }`; connection status is actually Gmail status.
- **[Hardcoded]** `src/lib/hydra/orchestrator.ts` — `canonicalSource`, `providerLabel`: relabels Gmail evidence as `drive`.
- **[Hardcoded]** `src/lib/hydra/decisionEngine.ts` — Drive scoring branch: applies “Drive” evidence weighting to Gmail-derived content.
- **[Implemented]** `src/app/settings/page.tsx` — settings connection cards: correctly offers Gmail and Google Calendar and no Drive connection.
- **[Implemented]** `src/components/SourceBadge.tsx` and `src/components/SyncMyDayButton.tsx` — Gmail labels: identify the real Gmail provider.
- **[Partially implemented]** `README.md` — source description: claims Drive sync although no Drive runtime provider exists.
- **[Implemented]** `docs/current-app-architecture.md` — Google Drive limitation: correctly states there is no provider and that the Sources UI maps Drive to Gmail.

### Required correction before directory work

The current `drive` label must not be reused as proof of a Drive capability. A real Drive source needs its own provider key, OAuth/storage boundary, explicit file allowlist, stable file ID, MIME-aware reader, exact revision metadata, and row-preserving parser.

## 4. Current people-data inventory

### Local profile and workspace

- **[Partially implemented]** `src/db/schema.ts` — `userProfiles`: stores `id`, required email, optional name, and timestamps. It has no unique email constraint, auth subject, organization, status, or directory provenance.
- **[Partially implemented]** `src/services/userProfile.ts` — `getUserProfile`, `saveUserProfile`: treats the first row as a singleton profile and lowercases email.
- **[Partially implemented]** `src/components/ProfileForm.tsx` — `ProfileForm`: exposes email but renders name as a hidden field even though Today and Knowledge filtering depend on `profile.name`.
- **[Partially implemented]** `src/db/schema.ts` — `workspaces`: Hydra scheduling/report scope only; there is no user membership or tenant isolation.
- **[Hardcoded]** `src/services/hydra.ts` — `ensureHydraSetup`: creates “Miloš · Hydra”.

### Free-text and connector-derived people

- **[Implemented]** `src/db/schema.ts` — `workTasks.owner`, `workTasks.waitingOn`: nullable free-text fields with no user foreign key.
- **[Implemented]** `src/lib/tasks/extractor.ts` and `src/lib/llm/prompts/taskExtractor.ts` — task ownership extraction: copies or infers source ownership into free text and routes ambiguity to Unclear.
- **[Implemented]** `src/db/schema.ts` — `projects.people`: JSON string hints used by LLM project matching, not organization membership.
- **[Implemented]** `src/db/schema.ts` — `sourceItems.author`, `sourceItems.metadata`: stores connector-specific display names, emails, assignees, reviewers, attendees, or participants.
- **[Implemented]** `src/lib/connectors/jira.ts` and `src/lib/connectors/mcp/adapters/atlassian.ts`: store Jira reporter/assignee display strings on issue evidence.
- **[Implemented]** `src/lib/connectors/calendar.ts` — `eventToCandidate`: stores organizer and attendee labels for an event.
- **[Implemented]** `src/lib/connectors/granola.ts`: stores meeting participants.
- **[Implemented]** `src/lib/connectors/github.ts`: stores GitHub login/reviewer strings.
- **[Implemented]** `src/lib/connectors/gmail.ts`: stores the email `From` header as source author.
- **[Implemented]** `src/db/schema.ts` — `hydraEvidenceItems.author`, `hydraEvidenceItems.participants`: copies run evidence people as strings.
- **[Hardcoded]** `src/domain/hydraReport.ts` — `DEFAULT_HYDRA_CONFIG`: defaults to assignee “Milos Dostanic” and stakeholders “Matt”, “Lucas”.
- **[Hardcoded]** `src/lib/hydra/decisionEngine.ts` — direct/stakeholder patterns: contains personal-name matching and default stakeholder scoring.
- **[Hardcoded]** `src/lib/hydra/orchestrator.ts`: falls back to “Milos Dostanic” when profile name is absent.

### Identity behavior and missing organization data

- **[Implemented]** `src/lib/filters/ownerFilter.ts` — `normalizePerson`, `personMatchesFilter`: lowercases and performs prefix/name string matching.
- **[Partially implemented]** `src/lib/filters/knowledgeFilter.ts`: compares profile name/email to source-author strings; profile email is not verified as a company directory identity.
- **[Not found]** Canonical person key or cross-provider identity mapping.
- **[Not found]** Organization, organization membership, employee ID, employment status, job title, department, team entity, direct manager, effective date, departure date, identity alias, or hierarchy history.
- **[Not found]** Multi-user application authentication, sessions, RBAC, or route authorization.
- **[Partially implemented]** `src/db/schema.ts` — `syncRuns.userId`: records the singleton profile on manual sync but is not an access-control boundary.
- **[Partially implemented]** `src/db/schema.ts` — `auditLogs.actor`; `src/services/hydra.ts` — `writeAuditLog`: actor defaults to `local-user`; it is not a verified employee identity.

Incidental Jira assignees, meeting attendees, email senders, titles in prose, stakeholders, and AI-generated owners must not be promoted into directory identities or hierarchy.

## 5. Exact implementation gaps

1. **[Not found]** `src/db/schema.ts` — organization/directory tables: none of the nine required entities exists.
2. **[Not found]** `src/lib/connectors/providers.ts` — Drive provider registration.
3. **[Not found]** `src/lib/connectors/oauth.ts` — Drive OAuth/scopes and account binding.
4. **[Not found]** `src/lib/connectors/` — exact-file Drive fetcher and Docs/Sheets readers.
5. **[Not found]** Directory source configuration by stable Confluence page ID or Drive file ID.
6. **[Not found]** Per-field source-authority and conflict policy.
7. **[Not found]** Revision-pinned Confluence fetch and Drive revision/change tracking.
8. **[Not found]** Structured Confluence table/section parser and Sheets/Docs row parser.
9. **[Not found]** Row/section provenance preserved through normalization.
10. **[Not found]** Employee key, email alias, duplicate, rename, and departure rules.
11. **[Not found]** Hierarchy validation, cycle detection, self-manager rejection, and missing-manager policy.
12. **[Not found]** Immutable proposed and published directory snapshots.
13. **[Not found]** Atomic publication transaction that leaves the prior valid snapshot in place on failure.
14. **[Not found]** Directory change review/approval UI or API.
15. **[Not found]** Directory-specific audit events and actor identity.
16. **[Not found]** Freshness policy, stale warning, hard maximum age, or login behavior.
17. **[Not found]** Session and permission invalidation based on a new snapshot.
18. **[Partially implemented]** `src/lib/imports/sourceImportPipeline.ts` — generic source dedupe: app-level lookup uses `(sourceType, sourceExternalId)`, but `src/db/schema.ts` has no matching unique constraint.
19. **[Partially implemented]** `src/lib/imports/sourceImportPipeline.ts`: source, task, knowledge, and cursor work is not one transaction; partial writes are possible.
20. **[Partially implemented]** `src/lib/imports/syncProvider.ts`: some non-resource cursor commits occur despite candidate-level import failures; directory synchronization needs all-required-record success.
21. **[Not found]** Sync single-flight/lock: overlapping manual runs are allowed.
22. **[Not found]** Sync My Day audit events: existing `auditLogs` are Hydra-oriented.
23. **[Partially implemented]** `src/lib/imports/calendarSyncState.ts`: uses process memory for pending Calendar sync tokens, demonstrating infrastructure that is not safe to copy into a serverless directory path.
24. **[Partially implemented]** `src/lib/hydra/orchestrator.ts` — `upsertSyncCursor`: Hydra cursors are not awaited consistently and are not read by connectors.

## 6. Candidate source documents and required structure

### Candidate documents found

#### Confluence candidate A: “5. How We're Organized”

- Stable identity: site `ooden.atlassian.net`, space `PC`, page ID `1990950926`.
- Read-only observation: current version 4, revised 2026-06-18.
- Content shape: narrative sections describing company structure, teams, and reporting principles.
- External dependency: links to a Figma/FigJam org chart for the “full picture”.
- **[Unknown]** Authority: neither repository configuration nor page content declares it authoritative for authentication.
- **[Partially implemented]** Structure: useful policy context, but not parseable employee rows and not an allowed Figma/Drive/Confluence-only directory dataset once the hierarchy leaves Confluence.

#### Confluence candidate B: “Space Inch Team”

- Stable identity: site `ooden.atlassian.net`, space `apollo`, page ID `420347910`.
- Read-only observation: current version 3, revised 2025-01-28.
- Content shape: four paragraphs in `name - role` format for one team.
- **[Unknown]** Authority: no statement that it is a complete or maintained company roster.
- **[Partially implemented]** Structure: names and role labels are explicit, but emails, active status, employee IDs, departments, direct managers, and effective dates are absent.

#### Google Drive candidates

- **[Not found]** Repository: no Drive file ID, URL, folder ID, sheet/tab name, document title, or range is configured.
- **[Unknown]** Live Drive: an exact file cannot be selected without an explicitly nominated account/source and stable file ID. Search by title must not become runtime source selection.

### Minimum required source structure

The preferred canonical input is a Google Sheet or a Confluence table with one explicit employee per row. A Google Doc with free-form prose is not sufficient unless it contains a rigid, versioned table and the parser preserves row boundaries.

Required columns:

- `employee_key` — immutable SpaceInch-issued identifier; required.
- `company_email` — normalized SpaceInch login email; required and unique among active memberships.
- `display_name` — employee display name; required.
- `employment_status` — controlled enum such as `active`, `leave`, `terminated`, `pending`; required.
- `job_title` — explicit title; required if manager visibility or UI displays it.
- `department` — controlled department key/name; required if used by policy.
- `team` — controlled team key/name; optional unless used by policy.
- `manager_employee_key` — immutable key of direct manager; required except for explicitly allowed roots.
- `effective_from` — date/time at which the row becomes valid; required.
- `effective_to` — optional scheduled end date/time.
- `record_updated_at` — source-maintained timestamp if available; recommended.

Required document contract:

- One stable page/file ID; title is display-only.
- Explicit header row and fixed parser version.
- No merged identity cells, visual-only indentation, image org charts, or manager inference from ordering.
- A documented blank-value policy.
- A documented omission policy: omission must not mean termination unless the source is explicitly declared a complete roster.
- Stable sheet/tab or Confluence table locator.
- Revision metadata and content hash retained for every fetch.

## 7. Source precedence model

Do not assign precedence to “Drive” or “Confluence” as a whole. Configure authority per field and per stable source ID.

Until SpaceInch confirms the sources, all field authorities are **[Unknown]**:

- Active employment — **[Unknown]**
- Company email — **[Unknown]**
- Job title — **[Unknown]**
- Department — **[Unknown]**
- Direct manager — **[Unknown]**
- Effective date — **[Unknown]**

Recommended policy:

1. Each `directory_source` declares `authoritative_fields`.
2. Exactly one source should be primary for security-critical fields (`employment_status`, `company_email`) unless an explicit equal-authority reconciliation rule exists.
3. A secondary source may fill only fields for which it is explicitly authoritative or an allowed fallback.
4. Two equal-authority, non-empty, normalized values that disagree create a blocking conflict.
5. A lower-priority value that disagrees is retained in `directory_source_records` and a warning/conflict event; it does not silently overwrite the primary.
6. Missing primary data cannot be backfilled from Jira, meetings, emails, titles, stakeholder mentions, or AI.
7. No LLM participates in identity matching, precedence, conflict resolution, or hierarchy construction.

Suggested initial assignment, subject to SpaceInch confirmation:

- A People-maintained complete roster Sheet: active employment, company email, immutable employee key, effective dates.
- A People-maintained explicit org table, whether Sheet or Confluence table: job title, department, team, direct manager.
- Narrative People & Culture pages: explanatory context only, never authentication input.
- Figma org chart: not eligible under the confirmed source constraint and not machine-authoritative.

## 8. Canonical directory data model

The following is a proposed schema, not an implemented migration. Fields are described as:

`field — purpose; source; required/optional; mutability; audit requirement`

### `organizations`

- `id` — durable internal organization UUID; system generated; required; immutable; creation audited.
- `slug` — stable tenant key such as `spaceinch`; administrator configuration; required and unique; rarely mutable; changes audited.
- `display_name` — human-readable organization name; administrator configuration; required; mutable; old/new values audited.
- `status` — `active`, `suspended`, or `archived`; administrator decision; required; mutable; every transition audited.
- `allowed_email_domains` — domains eligible for login, not proof of membership; administrator configuration; required; mutable; changes audited.
- `published_directory_snapshot_id` — pointer to the sole active published snapshot; publication transaction; optional before first publish; mutable only by publisher; every change audited.
- `directory_freshness_policy` — warning age, hard maximum age, and sync frequency; administrator configuration; required; mutable; changes audited.
- `created_at` — creation time; system; required; immutable; retained.
- `updated_at` — last metadata update; system; required; mutable; included in audit context.

### `users`

- `id` — durable internal person UUID; system; required; immutable; creation/merge audited.
- `canonical_email` — normalized current login email; authoritative directory source; required for login; mutable only through reviewed directory change; old/new values audited.
- `display_name` — current preferred display name; authoritative directory source; required; mutable; changes audited.
- `identity_status` — `active`, `disabled`, or `merged`; system/publication; required; mutable; transitions audited.
- `auth_subject` — identity-provider subject after authentication is implemented; auth provider; optional until first login; immutable per provider; binding/rebinding audited.
- `merged_into_user_id` — target for confirmed duplicate merge; administrator resolution; optional; immutable after merge; merge evidence audited.
- `created_at` — creation time; system; required; immutable; retained.
- `updated_at` — current projection update time; system; required; mutable; retained.

`users` must not be created from names alone. A directory employee key plus company email or a reviewed alias transition is required.

### `organization_memberships`

Each published snapshot creates immutable membership rows. “Current membership” is resolved through `organizations.published_directory_snapshot_id`, not by editing rows in place.

- `id` — membership-version UUID; system; required; immutable; creation audited through snapshot publication.
- `organization_id` — owning organization; configuration; required; immutable; retained.
- `snapshot_id` — snapshot containing this membership version; publisher; required; immutable; retained.
- `user_id` — canonical user; identity normalization; required; immutable; linkage/merge audited.
- `employee_key` — immutable SpaceInch employee identifier; authoritative source; required and unique within organization/snapshot; immutable; provenance retained.
- `company_email` — normalized login email for this version; authoritative source; required and unique among active rows; immutable within snapshot; source and change audited.
- `display_name` — explicit employee name; authoritative source; required; immutable within snapshot; source retained.
- `employment_status` — controlled status; authoritative source; required; immutable within snapshot; transitions audited.
- `job_title` — explicit title; configured field authority; optional only if SpaceInch permits; immutable within snapshot; source retained.
- `department_key` — normalized department; configured field authority; optional unless used in policy; immutable within snapshot; changes audited.
- `team_key` — normalized team; configured field authority; optional; immutable within snapshot; changes audited.
- `manager_membership_id` — manager row in the same snapshot; authoritative manager source; optional only for approved roots; immutable; hierarchy change audited.
- `effective_from` — business-effective start; source row; required; immutable; retained.
- `effective_to` — scheduled end; source row; optional; immutable; retained.
- `source_record_ids` — exact contributing source-record IDs by field; normalization process; required; immutable; retained permanently.
- `created_at` — materialization time; system; required; immutable; retained.

### `directory_sources`

- `id` — source configuration UUID; system; required; immutable; creation audited.
- `organization_id` — owning organization; administrator; required; immutable; retained.
- `provider` — `confluence` or `google_drive`; administrator; required; immutable after first successful sync; changes require a new source and audit.
- `external_id` — stable numeric page ID or Drive file ID; administrator-provided; required; immutable after first publish; changes audited as source replacement.
- `display_name` — operator-facing title; fetched metadata/administrator; required; mutable; changes audited.
- `container_id` — Confluence space ID/key or shared-drive ID; fetched metadata; optional; mutable only if provider reports change; retained.
- `document_kind` — `confluence_table`, `google_sheet`, or `google_doc_table`; administrator/parser contract; required; mutable only by reviewed reconfiguration; audited.
- `locator` — table local ID/heading or Sheet tab/range; administrator; required; mutable; changes audited.
- `authoritative_fields` — allowlisted directory fields controlled by this source; SpaceInch decision; required; mutable only with approval; changes audited.
- `precedence` — per-field numeric priority or explicit primary/fallback map; SpaceInch decision; required; mutable only with approval; changes audited.
- `expected_schema` — header names, types, blank semantics, omission semantics; administrator; required; versioned/append-only; changes audited.
- `parser_version` — deterministic parser release; application; required; mutable per deployment; every sync records value.
- `enabled` — whether polling may fetch the source; administrator; required; mutable; transitions audited.
- `requires_publication_approval` — approval policy; administrator; required; mutable; changes audited.
- `last_seen_revision` — latest fetched revision metadata; sync; optional before fetch; mutable; every change tied to a run.
- `last_successful_sync_at` — source freshness marker; sync; optional; mutable; retained in run history.
- `created_at`, `updated_at` — system timestamps; required; mutable only as appropriate; retained.

### `directory_sync_runs`

- `id` — run UUID; system; required; immutable; primary audit correlation ID.
- `organization_id` — target organization; scheduler/admin; required; immutable; retained.
- `trigger` — `scheduled`, `manual`, or `retry`; system/actor; required; immutable; retained.
- `status` — `queued`, `fetching`, `parsing`, `validating`, `awaiting_approval`, `published`, `rejected`, `failed`, `cancelled`; workflow; required; mutable by state machine; every transition audited.
- `base_snapshot_id` — published snapshot used for diff; system; optional before first snapshot; immutable; retained.
- `proposed_snapshot_id` — immutable candidate produced by validation; system; optional until produced; immutable; retained.
- `started_by_user_id` — administrator for manual run; auth context; optional for scheduler; immutable; retained.
- `started_at`, `completed_at` — lifecycle times; system; start required/end optional; immutable once set; retained.
- `source_revision_manifest` — exact source IDs, revisions, modified times, export formats, hashes; fetchers; required after fetch; immutable; retained.
- `parser_manifest` — parser/schema versions per source; application; required after parse; immutable; retained.
- `counts` — fetched/parsed/accepted/rejected/conflict/change counts; system; required at completion; immutable; retained.
- `error_code`, `error_message` — terminal diagnostic without secrets/raw PII; system; optional; immutable after completion; retained.
- `approval_status`, `approved_by_user_id`, `approved_at` — review outcome; administrator; optional until review; immutable after decision; approval audited separately.
- `created_at`, `updated_at` — system; required; mutable during run; retained.

### `directory_source_records`

- `id` — parsed-record UUID; system; required; immutable; retained for traceability.
- `sync_run_id` — owning run; system; required; immutable; retained.
- `directory_source_id` — source configuration; system; required; immutable; retained.
- `source_revision` — Confluence version number or Drive revision/version/modified time; provider; required; immutable; retained.
- `record_key` — source employee key or deterministic row key; source/parser; required; immutable; retained.
- `record_locator` — Confluence table/local ID plus row index, or Sheet tab/range/row; parser; required; immutable; retained.
- `raw_record_hash` — SHA-256 of canonicalized source row; parser; required; immutable; retained.
- `raw_record_encrypted` — minimum row payload needed for audit, encrypted at rest; source; optional if policy allows hash plus source ref only; immutable; access audited.
- `normalized_payload` — deterministic normalized fields before cross-source resolution; parser; required; immutable; retained.
- `field_provenance` — source cell/column locator for each normalized value; parser; required; immutable; retained.
- `effective_from`, `effective_to` — row business dates; source; first required, second optional; immutable; retained.
- `parse_status` — `accepted`, `warning`, or `rejected`; parser/validator; required; immutable after run completion; retained.
- `created_at` — parse time; system; required; immutable; retained.

### `company_directory_snapshots`

- `id` — snapshot UUID; system; required; immutable; retained.
- `organization_id` — owning organization; system; required; immutable; retained.
- `version` — monotonic organization snapshot number; publisher; required and unique; immutable; retained.
- `state` — `proposed`, `published`, `rejected`, or `superseded`; workflow; required; mutable only through valid transitions; every transition audited.
- `sync_run_id` — producing run; system; required; immutable; retained.
- `previous_snapshot_id` — prior published snapshot; system; optional for first snapshot; immutable; retained.
- `content_hash` — hash of sorted canonical memberships and hierarchy; publisher; required; immutable; retained.
- `source_revision_manifest` — exact source revisions used; copied from run; required; immutable; retained.
- `validation_summary` — blocking/warning counts and validator version; validator; required; immutable; retained.
- `member_count`, `active_member_count`, `root_count` — integrity metrics; validator; required; immutable; retained.
- `effective_at` — business-effective time; source/publisher; required; immutable; retained.
- `published_at`, `published_by_user_id` — publication identity/time; administrator/system policy; optional until publish; immutable after publish; audited.
- `superseded_at` — replacement time; publisher; optional; immutable once set; audited.
- `fresh_until`, `hard_expires_at` — derived freshness boundaries; policy; required on publish; immutable for snapshot; retained.
- `created_at` — creation time; system; required; immutable; retained.

### `hierarchy_change_events`

- `id` — event UUID; system; required; immutable; retained.
- `organization_id` — owning organization; system; required; immutable; retained.
- `from_snapshot_id`, `to_snapshot_id` — compared versions; diff engine; first optional for initial snapshot, second required; immutable; retained.
- `user_id`, `employee_key` — affected employee; normalization; required; immutable; retained.
- `change_type` — `manager_assigned`, `manager_changed`, `manager_removed`, `employee_activated`, `employee_departed`, or `identity_changed`; diff engine; required; immutable; retained.
- `old_manager_user_id`, `new_manager_user_id` — manager transition; diff engine; optional as appropriate; immutable; retained.
- `effective_at` — source business date; source/diff; required; immutable; retained.
- `source_record_ids` — exact records supporting the change; provenance engine; required; immutable; retained.
- `requires_permission_invalidation` — whether visibility changes; policy engine; required; immutable; retained.
- `processed_at` — invalidation completion; system; optional until processed; immutable once set; audited.
- `created_at` — event time; system; required; immutable; retained.

### `directory_validation_issues`

- `id` — issue UUID; system; required; immutable; retained.
- `sync_run_id` — owning run; validator; required; immutable; retained.
- `snapshot_id` — proposed snapshot if available; validator; optional; immutable; retained.
- `directory_source_id`, `source_record_id` — source/record causing issue; validator; optional when issue is global; immutable; retained.
- `code` — stable machine code such as `DUPLICATE_EMAIL`, `MANAGER_CYCLE`, or `SOURCE_CONFLICT`; validator; required; immutable; retained.
- `severity` — `warning` or `blocking`; policy; required; immutable for the run; retained.
- `field` — affected canonical field; validator; optional for global issue; immutable; retained.
- `employee_key` — affected employee; validator; optional; immutable; retained.
- `record_locator` — human-review source locator; parser; optional; immutable; retained.
- `details` — redacted explanatory payload; validator; required; immutable; retained.
- `conflicting_values` — normalized values plus source-record references; validator; optional; immutable; access audited.
- `resolution_status` — `open`, `accepted_exception`, `source_corrected`, or `rejected`; administrator/workflow; required; mutable; every change audited.
- `resolved_by_user_id`, `resolved_at`, `resolution_note` — explicit resolution; administrator; optional until resolved; immutable after closure except append-only correction; audited.
- `created_at` — detection time; system; required; immutable; retained.

## 9. Sync and freshness architecture

### Proposed ingestion flow

1. Load enabled `directory_sources` for the organization. Reject runtime-supplied arbitrary URLs/IDs.
2. Fetch metadata for each exact stable ID.
3. If revision is unchanged, record a successful no-change run without reparsing.
4. If changed, fetch content tied to the exact observed revision:
   - Confluence: page ID plus revision number, preserving structured HTML/ADF and local/table identifiers.
   - Drive: file ID plus `modifiedTime`, version/revision metadata, MIME type, and deterministic export (Sheets values/CSV or Docs structure).
5. Store a revision manifest and content hash before parsing.
6. Parse explicit rows only; retain row/cell/section locators.
7. Normalize email, employee key, controlled enums, dates, departments/teams, and manager keys deterministically.
8. Resolve fields only through configured per-field authority.
9. Validate records, hierarchy, source completeness, and conflicts.
10. Compare with the currently published snapshot and create an immutable proposed snapshot and change set.
11. Require administrator approval during phase 1. Later, allow auto-publication only for low-risk, fully valid changes if SpaceInch explicitly approves that policy.
12. In one database transaction, mark the proposal published, point the organization at it, mark the prior snapshot superseded, and write an outbox/audit event.
13. Process permission/session invalidations idempotently from the publication event.

### Frequency

Recommended:

- Metadata/revision check every 15 minutes during working days and hourly otherwise.
- Fetch and parse only when an exact revision changes.
- Nightly forced full reconciliation and hash verification.
- Manual “check now” for administrators.
- Prefer provider change notifications later, but retain scheduled reconciliation.

The existing Hydra 15-minute Vercel cron is **[Implemented]** in `vercel.json` and `src/app/api/cron/hydra/route.ts`, but it must not be reused as directory publication without a separate lock, state machine, validation, and audit boundary.

### Staleness and failure

- The last published snapshot remains authoritative after any failed or invalid run.
- `fresh_until`: recommend 24 hours after last successful source check.
- Between 24 and 72 hours: mark stale, alert administrators, continue login against the last published snapshot, and do not claim freshness.
- After `hard_expires_at` (recommend 72 hours): deny new logins and session refreshes except a separately controlled break-glass administrator. Existing short-lived sessions expire normally.
- A stale snapshot is never silently replaced by a partial or invalid result.
- Freshness thresholds must be configurable and confirmed by SpaceInch based on departure risk and source maintenance practices.

## 10. Validation rules

Blocking validation:

1. Every active employee has a non-empty immutable employee key.
2. Every active employee has exactly one normalized SpaceInch company email.
3. Active company emails and employee keys are unique.
4. Email domain is in the organization allowlist.
5. Employment status is in the configured enum.
6. Required fields have one authoritative value.
7. Each non-root active employee has exactly one active manager.
8. An employee cannot manage themselves.
9. Manager references resolve within the same proposed snapshot.
10. The active manager graph is acyclic. Detect with depth-first color marking or topological sort and report the complete cycle path.
11. Root count is within a configured expectation.
12. Effective ranges are valid and do not overlap for the same employee identity.
13. A future-dated manager or departure change does not take effect early.
14. Required sources all fetched exact revisions successfully.
15. Every canonical field has source-record and field/cell provenance.
16. The change set does not exceed configured safety thresholds without approval.
17. Parser/schema version matches the configured source contract.
18. No record is created by fuzzy name matching, Jira, email activity, meeting attendance, stakeholder text, title inference, or AI.

Warnings that may still require approval:

- Normalized display-name change with stable employee key/email.
- Department/team/title-only change.
- Lower-priority source disagreement.
- Unexpected but allowed root or leave status.
- Source row moved with unchanged employee key and content.

## 11. Conflict-resolution rules

1. Normalize before comparing: lowercase/trim email, Unicode-normalize names, map controlled department/team/status aliases, parse dates in an explicit timezone.
2. Compare values field by field, not whole records.
3. If one configured primary source provides a value, it wins; retain and report disagreeing fallback values.
4. If two equal-authority sources disagree, create a blocking `SOURCE_CONFLICT`; do not publish.
5. If the primary is blank:
   - use a fallback only if the field policy explicitly permits fallback;
   - otherwise block.
6. An explicit source null is distinct from “field absent”; blank semantics belong in `expected_schema`.
7. Never use “newest document wins” unless SpaceInch explicitly defines equal authority and revision-time precedence for that field.
8. Never let an administrator edit the proposed canonical value without either correcting the source or recording a narrowly scoped, expiring, audited exception.

## 12. Snapshot publication model

- Proposed snapshots are immutable.
- Validation issues attach to the proposal/run; fixes produce a new run/proposal.
- The publication transaction changes exactly one organization pointer to the validated snapshot.
- The previous published snapshot is preserved and marked superseded, not deleted.
- A failed transaction leaves the previous pointer untouched.
- Initial publication and all phase-1 changes require a named administrator approval.
- High-risk changes should always require approval:
  - active → terminated/suspended;
  - company email or employee-key change;
  - manager change affecting visibility;
  - source replacement/schema change;
  - conflict exception;
  - change count above a percentage/absolute threshold.
- Routine title/team changes may later auto-publish only after SpaceInch approves the rule and the system has demonstrated reliable source maintenance.

## 13. Employee lifecycle behavior

### Duplicates and renames

- Match first by immutable `employee_key`.
- Email is a security identifier but may change; preserve prior email as an audited alias only after explicit source evidence.
- Names are display attributes and must never merge identities.
- Duplicate active employee keys or emails block publication.
- If two source rows appear to be one person but lack a shared immutable key, require administrator resolution; do not fuzzy-merge.
- A legal/preferred name change creates a new membership version for the same user.

### New hires

- `pending` employees may exist before `effective_from` but cannot log in early.
- At effective time, a published active membership becomes eligible for login.
- Manager and required security fields must resolve before activation.

### Departures

- Departure must be explicit (`terminated`/`inactive`) or a future `effective_to`.
- Mere absence from a partial document does not imply departure.
- Omission may imply departure only if the source is explicitly configured as a complete roster and the change passes high-risk approval.
- On effective departure publication, revoke sessions and organization access immediately while retaining historical snapshots and audit evidence.

### Manager changes

- Represent each manager change as old/new membership edges in consecutive immutable snapshots.
- Record a `hierarchy_change_event` with effective time and exact source records.
- Future-dated changes remain proposed until effective or are published with time-aware membership edges; authorization must never apply them early.

## 14. Permission invalidation behavior

Authentication sessions should carry user ID, organization ID, and directory snapshot version, but authorization must revalidate when the organization’s published snapshot version changes.

On publication:

- Departure, suspension, membership removal, or company-email replacement: revoke all affected organization sessions and refresh tokens immediately.
- Manager change: invalidate authorization caches and manager-visibility grants for the employee, old manager, new manager, and affected reporting subtree.
- Department/team change: invalidate only policies that actually depend on those fields.
- Display-name/title-only change: refresh profile/cache; do not revoke login unless policy uses the field.
- Source/parser/policy change: invalidate all directory-derived authorization caches.

Do not encode a long-lived manager subtree solely inside a session token. Use short-lived claims plus snapshot-version checks or server-side authorization queries. Invalidation processing must be idempotent and auditable; publication should write an outbox event in the same transaction so invalidation cannot be lost.

## 15. Security and privacy risks

- **Broad Confluence read scope:** current `read:confluence-content.all` can access more than directory pages. Runtime must enforce exact page IDs and reject discovered/unconfigured pages.
- **Drive overreach:** a broad Drive read-only token could expose unrelated files. Prefer a dedicated service identity or narrowly shared account plus an application allowlist of exact file IDs. Never browse all Drive content during login.
- **Current first-site selection:** `getDefaultAtlassianResource` may select the wrong Atlassian site; pin cloud/site ID in source configuration.
- **Lossy provenance:** current HTML stripping cannot prove which row/cell produced a manager edge.
- **PII retention:** directory rows contain names, emails, employment state, and hierarchy. Encrypt sensitive retained payloads, minimize raw content, define retention, and audit reads.
- **Secrets:** continue server-only token storage; never expose connector tokens to client components.
- **Source spoofing:** validate fetched site/container/file IDs, MIME types, and permissions against configuration.
- **CSV/formula risks:** treat Sheet cells as data, neutralize spreadsheet formulas on export, cap sizes, and reject malformed encodings.
- **Parser change risk:** parser upgrades can produce mass identity changes; require versioned parsers, deterministic tests, and approval.
- **Stale departures:** overly permissive stale login permits former employees; define and enforce a hard maximum age.
- **Rollback abuse:** rollback must create a new audited publication decision or repoint only through an approved transaction; never delete history.
- **Audit leakage:** do not write access tokens or full raw documents into errors/audit logs.
- **Current app openness:** there is no route/session authorization, so manager visibility must not be added before the directory and auth boundaries exist.
- **Existing external write scopes:** `src/lib/connectors/oauth.ts` requests Jira write and GitHub `repo`; directory ingestion must remain isolated and read-only and must not inherit unrelated connector permissions.

## 16. Questions requiring confirmation from SpaceInch

1. What exact Confluence page IDs and Google Drive file IDs are nominated as directory sources?
2. Which Google account/service identity owns the Drive connection, and are files in My Drive or a Shared Drive?
3. Is the actual org chart only in the Figma board linked by page `1990950926`? If so, it must be replicated into an allowed structured Confluence/Drive source.
4. Is page `420347910` maintained, complete, or only an Apollo team note?
5. Which source is authoritative for active employment?
6. Which source is authoritative for company email?
7. Which source is authoritative for job title, department, team, and direct manager?
8. What is the immutable employee key? If none exists, can People add one?
9. What statuses and effective-date semantics does People use?
10. Is a missing row in any source meaningful, and can it ever mean departure?
11. How are contractors, interns, leave, pending hires, and shared managers represented?
12. How many hierarchy roots are valid?
13. Can managers be outside SpaceInch or inactive?
14. Are dotted-line managers needed, or only direct managers?
15. What are the required freshness warning and hard-expiry windows?
16. Must every publication be manually approved, or only initial/high-risk changes?
17. Who can approve directory changes and source/schema configuration?
18. What login behavior is acceptable during a prolonged source outage?
19. What is the maximum permitted session lifetime after a directory becomes stale?
20. What retention period applies to raw source rows, snapshots, and audit events?
21. Are former employee emails ever reassigned?
22. Which timezone governs effective dates?
23. Are company email aliases allowed for login?
24. Should manager visibility include only direct reports or the full descendant tree?

## 17. Blocking issues before authentication implementation

Authentication implementation must not begin until all of the following are resolved:

1. Exact stable source IDs are approved and allowlisted.
2. Field-by-field authority and conflict rules are signed off.
3. A structured row contract exists with immutable employee key, company email, status, manager key, and effective date.
4. The Figma-linked org chart is either declared non-authoritative or mirrored into an allowed structured source.
5. A real Drive provider and least-privilege OAuth/service-account strategy are designed if Drive is selected.
6. Confluence exact revision and structured table provenance are designed if Confluence is selected.
7. The canonical data model and immutable snapshot publication transaction are accepted.
8. Duplicate, rename, departure, effective-date, and manager-cycle policies are confirmed.
9. Freshness, stale-login, and hard-expiry policy is confirmed.
10. Manual approval and break-glass administration policy is confirmed.
11. Session/version checking and permission invalidation behavior is designed.
12. Directory-specific audit, privacy, encryption, retention, and access controls are approved.

Until then, the only safe behavior is to keep the application unauthenticated/local as it is today and avoid deriving company membership or hierarchy from existing work-signal data.
