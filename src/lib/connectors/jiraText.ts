const EXCERPT_MAX = 400;

/** Strip HTML, Jira smart-link markup, and collapse whitespace for display. */
export function cleanJiraText(text: string): string {
  return text
    .replace(/<custom[^>]*>/gi, " ")
    .replace(/<\/custom>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the Description section from a normalized Jira issue body string. */
export function extractJiraDescription(body: string): string {
  const match = body.match(/\nDescription:\n([\s\S]*?)(?:\n\nComments:|\nComments:|$)/);
  if (!match?.[1]) return "";
  const description = cleanJiraText(match[1]);
  if (!description || description === "(empty)") return "";
  return description;
}

/** Human-readable excerpt for cards — description only, never metadata headers. */
export function jiraBodyExcerpt(body: string, maxLength = EXCERPT_MAX): string {
  const description = extractJiraDescription(body);
  if (!description) return "";
  return description.length > maxLength
    ? `${description.slice(0, maxLength).trimEnd()}…`
    : description;
}

function readHeaderField(body: string, label: string): string | null {
  const match = body.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value || value === "unknown" || value === "none") return null;
  return value;
}

export interface JiraInlineMetadata {
  status: string | null;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  dueDate: string | null;
}

// "Labels"/"Mentions" are recognised so a copied Jira header block cannot leak
// into the value of the field before it (e.g. a Due date of "none Labels: ux").
const JIRA_METADATA_LABELS = [
  "Status",
  "Priority",
  "Assignee",
  "Reporter",
  "Due date",
  "Labels",
  "Mentions",
] as const;
const JIRA_METADATA_FIELD_PATTERN =
  /\b(Status|Priority|Assignee|Reporter|Due date|Labels|Mentions):\s*/gi;

function normalizeMetadataValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "unknown" || trimmed === "none") return null;
  return trimmed;
}

function parseMetadataFieldBlock(block: string): JiraInlineMetadata {
  const fields: Partial<Record<(typeof JIRA_METADATA_LABELS)[number], string>> = {};
  const parts = block.split(JIRA_METADATA_FIELD_PATTERN);

  for (let index = 1; index < parts.length; index += 2) {
    const label = parts[index] as (typeof JIRA_METADATA_LABELS)[number];
    const value = normalizeMetadataValue(parts[index + 1]);
    if (value) fields[label] = value;
  }

  return {
    status: fields.Status ?? null,
    priority: fields.Priority ?? null,
    assignee: fields.Assignee ?? null,
    reporter: fields.Reporter ?? null,
    dueDate: fields["Due date"] ?? null,
  };
}

function metadataFieldCount(metadata: JiraInlineMetadata): number {
  return Object.values(metadata).filter(Boolean).length;
}

/** Split inline or trailing Jira field dumps from human prose (e.g. task reason). */
export function splitJiraMetadataFromText(text: string): {
  prose: string;
  metadata: JiraInlineMetadata;
} {
  const empty: JiraInlineMetadata = {
    status: null,
    priority: null,
    assignee: null,
    reporter: null,
    dueDate: null,
  };

  const firstField = /\b(Status|Priority|Assignee|Reporter|Due date|Labels|Mentions):\s*/i.exec(text);
  if (firstField?.index == null) {
    return { prose: text, metadata: empty };
  }

  const metadata = parseMetadataFieldBlock(text.slice(firstField.index));
  if (metadataFieldCount(metadata) < 2) {
    return { prose: text, metadata: empty };
  }

  const prose = text
    .slice(0, firstField.index)
    .trimEnd()
    .replace(/[\s.!?…–—-]+$/, "")
    .trim();

  return { prose, metadata };
}

/** Parse normalized Jira issue body headers (Key, Status, Priority, etc.). */
export function parseJiraBodyFields(body: string): JiraInlineMetadata {
  return {
    status: readHeaderField(body, "Status"),
    priority: readHeaderField(body, "Priority"),
    dueDate: readHeaderField(body, "Due date"),
    assignee: readHeaderField(body, "Assignee"),
    reporter: readHeaderField(body, "Reporter"),
  };
}

function readHeaderList(body: string, label: string): string[] {
  const value = readHeaderField(body, label);
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Labels on the issue, from the `Labels:` header written at ingest.
 * Issues imported before labels were captured simply have no header.
 */
export function parseJiraLabelsFromText(body: string): string[] {
  return readHeaderList(body, "Labels");
}

/**
 * People @mentioned in the issue description or its comments, from the
 * `Mentions:` header written at ingest.
 */
export function parseJiraMentionsFromText(body: string): string[] {
  return readHeaderList(body, "Mentions");
}

export function jiraStatusFocusWeight(status: string | null | undefined): {
  score: number;
  note: string | null;
} {
  if (!status) return { score: 0, note: null };
  const normalized = status.toLowerCase();

  if (/in progress|in development|in review|active|doing/i.test(normalized)) {
    return { score: 160, note: `Actively in progress in Jira (${status})` };
  }
  if (/qa|ready for (dev|qa|review)|internal review|code review/i.test(normalized)) {
    return { score: 130, note: `Needs your action in Jira (${status})` };
  }
  if (/to do|open|selected for development|backlog/i.test(normalized)) {
    // Open work that still needs a first move — recency/new-assignment boosts
    // decide whether it outranks stale In Progress, but it must not start near zero.
    return { score: 90, note: `Open in Jira (${status})` };
  }
  if (/block/i.test(normalized)) {
    return { score: -100, note: `Blocked in Jira (${status})` };
  }

  return { score: 0, note: null };
}
