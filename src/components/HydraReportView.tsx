import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import type { HydraReport } from "@/domain/hydraReport";
import type { HydraEvidence } from "@/services/hydra";
import { AppBadge } from "./AppBadge";
import { HydraRunStatus } from "./HydraRunStatus";

function EvidenceLinks({ ids, evidence }: { ids: string[]; evidence: HydraEvidence[] }) {
 const byId = new Map(evidence.map((item) => [`ev_${item.id}`, item]));
 return (
 <div className="flex flex-wrap gap-1.5">
 {ids.map((id) => {
 const item = byId.get(id);
 if (!item) return null;
 return item.url ? (
 <a key={id} href={item.url} target="_blank" rel="noopener noreferrer" title={item.title}>
 <AppBadge tone="neutral" className="hover:border-accent/40 hover:text-accent cursor-pointer">
 {item.source} · {id}
 <ExternalLinkIcon className="size-3.5" />
 </AppBadge>
 </a>
 ) : (
 <AppBadge key={id} tone="neutral">
 {item.source} · {id}
 </AppBadge>
 );
 })}
 </div>
 );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
 return (
 <section className="app-card p-5 sm:p-6">
 <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
 <div className="horizon my-4" />
 {children}
 </section>
 );
}

export function HydraReportView({ report, evidence, status }: { report: HydraReport; evidence: HydraEvidence[]; status: string }) {
 return (
 <div className="space-y-4">
 <section className="relative overflow-hidden rounded-surface border border-accent/25 bg-surface p-6 sm:p-8">
 <div className="absolute inset-y-0 left-0 w-1 bg-[linear-gradient(180deg,var(--gradient-magenta),var(--gradient-violet),var(--gradient-indigo),var(--gradient-blue),var(--gradient-cyan),transparent)]" />
 <div className="flex flex-wrap items-center justify-between gap-3">
 <p className="eyebrow text-accent">Today first</p>
 <HydraRunStatus status={status} compact />
 </div>
 <h1 className="mt-4 max-w-4xl font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{report.todayFirst.title}</h1>
 <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">{report.todayFirst.reason}</p>
 <div className="mt-6 grid gap-4 border-t border-border pt-5 md:grid-cols-2">
 <div><p className="eyebrow">Next step</p><p className="mt-2 text-sm leading-relaxed">{report.todayFirst.nextStep}</p></div>
 <div><p className="eyebrow">Done when</p><p className="mt-2 text-sm leading-relaxed">{report.todayFirst.doneWhen}</p></div>
 </div>
 <div className="mt-5"><EvidenceLinks ids={report.todayFirst.evidenceIds} evidence={evidence} /></div>
 </section>

 {report.afterThat.length > 0 ? (
 <Section title="After that">
 <ol className="divide-y divide-border">
 {report.afterThat.map((item, index) => (
 <li key={`${item.title}-${index}`} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[2rem_minmax(0,1fr)]">
 <span className="font-mono text-sm text-accent">0{index + 1}</span>
 <div><h3 className="font-medium">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{item.nextStep}</p><div className="mt-3"><EvidenceLinks ids={item.evidenceIds} evidence={evidence} /></div></div>
 </li>
 ))}
 </ol>
 </Section>
 ) : null}

 <div className="grid gap-4 lg:grid-cols-2">
 {report.directInstructions.length > 0 ? (
 <Section title="Directly told to you">
 <ul className="space-y-4">{report.directInstructions.map((item, index) => <li key={index}><p className="font-medium">{item.instruction}</p><p className="mt-1 text-xs text-muted">{item.author} · {new Date(item.occurredAt).toLocaleString()}</p><div className="mt-2"><EvidenceLinks ids={item.evidenceIds} evidence={evidence} /></div></li>)}</ul>
 </Section>
 ) : null}
 {report.blockers.length > 0 ? (
 <Section title="Blocked / waiting for a decision">
 <ul className="space-y-4">{report.blockers.map((item, index) => <li key={index} className="rounded-xl border border-waiting/25 bg-waiting/8 p-4"><p className="font-medium text-waiting">{item.title}</p><p className="mt-2 text-sm text-muted">Waiting on {item.waitingOn}</p><p className="mt-2 text-sm">{item.question}</p><div className="mt-3"><EvidenceLinks ids={item.evidenceIds} evidence={evidence} /></div></li>)}</ul>
 </Section>
 ) : null}
 </div>

 {report.jiraState.length > 0 ? (
 <Section title="Jira state · unfinished UATL">
 <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="pb-3">Issue</th><th className="pb-3">Status</th><th className="pb-3">Evidence</th></tr></thead><tbody className="divide-y divide-border">{report.jiraState.map((item) => <tr key={item.key}><td className="py-3 pr-4"><p className="font-mono text-accent">{item.key}</p><p className="mt-1">{item.title}</p>{item.outdated ? <p className="mt-1 inline-flex items-center gap-1 text-xs text-waiting"><AlertTriangleIcon className="size-3" /> possible outdated state</p> : null}</td><td className="py-3 pr-4">{item.status}</td><td className="py-3"><EvidenceLinks ids={item.evidenceIds} evidence={evidence} /></td></tr>)}</tbody></table></div>
 </Section>
 ) : null}

 {report.conflicts.length > 0 ? <Section title="Source conflicts"><ul className="space-y-4">{report.conflicts.map((item, index) => <li key={index} className="rounded-xl border border-danger/20 bg-danger/6 p-4"><p className="font-medium">{item.title}</p><p className="mt-2 text-sm">Planning uses: {item.winningInstruction}</p><p className="mt-1 text-sm text-muted">{item.reason}</p><div className="mt-3"><EvidenceLinks ids={item.evidenceIds} evidence={evidence} /></div></li>)}</ul></Section> : null}
 {report.suggestedMessage ? <Section title="Suggested message"><blockquote className="border-l-2 border-accent pl-4 text-sm leading-relaxed text-muted">{report.suggestedMessage}</blockquote></Section> : null}
 {report.figmaAudit ? <Section title="Preliminary Figma audit"><div className="flex items-start gap-3"><span className="text-xl" aria-hidden>{report.figmaAudit.status === "green" ? "🟢" : report.figmaAudit.status === "red" ? "🔴" : "🟡"}</span><div><p className="font-medium">{report.figmaAudit.summary}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">{report.figmaAudit.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul><a href={report.figmaAudit.nodeUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">Open exact node <ExternalLinkIcon className="size-3" /></a></div></div></Section> : null}

 <Section title="Run coverage">
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{report.runSummary.sourceStatus.map((source) => <div key={source.provider} className="rounded-xl border border-border bg-surface-soft p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{source.provider}</span><span className={source.status === "connected" ? "text-xs text-good" : "text-xs text-waiting"}>{source.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-muted">{source.lastSuccessfulSyncAt ? `Last sync ${new Date(source.lastSuccessfulSyncAt).toLocaleString()}` : "No successful sync recorded"}</p>{source.warnings[0] ? <p className="mt-2 text-xs text-waiting">{source.warnings[0]}</p> : null}</div>)}</div>
 <p className="mt-4 text-xs text-muted">{report.runSummary.evidenceCount} evidence items · config v{report.runSummary.configVersion} · prompt {report.runSummary.promptVersion}</p>
 </Section>
 </div>
 );
}
