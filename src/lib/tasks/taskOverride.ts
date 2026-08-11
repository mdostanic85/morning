/**
 * Critical override records — newer meeting information replacing what a task
 * currently says.
 *
 * `sourceAuthority.isIncomingSourceAuthoritative` already decides that a fresh
 * meeting outranks the sources a task was built from, and the extractor then
 * rewrites `reason` / `nextAction` / `doneCriteria` / `dueDate` in place. That
 * rewrite used to be silent: the instruction the user may already have acted on
 * simply disappeared, with no record that it had ever been there and no way to
 * see which line of which meeting replaced it.
 *
 * This module turns the silent rewrite into a structural record — what changed,
 * what it used to say, the verbatim transcript line that caused it, and which
 * meeting it came from. Every record is `critical`: the user was working from
 * information that no longer holds, which is exactly the case they must see
 * before they touch the task again.
 *
 * Rules kept deliberately narrow, in the spirit of the surrounding modules:
 * - Only a meeting/transcript source can override. Jira field churn is
 *   mechanical state, already handled by the ranking and reconciliation paths.
 * - No verbatim quote, no record. An override the user cannot trace back to a
 *   sentence someone actually said is not evidence, it is an assertion.
 * - Pure additions are not overrides. A meeting adding a criterion or filling
 *   an empty due date is new information, not contradicted information.
 *
 * Pure and clock-injectable so fixtures stay deterministic.
 */

export const TASK_OVERRIDE_FIELDS = [
  "reason",
  "nextAction",
  "doneCriteria",
  "dueDate",
] as const;
export type TaskOverrideField = (typeof TASK_OVERRIDE_FIELDS)[number];

/** Human label for each overridable field, for UI and explanations. */
export const TASK_OVERRIDE_FIELD_LABELS: Record<TaskOverrideField, string> = {
  reason: "Why this matters",
  nextAction: "Next action",
  doneCriteria: "Done criteria",
  dueDate: "Due date",
};

export interface TaskOverrideRecord {
  field: TaskOverrideField;
  /** What the task said before this meeting landed. */
  previousValue: string;
  /** What the meeting replaced it with. */
  newValue: string;
  /** Verbatim source line proving the change — never LLM prose. */
  quote: string;
  sourceItemId: number;
  sourceTitle: string;
  sourceType: string;
  sourceDate: string;
  /**
   * Overrides are always critical: previously stated task information no longer
   * holds. Kept as a field so the shape survives if softer classes are added.
   */
  severity: "critical";
  detectedAt: string;
}

export interface TaskOverrideFieldValues {
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  dueDate: string | null;
}

export interface TaskOverrideSource {
  id: number;
  title: string;
  sourceType: string;
  sourceDate: string;
  /** Only meeting transcripts may override — see module docstring. */
  isTranscript: boolean;
}

/** How long a critical override still counts as "just landed" for ranking. */
export const OVERRIDE_PRESSURE_WINDOW_MS = 72 * 60 * 60 * 1000;

/** Newest-first cap, matching the `meetingContext` retention on the same task. */
export const TASK_OVERRIDE_HISTORY_LIMIT = 10;

function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?;:,\s]+$/, "");
}

/**
 * True when the new text merely elaborates on the old one. A meeting that
 * repeats the existing instruction and appends detail has not contradicted
 * anything, so it must not be announced as an override.
 */
function isElaboration(previous: string, next: string): boolean {
  const before = normalizeValue(previous);
  const after = normalizeValue(next);
  if (!before) return true;
  return after.includes(before);
}

function textOverride(previous: string, next: string): boolean {
  const before = normalizeValue(previous);
  const after = normalizeValue(next);
  // An empty side is an addition or a deletion by omission, not a contradiction.
  if (!before || !after) return false;
  if (before === after) return false;
  return !isElaboration(previous, next);
}

function criteriaDropped(previous: string[], next: string[]): string[] {
  const after = new Set(next.map(normalizeValue).filter(Boolean));
  return previous.filter((item) => {
    const normalized = normalizeValue(item);
    return normalized.length > 0 && !after.has(normalized);
  });
}

function formatCriteria(criteria: string[]): string {
  return criteria.filter((item) => item.trim().length > 0).join(" · ");
}

function firstUsableQuote(quotes: readonly (string | null | undefined)[]): string | null {
  for (const quote of quotes) {
    const trimmed = typeof quote === "string" ? quote.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Compare what a task says now against what a meeting is about to write onto
 * it, and record every field the meeting genuinely contradicts.
 *
 * The caller is responsible for having already decided that the incoming source
 * wins (`isIncomingSourceAuthoritative`) — this function only describes the
 * change, it does not re-litigate authority.
 */
export function detectTaskFieldOverrides(input: {
  existing: TaskOverrideFieldValues;
  incoming: TaskOverrideFieldValues;
  source: TaskOverrideSource;
  /** Verbatim quotes from the incoming source that support the update. */
  quotes: readonly (string | null | undefined)[];
  detectedAt: string;
}): TaskOverrideRecord[] {
  if (!input.source.isTranscript) return [];

  const quote = firstUsableQuote(input.quotes);
  if (!quote) return [];

  const base = {
    quote,
    sourceItemId: input.source.id,
    sourceTitle: input.source.title,
    sourceType: input.source.sourceType,
    sourceDate: input.source.sourceDate,
    severity: "critical" as const,
    detectedAt: input.detectedAt,
  };

  const records: TaskOverrideRecord[] = [];

  if (textOverride(input.existing.reason, input.incoming.reason)) {
    records.push({
      ...base,
      field: "reason",
      previousValue: input.existing.reason.trim(),
      newValue: input.incoming.reason.trim(),
    });
  }

  if (textOverride(input.existing.nextAction, input.incoming.nextAction)) {
    records.push({
      ...base,
      field: "nextAction",
      previousValue: input.existing.nextAction.trim(),
      newValue: input.incoming.nextAction.trim(),
    });
  }

  const dropped = criteriaDropped(input.existing.doneCriteria, input.incoming.doneCriteria);
  if (dropped.length > 0) {
    records.push({
      ...base,
      field: "doneCriteria",
      previousValue: formatCriteria(input.existing.doneCriteria),
      newValue: formatCriteria(input.incoming.doneCriteria),
    });
  }

  const previousDue = input.existing.dueDate?.trim() ?? "";
  const nextDue = input.incoming.dueDate?.trim() ?? "";
  if (previousDue && nextDue && previousDue !== nextDue) {
    records.push({
      ...base,
      field: "dueDate",
      previousValue: previousDue,
      newValue: nextDue,
    });
  }

  return records;
}

function overrideTime(record: TaskOverrideRecord): number {
  const detected = new Date(record.detectedAt).getTime();
  if (!Number.isNaN(detected)) return detected;
  const sourced = new Date(record.sourceDate).getTime();
  return Number.isNaN(sourced) ? 0 : sourced;
}

/**
 * Merge freshly detected overrides into a task's history, newest first.
 * Re-running a sync over the same meeting replaces that meeting's record for
 * the same field rather than stacking duplicates.
 */
export function mergeTaskOverrides(
  existing: readonly TaskOverrideRecord[],
  incoming: readonly TaskOverrideRecord[],
  limit: number = TASK_OVERRIDE_HISTORY_LIMIT
): TaskOverrideRecord[] {
  if (incoming.length === 0) return [...existing];

  const keyOf = (record: TaskOverrideRecord) => `${record.field}:${record.sourceItemId}`;
  const incomingKeys = new Set(incoming.map(keyOf));

  return [...incoming, ...existing.filter((record) => !incomingKeys.has(keyOf(record)))]
    .sort((a, b) => overrideTime(b) - overrideTime(a))
    .slice(0, limit);
}

/** The most recent critical override, if any. */
export function latestCriticalOverride(
  overrides: readonly TaskOverrideRecord[] | null | undefined
): TaskOverrideRecord | null {
  if (!overrides?.length) return null;
  return (
    [...overrides]
      .filter((record) => record.severity === "critical")
      .sort((a, b) => overrideTime(b) - overrideTime(a))[0] ?? null
  );
}

/**
 * A critical override that landed inside the pressure window — work whose
 * instructions changed under the user in the last few days needs to be seen
 * before they continue from memory.
 */
export function freshCriticalOverride(
  overrides: readonly TaskOverrideRecord[] | null | undefined,
  nowMs: number = Date.now(),
  windowMs: number = OVERRIDE_PRESSURE_WINDOW_MS
): TaskOverrideRecord | null {
  const latest = latestCriticalOverride(overrides);
  if (!latest) return null;
  const age = nowMs - overrideTime(latest);
  return age >= 0 && age <= windowMs ? latest : null;
}

/** One-line summary for ranking explanations and compact UI. */
export function overrideHeadline(record: TaskOverrideRecord): string {
  return `${TASK_OVERRIDE_FIELD_LABELS[record.field]} overridden by ${record.sourceTitle}`;
}
