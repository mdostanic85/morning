/**
 * Calendar pressure on today's ordering.
 *
 * Google Calendar was already synced and already displayed (DailyBriefV2's
 * `todayMeetings` / `meetingPrep`), but it had no influence at all on which task
 * comes first: `rankWorkTask` never looked at a meeting. A ticket being reviewed
 * in ninety minutes therefore ranked exactly like the same ticket with nothing
 * on the calendar, even though only one of them can still be prepared in time.
 *
 * The rules here are deliberately narrow, because a calendar entry is weak
 * evidence on its own:
 *
 * - A meeting only affects a task when its title actually names that work — the
 *   task's Jira key, or at least two shared domain words after ceremony words
 *   ("standup", "review", "sync", ...) are removed. No textual link, no boost.
 * - Only timed meetings that have not started yet count. Preparation is the
 *   thing being ranked, so a meeting already underway or finished adds nothing,
 *   and an all-day informational entry never creates pressure.
 * - Nothing here creates, promotes or blocks a task: it contributes score and a
 *   human-readable note to the existing deterministic ranking. The promotion
 *   floor still requires a real signal (fresh evidence, open Jira, due date, or
 *   an explicit pin) before anything can become `now`.
 */

import { topicOverlapScore } from "@/lib/tasks/transcriptTaskMerge";

export interface MeetingForRanking {
  title: string;
  startAt?: string | null;
}

export interface MeetingPressureResult {
  score: number;
  notes: string[];
}

/** A meeting this close needs its prep done now, not later today. */
export const MEETING_IMMINENT_HOURS = 2;
/** Beyond this the meeting is not today's scheduling constraint. */
export const MEETING_LATER_TODAY_HOURS = 8;

/**
 * Deliberately below the Jira-priority weights (Highest = 260) and the
 * attended-meeting commitment boost: a scheduled discussion reorders comparable
 * work, it never outranks a blocker or an explicit commitment.
 */
export const MEETING_IMMINENT_BOOST = 200;
export const MEETING_LATER_TODAY_BOOST = 110;

/**
 * Words that describe the ceremony rather than the work. Left in, "Design
 * review" would link to every task mentioning design and review, which is
 * pressure the calendar never actually expressed.
 */
const CEREMONY_TOKENS = new Set([
  "call",
  "catchup",
  "check",
  "checkin",
  "daily",
  "demo",
  "grooming",
  "huddle",
  "kickoff",
  "meet",
  "meeting",
  "monthly",
  "planning",
  "refinement",
  "retro",
  "retrospective",
  "review",
  "session",
  "standup",
  "sync",
  "syncup",
  "touchbase",
  "weekly",
  "workshop",
]);

const JIRA_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function stripCeremonyWords(title: string): string {
  return title
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word && !CEREMONY_TOKENS.has(word.toLowerCase()))
    .join(" ");
}

function localHourMinute(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Timed, still upcoming, and inside today's planning horizon. */
function upcomingStart(
  meeting: MeetingForRanking,
  nowMs: number
): { startMs: number; hoursAway: number } | null {
  const startAt = meeting.startAt?.trim();
  // Date-only values are all-day markers (OOO, birthdays, "Home") — informational.
  if (!startAt || !startAt.includes("T")) return null;
  const startMs = Date.parse(startAt);
  if (!Number.isFinite(startMs)) return null;

  const hoursAway = (startMs - nowMs) / (1000 * 60 * 60);
  if (hoursAway <= 0 || hoursAway > MEETING_LATER_TODAY_HOURS) return null;
  return { startMs, hoursAway };
}

function meetingNamesTask(
  meetingTitle: string,
  task: { jiraKey: string | null; text: string }
): boolean {
  const title = meetingTitle.trim();
  if (!title) return false;

  if (task.jiraKey) {
    const keys: string[] = title.toUpperCase().match(JIRA_KEY_PATTERN) ?? [];
    if (keys.includes(task.jiraKey.toUpperCase())) return true;
  }

  // topicOverlapScore already requires at least two shared domain tokens.
  return topicOverlapScore(stripCeremonyWords(title), task.text) > 0;
}

/**
 * Score and explanation contributed by today's calendar for one task. Only the
 * nearest matching meeting counts — three mentions of the same work on the
 * calendar are one scheduling constraint, not three.
 */
export function meetingPressureBoost(input: {
  task: { jiraKey: string | null; text: string };
  meetings: readonly MeetingForRanking[];
  nowMs: number;
}): MeetingPressureResult {
  let best: { meeting: MeetingForRanking; startMs: number; hoursAway: number } | null = null;

  for (const meeting of input.meetings) {
    const upcoming = upcomingStart(meeting, input.nowMs);
    if (!upcoming) continue;
    if (!meetingNamesTask(meeting.title, input.task)) continue;
    if (!best || upcoming.startMs < best.startMs) {
      best = { meeting, startMs: upcoming.startMs, hoursAway: upcoming.hoursAway };
    }
  }

  if (!best) return { score: 0, notes: [] };

  const at = localHourMinute(new Date(best.startMs));
  const imminent = best.hoursAway <= MEETING_IMMINENT_HOURS;

  return {
    score: imminent ? MEETING_IMMINENT_BOOST : MEETING_LATER_TODAY_BOOST,
    notes: [
      `Meeting "${best.meeting.title.trim()}" at ${at} covers this — prepare before it`,
    ],
  };
}
