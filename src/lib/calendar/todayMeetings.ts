import "server-only";

import { getConnectionByProvider } from "@/services/connections";
import { getSourceItems } from "@/services/sourceItems";
import { fetchTodayCalendarEvents } from "@/lib/connectors/calendar";
import { DEFAULT_HYDRA_CONFIG } from "@/domain/hydraReport";

export interface TodayMeeting {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  url: string | null;
  meetUrl: string | null;
  location: string | null;
  hydraRelated: boolean;
}

function isHydraRelated(title: string, body = ""): boolean {
  const text = `${title}\n${body}`.toLowerCase();
  const needles = [
    "hydra",
    "asc",
    "uatl",
    "cfm",
    "content file",
    DEFAULT_HYDRA_CONFIG.project.toLowerCase(),
    DEFAULT_HYDRA_CONFIG.jiraProject.toLowerCase(),
  ];
  return needles.some((needle) => text.includes(needle));
}

function parseStartsAt(metadata: Record<string, unknown> | null, body: string): string | null {
  if (typeof metadata?.startsAt === "string") return metadata.startsAt;
  const match = body.match(/^Start:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function parseEndsAt(metadata: Record<string, unknown> | null, body: string): string | null {
  if (typeof metadata?.endsAt === "string") return metadata.endsAt;
  const match = body.match(/^End:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function overlapsLocalToday(iso: string | null): boolean {
  if (!iso) return false;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) {
    // All-day date-only (YYYY-MM-DD)
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return iso.slice(0, 10) === local;
  }
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return start.getTime() >= dayStart.getTime() && start.getTime() < dayEnd.getTime();
}

function sortMeetings(a: TodayMeeting, b: TodayMeeting): number {
  if (a.hydraRelated !== b.hydraRelated) return a.hydraRelated ? -1 : 1;
  const aTime = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
  const bTime = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
  return aTime - bTime;
}

/** Timed meetings only — skip all-day markers like "Home" / OOO / birthdays. */
function isTimedMeeting(meeting: TodayMeeting): boolean {
  if (meeting.allDay) return false;
  if (!meeting.startsAt || !meeting.startsAt.includes("T")) return false;
  return true;
}

async function meetingsFromLiveCalendar(): Promise<TodayMeeting[] | null> {
  const connection = await getConnectionByProvider("calendar");
  if (!connection) return null;
  if (connection.status !== "connected" && connection.status !== "error") return null;

  try {
    const candidates = await fetchTodayCalendarEvents();
    if (connection.status === "error") {
      try {
        const { upsertConnection } = await import("@/services/connections");
        const metadata = { ...(connection.metadata ?? {}) };
        delete metadata.error;
        delete metadata.lastErrorAt;
        metadata.recoveredAt = new Date().toISOString();
        await upsertConnection({
          provider: "calendar",
          authType: connection.authType,
          status: "connected",
          scopes: connection.scopes,
          metadata,
        });
      } catch {
        // Live calendar still works; status heal is best-effort.
      }
    }
    return candidates
      .map((item) => {
        const startsAt =
          typeof item.metadata?.startsAt === "string" ? item.metadata.startsAt : null;
        const endsAt = typeof item.metadata?.endsAt === "string" ? item.metadata.endsAt : null;
        return {
          id: item.sourceExternalId ?? item.title,
          title: item.title,
          startsAt,
          endsAt,
          allDay: Boolean(item.metadata?.allDay),
          url:
            (typeof item.metadata?.calendarUrl === "string" ? item.metadata.calendarUrl : null) ??
            item.url ??
            null,
          meetUrl: typeof item.metadata?.meetUrl === "string" ? item.metadata.meetUrl : null,
          location: typeof item.metadata?.location === "string" ? item.metadata.location : null,
          hydraRelated: isHydraRelated(item.title, item.body),
        } satisfies TodayMeeting;
      })
      .filter(isTimedMeeting);
  } catch {
    return null;
  }
}

async function meetingsFromSyncedSources(): Promise<TodayMeeting[]> {
  const sources = await getSourceItems();
  return sources
    .filter((item) => item.sourceType === "calendar")
    .map((item) => {
      const startsAt = parseStartsAt(item.metadata, item.body);
      const endsAt = parseEndsAt(item.metadata, item.body);
      return {
        id: item.sourceExternalId ?? `source-${item.id}`,
        title: item.title,
        startsAt,
        endsAt,
        allDay: Boolean(item.metadata?.allDay) || Boolean(startsAt && !startsAt.includes("T")),
        url:
          (typeof item.metadata?.calendarUrl === "string" ? item.metadata.calendarUrl : null) ??
          item.url,
        meetUrl: typeof item.metadata?.meetUrl === "string" ? item.metadata.meetUrl : null,
        location: typeof item.metadata?.location === "string" ? item.metadata.location : null,
        hydraRelated: isHydraRelated(item.title, item.body),
      } satisfies TodayMeeting;
    })
    .filter((meeting) => overlapsLocalToday(meeting.startsAt) && isTimedMeeting(meeting));
}

export async function getTodayMeetings(): Promise<{
  meetings: TodayMeeting[];
  calendarConnected: boolean;
  source: "live" | "synced" | "none";
}> {
  const connection = await getConnectionByProvider("calendar");
  const live = await meetingsFromLiveCalendar();
  if (live) {
    return {
      meetings: live.sort(sortMeetings),
      calendarConnected: true,
      source: "live",
    };
  }

  const calendarConnected =
    connection?.status === "connected" || connection?.status === "error";
  const synced = await meetingsFromSyncedSources();
  return {
    meetings: synced.sort(sortMeetings),
    calendarConnected: Boolean(calendarConnected && connection?.status === "connected"),
    source: synced.length > 0 ? "synced" : "none",
  };
}
