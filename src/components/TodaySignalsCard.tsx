import { ExternalLink } from "lucide-react";
import type { PersonalMentionSignal } from "@/lib/signals/personalMentions";

interface TodaySignalsCardProps {
  meetings: PersonalMentionSignal[];
  jiraTagged: PersonalMentionSignal[];
}

function SignalList({
  heading,
  empty,
  items,
}: {
  heading: string;
  empty: string;
  items: PersonalMentionSignal[];
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-soft">{heading}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {items.map((item) => {
            const content = (
              <>
                <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-muted">{item.excerpt}</p>
                <p className="mt-1 text-sm text-muted-soft">
                  {item.sourceLabel} · {new Date(item.sourceDate).toLocaleDateString()}
                </p>
              </>
            );
            return (
              <li key={item.id}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[0.75rem] bg-surface-soft p-4 no-underline transition-colors hover:bg-surface-soft/80"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="rounded-[0.75rem] bg-surface-soft p-4">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TodaySignalsCard({ meetings, jiraTagged }: TodaySignalsCardProps) {
  if (meetings.length === 0 && jiraTagged.length === 0) return null;

  return (
    <section className="app-card flex flex-col gap-5 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium tracking-tight text-foreground">Also for you</h2>
        <span className="inline-flex items-center gap-1 text-xs text-muted-soft">
          Mentions
          <ExternalLink className="size-3" aria-hidden />
        </span>
      </div>

      <SignalList
        heading="Mentioned in meetings"
        empty="No recent meeting mentions of you."
        items={meetings}
      />
      <SignalList
        heading="Tagged in Jira"
        empty="No recent Jira mentions outside your assignee list."
        items={jiraTagged}
      />
    </section>
  );
}
