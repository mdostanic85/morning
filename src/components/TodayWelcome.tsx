import Link from "next/link";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";

interface TodayWelcomeProps {
  dateLabel: string;
  greeting: string;
  connectedProviderLabels: string[];
}

export function TodayWelcome({
  dateLabel,
  greeting,
  connectedProviderLabels,
}: TodayWelcomeProps) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col justify-center py-8">
      <p className="eyebrow">{dateLabel}</p>
      <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
        {greeting}.
      </h1>
      <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
        Sync pulls meeting notes, Jira, and other signals from your connected
        sources into Today.
      </p>
      {connectedProviderLabels.length > 0 ? (
        <p className="mt-3 text-[13px] text-muted-soft">
          Will sync: {connectedProviderLabels.join(" · ")}
        </p>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          No sources connected yet.{" "}
          <Link href="/settings" className="text-accent underline-offset-2 hover:underline">
            Connect sources
          </Link>{" "}
          (Atlassian MCP, Gmail, Granola) to pull meeting notes and work signals.
        </p>
      )}
      <div className="mt-8">
        <SyncMyDayButton sources={connectedProviderLabels} />
      </div>
    </div>
  );
}
