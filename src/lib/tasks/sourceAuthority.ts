import type { ConnectionProvider } from "@/lib/connectors/providers";
import type { SourceItem } from "@/domain/sourceItem";
import type { SourceType } from "@/domain/sourceItem";
import { DEFAULT_HYDRA_CONFIG } from "@/domain/hydraReport";

/**
 * Source hierarchy for Sync My Day and task ranking:
 * 1. Confluence (selected project spaces) — baseline product context
 * 2. PRD pages (URL hint or title match) — requirements baseline
 * 3. Jira (assigned / mentioned) — operational task state
 * 4. Meeting transcripts (Gemini Gmail/Drive + Granola) — action instructions
 *
 * Conflict resolution:
 * - Per task, anything more than 5 days older than the newest signal for that
 *   task is ignored entirely.
 * - Within that window, the newest source date wins by default.
 * - A transcript still wins when Matt/Lucas explicitly gave the instruction,
 *   even against a newer non-stakeholder source (inside the window).
 */

export type SourceAuthorityTier =
  | "transcript"
  | "jira"
  | "prd"
  | "confluence"
  | "other";

/** Provider sync waves — each wave finishes before the next starts. */
export const SYNC_PROVIDER_WAVES: readonly (readonly ConnectionProvider[])[] = [
  ["confluence"],
  ["jira"],
  ["granola", "gmail"],
  ["calendar", "github", "discord", "figma"],
] as const;

/**
 * Gmail is the single visible Gemini Notes sync provider. When a Gemini share
 * email contains a Google Docs link, the Gmail connector follows that link and
 * imports the real transcript through Docs' authenticated text export endpoint.
 * The legacy standalone Drive provider remains hidden to avoid duplicate rows
 * and does not require Drive API v3 to be enabled.
 */
export function isSyncMyDayProvider(provider: ConnectionProvider): boolean {
  return provider !== "drive";
}

export const HIGH_AUTHORITY_STAKEHOLDERS = DEFAULT_HYDRA_CONFIG.stakeholders;

const PRD_TITLE_PATTERN =
  /\b(prd|product requirements?(?:\s+doc(?:ument)?)?|requirements?\s+doc(?:ument)?|acceptance criteria)\b/i;

export function looksLikePrdTitle(title: string | null | undefined): boolean {
  return Boolean(title && PRD_TITLE_PATTERN.test(title));
}

/**
 * Calendar RSVP / invite mail that Gmail Gemini query sometimes imports.
 * Not a real meeting transcript — must not drive focus or force-include.
 */
export function isCalendarInviteLikeSource(source: {
  title?: string | null;
  body?: string | null;
}): boolean {
  const title = source.title?.trim() ?? "";
  if (
    /^(invitation|canceled event|cancelled event|accepted|updated invitation|declined)\b/i.test(
      title
    )
  ) {
    return true;
  }
  if (/\binvitation:\s+/i.test(title) && !/\bnotes:\s+/i.test(title)) {
    return true;
  }
  return false;
}

export function isTranscriptSource(source: {
  sourceType: string;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (isCalendarInviteLikeSource(source)) return false;

  if (
    source.sourceType === "granola" ||
    source.sourceType === "manual_transcript" ||
    source.sourceType === "drive"
  ) {
    return true;
  }
  if (source.sourceType !== "gmail") return false;
  if (
    source.metadata?.importedFrom === "gmail_gemini_meet_notes" ||
    source.metadata?.importedFrom === "drive_gemini_notes"
  ) {
    return true;
  }
  return /gemini|google meet|meeting notes|transcript/i.test(
    `${source.title ?? ""} ${source.body ?? ""}`
  );
}

/**
 * Commitments spoken in meetings the user personally attended within this many
 * days are force-included as things to do — even when no Jira ticket exists.
 */
export const ATTENDED_TRANSCRIPT_COMMITMENT_WINDOW_DAYS = 4;
export const ATTENDED_TRANSCRIPT_COMMITMENT_WINDOW_MS =
  ATTENDED_TRANSCRIPT_COMMITMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface AttendanceContext {
  myName?: string | null;
  myEmail?: string | null;
}

function foldDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function nameMatches(haystackRaw: string, nameRaw: string): boolean {
  const haystack = foldDiacritics(haystackRaw);
  const trimmed = foldDiacritics(nameRaw.trim());
  if (trimmed.length < 3) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escaped}\\b`, "i").test(haystack)) return true;
  const firstName = trimmed.split(/\s+/)[0];
  if (firstName && firstName.length >= 3) {
    const escapedFirst = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escapedFirst}\\b`, "i").test(haystack);
  }
  return false;
}

/**
 * Whether the user personally attended the meeting behind this source.
 * - Gmail Gemini/Drive notes and manual transcripts imply the user's own
 *   account, so attendance is assumed.
 * - Granola transcripts are checked against the participant list in metadata.
 */
export function userAttendedTranscript(
  source: {
    sourceType: string;
    title?: string | null;
    body?: string | null;
    author?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  context: AttendanceContext
): boolean {
  if (!isTranscriptSource(source)) return false;

  // The user's own Gmail/Drive account and pasted transcripts imply presence.
  if (
    source.sourceType === "gmail" ||
    source.sourceType === "drive" ||
    source.sourceType === "manual_transcript"
  ) {
    return true;
  }

  const myName = context.myName?.trim() ?? "";
  const myEmail = context.myEmail?.trim().toLowerCase() ?? "";

  const participants: string[] = [];
  const rawParticipants = source.metadata?.participants;
  if (Array.isArray(rawParticipants)) {
    for (const entry of rawParticipants) {
      if (typeof entry === "string") participants.push(entry);
      else if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        for (const key of ["name", "displayName", "email"]) {
          if (typeof record[key] === "string") participants.push(record[key] as string);
        }
      }
    }
  }
  const participantText = participants.join("\n");

  if (myEmail && participantText.toLowerCase().includes(myEmail)) return true;
  if (myName && nameMatches(participantText, myName)) return true;

  // Fall back to a "Participants:" line in the transcript body (Granola format).
  const body = source.body ?? "";
  const participantsLine = body.match(/Participants?:\s*(.+)/i)?.[1] ?? "";
  if (myEmail && participantsLine.toLowerCase().includes(myEmail)) return true;
  if (myName && nameMatches(participantsLine, myName)) return true;

  return false;
}

/** A fresh (<=4 days) transcript the user attended — the strongest "must do" signal. */
export function isRecentAttendedTranscript(
  source: {
    sourceType: string;
    sourceDate: string;
    title?: string | null;
    body?: string | null;
    author?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  context: AttendanceContext,
  now: number = Date.now()
): boolean {
  if (!userAttendedTranscript(source, context)) return false;
  const time = sourceTime(source);
  if (time === 0) return false;
  return now - time <= ATTENDED_TRANSCRIPT_COMMITMENT_WINDOW_MS;
}

/** True when Matt/Lucas (or configured stakeholders) authored or are quoted giving the instruction. */
export function hasHighAuthorityStakeholderInstruction(
  source: {
    author?: string | null;
    title?: string | null;
    body?: string | null;
  },
  stakeholders: readonly string[] = HIGH_AUTHORITY_STAKEHOLDERS
): boolean {
  const haystack = `${source.author ?? ""}\n${source.title ?? ""}\n${source.body ?? ""}`;
  return stakeholders.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const authorHit =
      Boolean(source.author) &&
      new RegExp(`\\b${escaped}\\b`, "i").test(source.author ?? "");
    // Speaker / directive patterns common in transcripts.
    const spokenHit = new RegExp(
      `\\b${escaped}\\b[^\\n]{0,80}\\b(said|says|asked|wants?|needs?|told|please|can you|you should|you need)\\b|\\b(said|says|asked|wants?|needs?|told)\\b[^\\n]{0,40}\\b${escaped}\\b`,
      "i"
    ).test(haystack);
    return authorHit || spokenHit;
  });
}

export function sourceAuthorityTier(source: {
  sourceType: string;
  title?: string | null;
  body?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  prdPageUrls?: string[];
}): SourceAuthorityTier {
  if (isTranscriptSource(source)) return "transcript";
  if (source.sourceType === "jira") return "jira";
  if (source.sourceType === "confluence") {
    if (looksLikePrdTitle(source.title)) return "prd";
    const url = source.url?.trim() ?? "";
    const pageId =
      typeof source.metadata?.pageId === "string"
        ? source.metadata.pageId
        : typeof source.metadata?.id === "string"
          ? source.metadata.id
          : null;
    const prdUrls = source.prdPageUrls ?? [];
    if (
      prdUrls.some(
        (prdUrl) =>
          (url && prdUrl.includes(url)) ||
          (url && url.includes(prdUrl)) ||
          (pageId != null && prdUrl.includes(`/pages/${pageId}`))
      )
    ) {
      return "prd";
    }
    return "confluence";
  }
  return "other";
}

/** Higher = more authoritative for action instructions. */
export const AUTHORITY_TIER_RANK: Record<SourceAuthorityTier, number> = {
  transcript: 4,
  jira: 3,
  prd: 2,
  confluence: 1,
  other: 0,
};

function sourceTime(source: { sourceDate: string }): number {
  const time = new Date(source.sourceDate).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Per-task freshness window: sources older than this (vs the task's newest signal) are ignored. */
export const TASK_SOURCE_FRESHNESS_WINDOW_DAYS = 5;
export const TASK_SOURCE_FRESHNESS_WINDOW_MS =
  TASK_SOURCE_FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Keeps only sources within 5 days of the newest source for the task.
 * With no valid dates, everything is kept.
 */
export function filterFreshTaskSources<T extends { sourceDate: string }>(
  sources: T[]
): T[] {
  const newest = Math.max(0, ...sources.map(sourceTime));
  if (newest === 0) return sources;
  return sources.filter(
    (source) => newest - sourceTime(source) <= TASK_SOURCE_FRESHNESS_WINDOW_MS
  );
}

/**
 * Deterministic ranking boost for queue/focus scoring.
 */
/** Force-include boost for commitments from meetings the user attended in the last 4 days. */
export const ATTENDED_TRANSCRIPT_COMMITMENT_BOOST = 600;

export function sourceAuthorityScoreBoost(
  sources: {
    sourceType: SourceType | string;
    sourceDate: string;
    title?: string | null;
    body?: string | null;
    author?: string | null;
    url?: string | null;
    metadata?: Record<string, unknown> | null;
  }[],
  options?: { prdPageUrls?: string[]; attendance?: AttendanceContext }
): { score: number; notes: string[]; forceInclude: boolean } {
  if (sources.length === 0) return { score: 0, notes: [], forceInclude: false };

  let score = 0;
  const notes: string[] = [];
  const prdPageUrls = options?.prdPageUrls ?? [];
  let forceInclude = false;

  const transcripts = sources.filter((source) => isTranscriptSource(source));
  if (transcripts.length > 0) {
    score += 180;
    notes.push("Meeting transcript instruction");

    if (options?.attendance) {
      const attendedRecently = transcripts.some((source) =>
        isRecentAttendedTranscript(source, options.attendance as AttendanceContext)
      );
      if (attendedRecently) {
        score += ATTENDED_TRANSCRIPT_COMMITMENT_BOOST;
        forceInclude = true;
        notes.push(
          `Committed in a meeting you attended in the last ${ATTENDED_TRANSCRIPT_COMMITMENT_WINDOW_DAYS} days`
        );
      }
    }

    const stakeholderTranscript = transcripts.find((source) =>
      hasHighAuthorityStakeholderInstruction(source)
    );
    if (stakeholderTranscript) {
      score += 160;
      notes.push(
        `Explicit instruction from ${HIGH_AUTHORITY_STAKEHOLDERS.join(" or ")}`
      );
    }

    const newestTranscript = Math.max(...transcripts.map(sourceTime));
    if (newestTranscript > 0) {
      const ageHours = (Date.now() - newestTranscript) / (1000 * 60 * 60);
      if (ageHours <= 48) {
        score += 140;
        notes.push("Fresh transcript in last 48h");
      } else if (ageHours <= 168) {
        score += 70;
        notes.push("Recent transcript this week");
      }
    }
  }

  const hasJira = sources.some((source) => source.sourceType === "jira");
  if (hasJira) {
    score += 40;
    notes.push("Linked Jira operational state");
  }

  const hasPrd = sources.some(
    (source) => sourceAuthorityTier({ ...source, prdPageUrls }) === "prd"
  );
  if (hasPrd) {
    score += 20;
    notes.push("PRD / acceptance baseline");
  } else if (sources.some((source) => source.sourceType === "confluence")) {
    score += 10;
    notes.push("Confluence project context");
  }

  return { score, notes, forceInclude };
}

/**
 * Compare two sources for conflict resolution.
 * 1. Stakeholder transcript (Matt/Lucas) beats non-stakeholder sources.
 * 2. Otherwise newer date wins.
 * 3. Tie-break by authority tier.
 */
export function compareSourceAuthority(
  a: Pick<SourceItem, "sourceType" | "sourceDate" | "title" | "body" | "url" | "metadata"> & {
    author?: string | null;
  },
  b: Pick<SourceItem, "sourceType" | "sourceDate" | "title" | "body" | "url" | "metadata"> & {
    author?: string | null;
  },
  options?: { prdPageUrls?: string[] }
): number {
  const aStakeholder =
    isTranscriptSource(a) && hasHighAuthorityStakeholderInstruction(a);
  const bStakeholder =
    isTranscriptSource(b) && hasHighAuthorityStakeholderInstruction(b);
  if (aStakeholder !== bStakeholder) return aStakeholder ? 1 : -1;

  const aTime = sourceTime(a);
  const bTime = sourceTime(b);
  if (aTime !== bTime) return aTime - bTime;

  const aTier = AUTHORITY_TIER_RANK[sourceAuthorityTier({ ...a, prdPageUrls: options?.prdPageUrls })];
  const bTier = AUTHORITY_TIER_RANK[sourceAuthorityTier({ ...b, prdPageUrls: options?.prdPageUrls })];
  return aTier - bTier;
}

export function isIncomingSourceAuthoritative(input: {
  incoming: Pick<SourceItem, "sourceType" | "sourceDate" | "title" | "body" | "url" | "metadata"> & {
    author?: string | null;
  };
  existingEvidenceDates: string[];
  existingSources?: (Pick<
    SourceItem,
    "sourceType" | "sourceDate" | "title" | "body" | "url" | "metadata"
  > & { author?: string | null })[];
}): boolean {
  const newestExisting = input.existingEvidenceDates
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0] ?? 0;
  const incomingTime = sourceTime(input.incoming);

  // Per-task freshness window: information older than 5 days vs the task's
  // newest signal never updates the task — regardless of who said it.
  if (
    newestExisting > 0 &&
    incomingTime > 0 &&
    newestExisting - incomingTime > TASK_SOURCE_FRESHNESS_WINDOW_MS
  ) {
    return false;
  }

  const existing = input.existingSources ?? [];
  if (existing.length === 0) {
    return incomingTime >= newestExisting;
  }

  // Only fresh existing sources participate in the conflict comparison —
  // stale ones no longer speak for the task.
  const freshExisting = filterFreshTaskSources(
    incomingTime > 0 ? [...existing, input.incoming] : [...existing]
  ).filter((source) => source !== input.incoming);

  return freshExisting.every(
    (source) => compareSourceAuthority(input.incoming, source) >= 0
  );
}
