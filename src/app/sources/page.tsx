import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { AppBadge } from "@/components/AppBadge";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { getConnections } from "@/services/connections";
import { listHydraRuns } from "@/services/hydra";

export const dynamic = "force-dynamic";

const SOURCES = [
  { key: "granola", connection: "granola", label: "Granola", description: "Meetings, notes, transcripts, and capability limits." },
  { key: "calendar", connection: "calendar", label: "Google Calendar", description: "Hydra/ASC events, participants, time, and links." },
  { key: "gmail", connection: "gmail", label: "Gemini notes", description: "Gemini / Google Meet notes delivered through your Google account." },
  { key: "jira", connection: "jira", label: "Jira", description: "Assigned unfinished UATL issues, comments, status, and blockers." },
  { key: "confluence", connection: "confluence", label: "Confluence", description: "PRD, intake, and linked pages within configured scope." },
  { key: "figma", connection: "figma", label: "Figma", description: "Read-only node-specific evidence and preliminary audits." },
];

export default async function SourcesPage() {
  const connections = await getConnections();
  const latestRuns = await listHydraRuns({ limit: 1 });
  const latestRun = latestRuns[0] ?? null;
  const byConnection = new Map(connections.map((item) => [item.provider, item]));
  const byHealth = new Map((latestRun?.sourceHealth ?? []).map((item) => [item.provider, item]));
  return (
    <div className="space-y-7">
      <header>
        <SettingsBackLink section="Source health" />
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em]">Sources</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Connection state and the most recent run-level health are shown separately, so a stale or
          unavailable source cannot look silently complete.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SOURCES.map((source) => {
          const connection = byConnection.get(source.connection);
          const health = byHealth.get(source.key);
          const connected = connection?.status === "connected";
          return (
            <section key={source.key} className="app-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">{source.label}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{source.description}</p>
                </div>
                <AppBadge tone={connected ? "good" : "neutral"}>
                  {connection?.status ?? "not connected"}
                </AppBadge>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm text-muted">Latest run check</p>
                <p
                  className={`mt-1 text-sm font-medium ${health?.status === "connected" ? "text-good" : "text-waiting"}`}
                >
                  {health?.status.replaceAll("_", " ") ?? "No run yet"}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {health?.lastSuccessfulSyncAt
                    ? `Last successful sync ${new Date(health.lastSuccessfulSyncAt).toLocaleString()}`
                    : "No successful sync recorded"}
                </p>
                {health?.warnings[0] ? (
                  <p className="mt-2 text-xs text-waiting">{health.warnings[0]}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      <Link
        href="/settings"
        className="app-card flex items-center justify-between gap-4 p-5 hover:border-border-strong"
      >
        <div>
          <p className="font-medium">Connect, reconnect, or disconnect a source</p>
          <p className="mt-1 text-sm text-muted">Credentials and OAuth controls stay in Settings.</p>
        </div>
        <ArrowRightIcon className="size-4 text-accent" />
      </Link>
    </div>
  );
}
