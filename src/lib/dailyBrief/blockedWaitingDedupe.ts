/**
 * `composeDailyBriefV2`'s `blockedWaiting` emits one entry per matching task
 * with no dedup — a near-duplicate extraction (same underlying work,
 * extracted twice with slightly different wording) shows up as two
 * separate rows. Exact-title duplicates already collapsed with a plain
 * normalized-title key; this also collapses the common case where one
 * title merely names a recipient the other omits (e.g. "Send X to Daniel"
 * vs "Send X") — a real example from production data (tasks extracted from
 * the same meeting, once with the recipient named, once without).
 *
 * Deliberately conservative: only strips a trailing "to <Name>" clause that
 * looks like a capitalized person's name (initial capital + lowercase),
 * never an all-caps acronym or a generic noun — so unrelated tasks that
 * happen to share a trailing "to X" are not merged by accident.
 */

const TRAILING_RECIPIENT_CLAUSE = /\s+to\s+[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2}\s*$/;

export function coreTitleForDedupe(title: string): string {
  return title.replace(TRAILING_RECIPIENT_CLAUSE, "").trim().toLowerCase();
}

export interface BlockedWaitingLike {
  title: string;
  jiraKey: string | null;
}

export function blockedWaitingDedupeKey(item: BlockedWaitingLike): string {
  return item.jiraKey ?? coreTitleForDedupe(item.title);
}

export function dedupeBlockedWaiting<T extends BlockedWaitingLike>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = blockedWaitingDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
