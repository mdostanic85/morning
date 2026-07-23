import type { TaskOwnershipClass } from "@/lib/filters/ownerFilter";

/**
 * "Needs your input" is a triage rail, not an archive. The user does not want
 * to see items that are (a) stale, (b) never name them, or (c) already judged
 * to be someone else's. This module encodes that relevance gate so the composer
 * (persisted brief) and the Today page (live reconciliation) apply identical rules.
 */

/** A needs-input item whose freshest signal is older than this is stale noise. */
export const NEEDS_INPUT_MAX_AGE_DAYS = 2;

/** Whole days between two ISO instants; Infinity when either is unparseable. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return (to - from) / 86_400_000;
}

/** The most recent parseable date in the list, or null when none parse. */
export function latestSignalDate(dates: (string | null | undefined)[]): string | null {
  let bestMs: number | null = null;
  let bestIso: string | null = null;
  for (const value of dates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (bestMs == null || ms > bestMs) {
      bestMs = ms;
      bestIso = value;
    }
  }
  return bestIso;
}

/**
 * True when the user's (first) name is mentioned anywhere in `text`. Deliberately
 * a plain word-boundary match — this is the "am I even named here?" test, not the
 * stricter "am I the actor?" ownership test in ownerFilter.
 */
export function mentionsMe(text: string, myName: string | null): boolean {
  if (!myName?.trim() || !text.trim()) return false;
  const firstName = myName.trim().split(/\s+/)[0];
  if (firstName.length < 3) return false;
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`, "i").test(text);
}

/**
 * Decides whether an item already selected for the "needs your input" rail
 * should actually be surfaced to the user. Applied on top of the existing
 * scope selection (waiting / unclear scope / unclear ownership).
 *
 * Keeps an item only when ALL hold:
 * - ownership is not "other" (never surface someone else's work);
 * - its freshest signal is within `maxAgeDays` (no stale backlog);
 * - it is explicitly the user's, OR the user is actually named somewhere in it
 *   (never surface work that never mentions them).
 */
export function needsInputItemIsRelevant(input: {
  ownership: TaskOwnershipClass;
  /** Combined title + reason + next action + evidence text, for the mention test. */
  text: string;
  latestSignalDate: string | null;
  myName: string | null;
  today: string;
  maxAgeDays?: number;
}): boolean {
  const maxAgeDays = input.maxAgeDays ?? NEEDS_INPUT_MAX_AGE_DAYS;

  if (input.ownership === "other") return false;

  // Unknown or stale signal date → treat as stale and drop.
  if (input.latestSignalDate == null) return false;
  if (daysBetween(input.latestSignalDate, input.today) > maxAgeDays) return false;

  if (input.ownership === "mine") return true;
  return mentionsMe(input.text, input.myName);
}
