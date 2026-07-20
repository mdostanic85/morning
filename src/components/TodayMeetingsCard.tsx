import { ExternalLink } from "lucide-react";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";

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

export function TodayMeetingsCard({ meetings, calendarConnected }: TodayMeetingsCardProps) {
  const sorted = [...meetings].sort((a, b) => {
    const aTime = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY;
    const bTime = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });

  return (
    <section className="app-card flex h-full min-h-[12rem] flex-col px-5 py-4">
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
        <div className="mt-5 flex flex-1 flex-col items-center justify-center py-4 text-center">
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
        <div className="mt-5 flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-sm font-medium text-foreground">No meetings today</p>
          <p className="mt-1 text-sm text-muted">Protect the day for focused work.</p>
        </div>
      ) : (
        <ul className="mt-4 flex-1 space-y-2.5 overflow-y-auto">
          {sorted.map((meeting) => {
            const href = meeting.meetUrl || meeting.url;
            const content = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium tabular-nums text-muted">
                    {formatTimeRange(meeting)}
                  </span>
                  {meeting.hydraRelated ? (
                    <span className="minimal-badge minimal-badge-jira !min-h-5 !text-[12px]">
                      Hydra / ASC
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                  {meeting.title}
                </p>
                {meeting.location ? (
                  <p className="mt-0.5 text-xs text-muted-soft">{meeting.location}</p>
                ) : null}
              </>
            );

            return (
              <li key={meeting.id}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[var(--radius)] border border-border bg-surface-soft/40 px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-soft"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="rounded-[var(--radius)] border border-border bg-surface-soft/40 px-3.5 py-3">
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
