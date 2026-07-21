import { ExternalLink } from "lucide-react";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";
import { AppBadge } from "@/components/AppBadge";
import { cn } from "@/lib/utils";

interface TodayMeetingsCardProps {
  meetings: TodayMeeting[];
  calendarConnected: boolean;
}

function formatTimeRange(meeting: TodayMeeting): string {
  if (meeting.allDay || !meeting.startsAt) return "All day";
  const start = new Date(meeting.startsAt);
  if (Number.isNaN(start.getTime())) return "All day";

  const startLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!meeting.endsAt) return startLabel;
  const end = new Date(meeting.endsAt);
  if (Number.isNaN(end.getTime())) return startLabel;

  return `${startLabel} – ${end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function isMeetingEnded(meeting: TodayMeeting, now = Date.now()): boolean {
  if (meeting.allDay) return false;
  if (!meeting.endsAt) return false;
  const end = Date.parse(meeting.endsAt);
  return Number.isFinite(end) && end < now;
}

export function TodayMeetingsCard({ meetings, calendarConnected }: TodayMeetingsCardProps) {
  const sorted = [...meetings].sort((a, b) => {
    const aTime = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
    const bTime = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  return (
    <section className="app-card flex flex-col px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium tracking-tight text-foreground">
          Today&apos;s meetings
        </h2>
        <a
          href="https://calendar.google.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong"
        >
          Calendar
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>

      {!calendarConnected ? (
        <div className="mt-5 flex flex-col items-center justify-center py-4 text-center">
          <p className="text-sm font-medium text-foreground">Calendar not connected</p>
          <p className="mt-1 text-sm text-muted">
            Connect Google Calendar in Settings, then Sync my day.
          </p>
          <a
            href="/settings"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Open Settings
          </a>
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-5 flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm font-medium text-foreground">No meetings today</p>
          <p className="mt-1 text-sm text-muted">Protect the day for focused work.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {sorted.map((meeting) => {
            const href = meeting.meetUrl || meeting.url;
            const ended = isMeetingEnded(meeting);
            const content = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      ended ? "text-muted-soft" : "text-muted"
                    )}
                  >
                    {formatTimeRange(meeting)}
                  </span>
                  {ended ? <AppBadge tone="neutral">Ended</AppBadge> : null}
                  {!ended && meeting.hydraRelated ? (
            <AppBadge tone="sky">Work scope</AppBadge>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 text-sm font-medium leading-snug",
                    ended ? "text-muted-soft" : "text-foreground"
                  )}
                >
                  {meeting.title}
                </p>
                {meeting.location ? (
                  <p className="mt-0.5 text-sm text-muted-soft">{meeting.location}</p>
                ) : null}
              </>
            );

            return (
              <li key={meeting.id}>
                {href && !ended ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[var(--radius)] border border-border bg-surface-soft/40 px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-soft"
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    className={cn(
                      "rounded-[var(--radius)] border border-border px-3.5 py-3",
                      ended
                        ? "border-border/70 bg-surface-soft/25 opacity-60"
                        : "bg-surface-soft/40"
                    )}
                    aria-disabled={ended || undefined}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
