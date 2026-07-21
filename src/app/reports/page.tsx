import Link from "next/link";
import { ArrowRightIcon, Clock3Icon } from "lucide-react";
import { AppBadge } from "@/components/AppBadge";
import { HydraRunNowButton } from "@/components/HydraRunNowButton";
import { HydraRunStatus } from "@/components/HydraRunStatus";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { listHydraRuns } from "@/services/hydra";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const runs = await listHydraRuns({ status, limit: 100 });
  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <SettingsBackLink section="Report history" />
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em]">
            Report history
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Every scheduled and manual brief run, with its source coverage, state, and reproducible
            evidence snapshot.{" "}
            <Link href="/schedule" className="text-accent hover:underline">
              Automated briefs
            </Link>
          </p>
        </div>
        <HydraRunNowButton />
      </header>
      <div className="flex flex-wrap gap-2">
        {["all", "completed", "partial", "failed"].map((filter) => {
          const selected = (!status && filter === "all") || status === filter;
          return (
            <Link key={filter} href={filter === "all" ? "/reports" : `/reports?status=${filter}`}>
              <AppBadge
                tone={selected ? "accent" : "neutral"}
                className="cursor-pointer px-3 capitalize"
              >
                {filter}
              </AppBadge>
            </Link>
          );
        })}
      </div>
      {runs.length === 0 ? (
        <div className="app-card p-8 text-center">
          <p className="font-display text-xl font-semibold">No brief runs yet</p>
          <p className="mt-2 text-sm text-muted">Run a brief now or set a weekday schedule.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <HydraRunNowButton />
            <Link href="/schedule" className="link-btn-outline motion-btn">
              Set schedule
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">{runs.map((run) => (
          <Link key={run.id} href={`/reports/${run.id}`} className="group grid gap-4 rounded-surface border border-border bg-surface px-5 py-4 transition hover:border-border-strong sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-sm text-muted-soft">#{run.id}</span><span className="text-sm capitalize text-muted">{run.runType}</span></div><p className="mt-1 truncate font-medium">{run.error ?? `${run.evidenceCount} evidence items captured`}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Clock3Icon className="size-3.5" />{new Date(run.scheduledFor.replace(/\[.+\]$/, "")).toLocaleString()}</p></div>
            <HydraRunStatus status={run.status} compact />
            <ArrowRightIcon className="hidden size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
          </Link>
        ))}</div>
      )}
    </div>
  );
}
