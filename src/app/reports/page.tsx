import Link from "next/link";
import { ArrowRightIcon, Clock3Icon } from "lucide-react";
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
            Report ledger
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Every scheduled and manual run, with its source coverage, state, and reproducible
            evidence snapshot.{" "}
            <Link href="/schedule" className="text-accent hover:underline">
              Schedule
            </Link>
          </p>
        </div>
        <HydraRunNowButton />
      </header>
      <div className="flex flex-wrap gap-2">
        {["all", "completed", "partial", "failed"].map((filter) => (
          <Link key={filter} href={filter === "all" ? "/reports" : `/reports?status=${filter}`} className={`tag border px-3 ${(!status && filter === "all") || status === filter ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-surface text-muted"}`}>{filter}</Link>
        ))}
      </div>
      {runs.length === 0 ? (
        <div className="app-card p-8 text-center"><p className="font-display text-xl font-semibold">No matching runs yet</p><p className="mt-2 text-sm text-muted">Run Hydra now or wait for the next weekday schedule.</p></div>
      ) : (
        <div className="space-y-2">{runs.map((run) => (
          <Link key={run.id} href={`/reports/${run.id}`} className="group grid gap-4 rounded-surface border border-border bg-surface px-5 py-4 transition hover:border-border-strong sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-soft">#{run.id}</span><span className="text-xs capitalize text-muted">{run.runType}</span></div><p className="mt-1 truncate font-medium">{run.error ?? `${run.evidenceCount} evidence items captured`}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><Clock3Icon className="size-3" />{new Date(run.scheduledFor.replace(/\[.+\]$/, "")).toLocaleString()}</p></div>
            <HydraRunStatus status={run.status} compact />
            <ArrowRightIcon className="hidden size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
          </Link>
        ))}</div>
      )}
    </div>
  );
}
