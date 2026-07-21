import { extractJiraKeyFromTitle } from "@/lib/tasks/resolveFocusTask";
import { extractJiraKeysFromText } from "@/lib/tasks/transcriptTaskMerge";

const DEFAULT_SITE = "default";

/** Stable identity for a Jira work item: jira:{site}:{ISSUE-KEY} */
export function jiraCanonicalKey(issueKey: string, site: string | null | undefined = DEFAULT_SITE): string {
  const key = issueKey.trim().toUpperCase();
  const sitePart = (site?.trim() || DEFAULT_SITE).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `jira:${sitePart}:${key}`;
}

export function parseJiraCanonicalKey(
  canonicalKey: string | null | undefined
): { site: string; issueKey: string } | null {
  if (!canonicalKey) return null;
  const match = canonicalKey.match(/^jira:([^:]+):([A-Z][A-Z0-9]+-\d+)$/i);
  if (!match) return null;
  return { site: match[1].toLowerCase(), issueKey: match[2].toUpperCase() };
}

export function issueKeyFromCanonicalKey(canonicalKey: string | null | undefined): string | null {
  return parseJiraCanonicalKey(canonicalKey)?.issueKey ?? null;
}

export function resolveCanonicalKeyForTask(input: {
  canonicalKey?: string | null;
  title: string;
  site?: string | null;
  evidenceText?: string;
}): string | null {
  if (input.canonicalKey && parseJiraCanonicalKey(input.canonicalKey)) {
    return input.canonicalKey;
  }
  const fromTitle = extractJiraKeyFromTitle(input.title);
  if (fromTitle) return jiraCanonicalKey(fromTitle, input.site);
  const fromEvidence = extractJiraKeysFromText(input.evidenceText ?? "")[0];
  if (fromEvidence) return jiraCanonicalKey(fromEvidence, input.site);
  const fromTitleBody = extractJiraKeysFromText(input.title)[0];
  if (fromTitleBody) return jiraCanonicalKey(fromTitleBody, input.site);
  return null;
}

/** Meeting-only tasks without a Jira key get a topic fingerprint. */
export function meetingTopicCanonicalKey(title: string, sourceItemIds: number[]): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const sources = [...sourceItemIds].sort((a, b) => a - b).join(",");
  return `meeting:${normalized || "topic"}:${sources || "0"}`;
}

export function isJiraDoneStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized === "done" ||
    normalized === "closed" ||
    normalized === "resolved" ||
    /statuscategorykey["']?\s*[:=]\s*["']?done/i.test(status)
  );
}

export function isJiraDoneMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!metadata) return false;
  if (metadata.statusCategoryKey === "done") return true;
  const status = typeof metadata.status === "string" ? metadata.status : null;
  return isJiraDoneStatus(status);
}
