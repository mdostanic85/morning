import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { HydraReportView } from "@/components/HydraReportView";
import { HydraRunRail, HydraRunStatus } from "@/components/HydraRunStatus";
import { ReportFeedback } from "@/components/ReportFeedback";
import {
  getDeliveriesForReport,
  getHydraEvidence,
  getHydraReportByRunId,
  getHydraRun,
} from "@/services/hydra";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = Number(id);
  const run = Number.isInteger(runId) ? await getHydraRun(runId) : null;
  if (!run) notFound();
  const report = await getHydraReportByRunId(runId);
  const evidence = await getHydraEvidence(runId);
  const deliveries = report ? await getDeliveriesForReport(report.id) : [];
  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent"><ArrowLeftIcon className="size-4" /> Back to reports</Link>
      <header className="app-card space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{run.runType} run · #{run.id}</p><h1 className="mt-2 font-display text-2xl font-semibold">{new Date(run.createdAt).toLocaleString()}</h1></div><HydraRunStatus status={run.status} /></div>
        <HydraRunRail status={run.status} />
        <div className="grid gap-3 text-xs text-muted sm:grid-cols-3"><p>Evidence <span className="text-foreground">{run.evidenceCount}</span></p><p>Model <span className="text-foreground">{run.modelProvider ?? "—"} / {run.modelName ?? "—"}</span></p><p>Config snapshot <span className="text-foreground">v{String((run.configSnapshot as { configVersion?: number }).configVersion ?? "—")}</span></p></div>
        {run.warnings.length > 0 ? <details className="rounded-xl border border-waiting/25 bg-waiting/8 p-4"><summary className="cursor-pointer text-sm font-medium text-waiting">{run.warnings.length} source warning{run.warnings.length === 1 ? "" : "s"}</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
        {run.error ? <p className="rounded-xl border border-danger/25 bg-danger/8 p-4 text-sm text-danger">{run.error}</p> : null}
      </header>
      {report ? <HydraReportView report={report.structuredJson} evidence={evidence} status={run.status} /> : <div className="app-card p-6"><p className="font-medium">The report was not produced.</p><p className="mt-2 text-sm text-muted">The run metadata and source warnings above explain where it stopped.</p></div>}
      {report ? <div className="app-card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><ReportFeedback reportId={report.id} /><div className="text-xs text-muted">Delivery: {deliveries.map((item) => `${item.channel} ${item.status}`).join(" · ") || "in-app"} · citation coverage {Math.round(report.citationCoverage * 100)}%</div></div> : null}
      {evidence.length > 0 ? <details className="app-card p-5"><summary className="cursor-pointer font-medium">Evidence snapshot ({evidence.length})</summary><div className="mt-4 space-y-3">{evidence.map((item) => <article key={item.id} className="rounded-xl border border-border bg-surface-soft p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.title}</p><span className="font-mono text-xs text-accent">ev_{item.id} · score {item.score}</span></div><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted">{item.content}</p><p className="mt-2 text-xs text-muted-soft">{item.source} · {item.author ?? "Unknown author"} · {new Date(item.occurredAt).toLocaleString()}</p>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">Open original source</a> : null}</article>)}</div></details> : null}
    </div>
  );
}
