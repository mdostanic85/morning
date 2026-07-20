import "server-only";
import { bearerFetch } from "./auth";
import type { ConnectorSourceCandidate } from "./types";
import type { ShouldCancelSync } from "@/lib/imports/syncCancellation";

interface CalendarDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface CalendarPerson {
  email?: string;
  displayName?: string;
  self?: boolean;
  responseStatus?: string;
}

interface CalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  location?: string;
  updated?: string;
  start?: CalendarDateTime;
  end?: CalendarDateTime;
  attendees?: CalendarPerson[];
  organizer?: CalendarPerson;
}

interface CalendarEventsResponse {
  items?: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
  error?: { message?: string; code?: number };
}

function eventTime(value: CalendarDateTime | undefined): string | null {
  return value?.dateTime ?? value?.date ?? null;
}

function personLabel(person: CalendarPerson): string {
  return person.displayName?.trim() || person.email?.trim() || "Unknown attendee";
}

function eventOverlapsToday(event: CalendarEvent, todayStart: Date, todayEnd: Date): boolean {
  const startsAt = eventTime(event.start);
  if (!startsAt) return false;
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return false;
  return startMs >= todayStart.getTime() && startMs < todayEnd.getTime();
}

function eventToCandidate(event: CalendarEvent): ConnectorSourceCandidate {
  const startsAt = eventTime(event.start);
  const endsAt = eventTime(event.end);
  const attendees = (event.attendees ?? [])
    .filter((person) => !person.self)
    .map(personLabel);
  const organizer = event.organizer ? personLabel(event.organizer) : null;

  return {
    sourceType: "calendar" as const,
    sourceExternalId: event.id,
    title: event.summary?.trim() || "Untitled meeting",
    body: [
      startsAt ? `Start: ${startsAt}` : null,
      endsAt ? `End: ${endsAt}` : null,
      organizer ? `Organizer: ${organizer}` : null,
      attendees.length > 0 ? `Attendees: ${attendees.join(", ")}` : null,
      event.location ? `Location: ${event.location}` : null,
      event.status === "cancelled" ? "Status: cancelled" : null,
      event.description?.trim() || null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    author: organizer,
    sourceDate: event.updated ?? startsAt ?? new Date().toISOString(),
    url: event.hangoutLink ?? event.htmlLink ?? null,
    metadata: {
      startsAt,
      endsAt,
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
      attendees,
      organizer,
      meetUrl: event.hangoutLink ?? null,
      calendarUrl: event.htmlLink ?? null,
      location: event.location ?? null,
      status: event.status ?? null,
    },
  };
}

export class CalendarSyncTokenExpiredError extends Error {
  override name = "CalendarSyncTokenExpiredError";
}

export async function fetchCalendarEventsIncremental(input?: {
  syncToken?: string | null;
  shouldCancel?: ShouldCancelSync;
}): Promise<{
  candidates: ConnectorSourceCandidate[];
  nextSyncToken: string | null;
  syncTokenExpired: boolean;
}> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "250");

  if (input?.syncToken) {
    url.searchParams.set("syncToken", input.syncToken);
  } else {
    url.searchParams.set("timeMin", todayStart.toISOString());
    url.searchParams.set("timeMax", todayEnd.toISOString());
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  }

  const events: CalendarEvent[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    if (input?.shouldCancel && (await input.shouldCancel())) break;
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await bearerFetch("calendar", url.toString());
    const body = (await response.json()) as CalendarEventsResponse;
    if (response.status === 410 || body.error?.code === 410) {
      return { candidates: [], nextSyncToken: null, syncTokenExpired: true };
    }
    if (!response.ok) {
      throw new Error(body.error?.message ?? "Google Calendar sync failed.");
    }

    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken ?? null;
    nextSyncToken = body.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  const candidates = events
    .filter((event) => {
      if (input?.syncToken) return eventOverlapsToday(event, todayStart, todayEnd);
      return event.status !== "cancelled";
    })
    .map(eventToCandidate);

  return { candidates, nextSyncToken, syncTokenExpired: false };
}

/** @deprecated Use fetchCalendarEventsIncremental */
export async function fetchTodayCalendarEvents(): Promise<ConnectorSourceCandidate[]> {
  const result = await fetchCalendarEventsIncremental();
  return result.candidates;
}
