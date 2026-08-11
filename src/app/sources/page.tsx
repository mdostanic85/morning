import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { AppBadge } from "@/components/AppBadge";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { getConnections } from "@/services/connections";
import { listHydraRuns } from "@/services/hydra";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

const SOURCES = [
  { key: "granola", connection: "granola", label: "Granola", description: "Meeting notes and transcripts." },
  { key: "calendar", connection: "calendar", label: "Google Calendar", description: "Work events, participants, times, and links." },
  { key: "gmail", connection: "gmail", label: "Gemini notes", description: "Google Meet notes from your Google account." },
  { key: "drive", connection: "drive", label: "Google Drive", description: "Matching meeting notes and supported documents." },
  { key: "jira", connection: "jira", label: "Jira", description: "Assigned issues, comments, status, and blockers." },
  { key: "confluence", connection: "confluence", label: "Confluence", description: "Requirements and linked project pages." },
  { key: "figma", connection: "figma", label: "Figma", description: "Design evidence used to check completed work." },
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
        <Heading level={1} visualLevel={2} className="mt-2">Sources</Heading>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          See whether each source is connected, when it last synced, and whether the latest report
          used it.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SOURCES.map((source) => {
          const connection = byConnection.get(source.connection);
          const health = byHealth.get(source.key);
          const connected = connection?.status === "connected";
          const lastConnectionSync =
            typeof connection?.metadata?.lastSync === "string"
              ? connection.metadata.lastSync
              : null;
          const connectionLabel =
            connection?.status === "error"
              ? "Needs attention"
              : connected
                ? "Connection ready"
                : "Not connected";
          return (
            <section key={source.key} className="app-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Heading level={2} visualLevel={5}>{source.label}</Heading>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{source.description}</p>
                </div>
                <AppBadge tone={connected ? "good" : "neutral"}>
                  {connectionLabel}
                </AppBadge>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-sm text-muted">Report coverage</p>
                <p
                  className={`mt-1 text-sm font-medium ${health?.status === "connected" ? "text-good" : "text-waiting"}`}
                >
                  {health
                    ? health.status.replaceAll("_", " ")
                    : latestRun
                      ? "Not included in the latest report"
                      : "Not checked in a report yet"}
                </p>
                <p className="mt-2 text-metadata text-muted">
                  {health?.lastSuccessfulSyncAt
                    ? `Last successful sync ${new Date(health.lastSuccessfulSyncAt).toLocaleString()}`
                    : lastConnectionSync
                      ? `Last source sync ${new Date(lastConnectionSync).toLocaleString()}`
                      : connected
                        ? "Connected, but no sync time is available yet."
                        : "Connect this source to start syncing."}
                </p>
                {health?.warnings[0] ? (
                  <p className="mt-2 text-metadata text-waiting">{health.warnings[0]}</p>
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
