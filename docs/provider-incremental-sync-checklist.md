# Provider incremental sync migration

## Checklist

| Provider | Status | Cursor mechanism | Scope |
|---|---|---|---|
| Granola (API) | Done (reference) | `updated_since` via `created_after` | provider |
| Jira (API) | Done | `updated_since` JQL + issue IDs | provider |
| Google Calendar | Done | Google `syncToken` (opaque) | resource `primary` |
| Gmail | Done | `updated_since` via `after:` query | provider |
| Confluence (API) | Done | `updated_since` CQL / page version | resource per space/page |
| GitHub | Done | `updated_since` on PR `updated_at` | resource per repository |
| Figma (API) | Done | `updated_since` via `lastModified` metadata gate | resource per file |
| Discord | Done | Discord snowflake `after` (opaque) | resource per channel |
| Granola (MCP) | Not migrated | Uses API cursor path when `transport=api` | — |

## Granola MCP behavior

Granola sync uses the MCP adapter only when the connection row has `metadata.transport = "mcp"`.
The default Granola connection uses the public REST API (`transport=api` or unset), which is the
active production sync path and owns the `connection_cursors` row for `granola_notes`.

MCP is an alternate transport configured explicitly in connection metadata — not a fallback.
No duplicate cursor system was added for MCP; API incremental sync applies when API transport is active.
