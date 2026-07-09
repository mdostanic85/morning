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

/** Parse normalized Jira issue body headers (Key, Status, Priority, etc.). */
export function parseJiraBodyFields(body: string): {
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  assignee: string | null;
} {
  return {
    status: readHeaderField(body, "Status"),
    priority: readHeaderField(body, "Priority"),
    dueDate: readHeaderField(body, "Due date"),
    assignee: readHeaderField(body, "Assignee"),
  };
}

export function jiraStatusFocusWeight(status: string | null | undefined): {
  score: number;
  note: string | null;
} {
  if (!status) return { score: 0, note: null };
  const normalized = status.toLowerCase();

  if (/in progress|in development|in review|active|doing/i.test(normalized)) {
    return { score: 1250, note: `Actively in progress in Jira (${status})` };
  }
  if (/qa|ready for (dev|qa|review)|internal review|code review/i.test(normalized)) {
    return { score: 650, note: `Needs your action in Jira (${status})` };
  }
  if (/to do|open|selected for development|backlog/i.test(normalized)) {
    return { score: 250, note: null };
  }
  if (/block/i.test(normalized)) {
    return { score: 80, note: `Blocked in Jira (${status})` };
  }

  return { score: 0, note: null };
}
