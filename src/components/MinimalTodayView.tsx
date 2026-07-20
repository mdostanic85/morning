import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { SourceType } from "@/domain/sourceItem";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { FigmaValidateButton } from "@/components/FigmaValidateButton";
import { priorityExplanationForDisplay } from "@/lib/tasks/priorityExplanation";

interface MinimalTask {
 id: number;
 title: string;
 status: WorkTaskStatus;
 reason: string;
 nextAction: string;
 actionSteps: string[];
 todayWorkSummary: string[];
 priorityExplanation: string | null;
 doneCriteria: string[];
 figmaAudit: {
 summary: string;
 ok: string[];
 notOk: string[];
 conflicts: string[];
 recommendedNextAction: string;
 figmaUrl: string | null;
 } | null;
 confidence: number | null;
 waitingOn: string | null;
 updatedAt: string;
 evidence: {
 summary: string;
 sourceDate: string;
 url: string | null;
 sourceTitle: string;
 sourceType: SourceType | null;
 }[];
}

interface MinimalTodayViewProps {
 tasks: MinimalTask[];
 connectedProviderLabels: string[];
 sourceCount: number;
 lastSyncAt: string | null;
 profileReady: boolean;
 primarySummary: string | null;
 primaryWhyFirst: string | null;
 primarySubtasks: { label: string; agreed: string | null }[];
}

function relativeTime(value: string): string {
 const timestamp = new Date(value).getTime();
 if (Number.isNaN(timestamp)) return "recently";
 const hours = Math.max(0, Math.round((Date.now() - timestamp) / 3_600_000));
 if (hours < 1) return "less than 1h ago";
 if (hours < 24) return `${hours}h ago`;
 return `${Math.round(hours / 24)}d ago`;
}

function latestEvidenceDate(task: MinimalTask): string {
 const dates = task.evidence
 .map((item) => new Date(item.sourceDate).getTime())
 .filter((time) => !Number.isNaN(time));
 if (dates.length === 0) return task.updatedAt;
 return new Date(Math.max(...dates)).toISOString();
}

function syncLabel(value: string | null): string {
 if (!value) return "Not synced yet";
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return "Last sync available";
 return `Synced ${date.toLocaleTimeString(undefined, {
 hour: "2-digit",
 minute: "2-digit",
 })}`;
}

function confidenceBadge(task: MinimalTask): string | null {
 if (task.confidence == null) return null;
 return `Source confidence ${Math.round(task.confidence * 100)}%`;
}

function isJiraTask(task: MinimalTask): boolean {
 return task.evidence.some((item) => item.sourceType === "jira");
}

function taskLabel(task: MinimalTask): "Verify" | "Waiting" | "Later" {
 if (task.status === "waiting" || task.waitingOn) return "Waiting";
 if (task.status === "unclear") return "Verify";
 return "Later";
}

function taskCardDescription(task: MinimalTask): string {
 if (task.status === "waiting" || task.waitingOn) {
 return task.waitingOn
 ? `Relevant today, but no action is required until ${task.waitingOn} responds.`
 : task.reason;
 }
 return task.reason;
}

function SecondaryTaskCard({ task }: { task: MinimalTask }) {
 const label = taskLabel(task);
 const summary = taskCardDescription(task);
 return (
 <Link
 href={`/tasks/${task.id}`}
 className="group relative flex items-start gap-4 rounded-[14px] border border-border bg-surface px-4 py-3.5 pr-10 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--panel-hover-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
 >
 <div className="min-w-0 flex-1">
 <strong className="block text-[15px] font-semibold leading-snug tracking-[-0.01em]">
 {task.title}
 </strong>
 <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{summary}</p>
 <div className="mt-2 flex flex-wrap gap-1.5">
 <span className={`minimal-badge minimal-badge-${label.toLowerCase()}`}>{label}</span>
 {confidenceBadge(task) ? (
 <span className="minimal-badge minimal-badge-confidence">{confidenceBadge(task)}</span>
 ) : null}
 </div>
 </div>
 <ArrowRight className="absolute right-3 top-4 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
 </Link>
 );
}

export function MinimalTodayView({
 tasks,
 connectedProviderLabels,
 sourceCount,
 lastSyncAt,
 profileReady,
 primarySummary,
 primaryWhyFirst,
 primarySubtasks,
}: MinimalTodayViewProps) {
 const primary = tasks[0] ?? null;
 const otherTasks = tasks.slice(1);

 const subtasks =
 primarySubtasks.length > 0
 ? primarySubtasks
 : (primary?.doneCriteria ?? []).map((label) => ({ label, agreed: null }));

 const heroTitle = primary
 ? "One task needs you first"
 : lastSyncAt
 ? "All clear"
 : "Nothing queued yet";
 const nextUpSentence = (() => {
 if (otherTasks.length === 0) {
 return "Nothing else is competing for your attention right now.";
 }
 const count = otherTasks.length;
 return `${count === 1 ? "One more priority follows" : `${count} more priorities follow`} once it's moving.`;
 })();
 const heroLead = primary
 ? `Start with "${primary.title}". ${nextUpSentence}`
 : lastSyncAt
 ? "Nothing from the latest sync requires your attention. Sync again when you want a fresh check."
 : "Sync your day to pull fresh evidence from your sources and build today’s priority order.";

 const primaryDescription = primary ? primarySummary || primary.reason : "";
 const priorityExplanation = priorityExplanationForDisplay(
 primaryWhyFirst || primary?.priorityExplanation || ""
 );
 // Never repeat the description verbatim in the "Why first" row.
 const whyFirst = primary
 ? priorityExplanation && priorityExplanation !== primaryDescription
 ? priorityExplanation
 : primary.reason !== primaryDescription
 ? primary.reason
 : "This is the first task in the current queue, but its priority reason needs more source detail."
 : "";
 const primaryEvidence = primary?.evidence[0] ?? null;

 return (
 <div className="minimal-today">
 <section className="minimal-hero">
 <div className="minimal-eyebrow ft-eyebrow"><span aria-hidden />Today</div>
 <div className="flex flex-wrap items-start justify-between gap-5">
 <div>
 <h1 className="ft-hero-title">{heroTitle}</h1>
 <p className="ft-hero-lead">{heroLead}</p>
 </div>
 <SyncMyDayButton sources={connectedProviderLabels} lastSyncAt={lastSyncAt} />
 </div>
 <div className="minimal-meta ft-meta">
 <span>{syncLabel(lastSyncAt)}</span>
 <span>{sourceCount} sources checked</span>
 <span>{tasks.length} {tasks.length === 1 ? "priority" : "priorities"} selected</span>
 </div>
 </section>

 {!profileReady ? (
 <p className="ft-body mb-5 rounded-2xl border border-danger/35 bg-danger-soft-surface px-5 py-4 text-muted">
 Add your name in Settings so priorities can be filtered to your work.
 </p>
 ) : null}

 {primary ? (
 <section className="flex flex-col gap-4">
 <Link href={`/tasks/${primary.id}`} className="minimal-urgent-card">
 <div className="flex flex-wrap gap-[7px] pr-14">
 <span className="minimal-badge minimal-badge-urgent">Urgent</span>
 {isJiraTask(primary) ? (
 <span className="minimal-badge minimal-badge-jira">Jira</span>
 ) : null}
 {confidenceBadge(primary) ? (
 <span className="minimal-badge minimal-badge-confidence">{confidenceBadge(primary)}</span>
 ) : null}
 </div>
 <span className="minimal-card-arrow"><ArrowRight className="size-5" /></span>
 <div className="minimal-urgent-content">
 <h2 className="ft-display">{primary.title}</h2>
 <div className="mt-5">
 <strong className="block text-xs uppercase tracking-[0.08em] text-accent-strong">
 What you are doing today
 </strong>
 <p className="minimal-urgent-description ft-body-lg mt-2">{primaryDescription}</p>
 </div>
 <div className="minimal-why-first">
 <strong>Why first</strong>
 <span>{whyFirst}</span>
 </div>
 <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/8 p-5">
 <strong className="block text-xs uppercase tracking-[0.08em] text-accent-strong">
 Start here
 </strong>
 <p className="mt-2 text-[16px] font-semibold leading-relaxed">
 {primary.nextAction}
 </p>
 </div>
 <strong className="mt-6 block text-xs uppercase tracking-[0.08em] text-muted">
 Today&apos;s steps
 </strong>
 <div className="minimal-outcomes mt-3" aria-label="Today’s steps">
 {subtasks.slice(0, 4).map(({ label, agreed }) => (
 <div key={label}>
 <span aria-hidden />
 <div>
 <strong>{label}</strong>
 {agreed ? <small>{agreed}</small> : null}
 </div>
 </div>
 ))}
 </div>
 <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
 <div>
 <strong className="block text-xs uppercase tracking-[0.08em] text-muted">
 Done when
 </strong>
 <ul className="mt-2 grid gap-2 text-sm leading-relaxed">
 {primary.doneCriteria.slice(0, 3).map((criterion) => (
 <li key={criterion}>• {criterion}</li>
 ))}
 </ul>
 </div>
 <div>
 <strong className="block text-xs uppercase tracking-[0.08em] text-muted">
 Evidence
 </strong>
 <p className="mt-2 text-sm leading-relaxed text-muted">
 {primaryEvidence?.summary ?? "No supporting evidence is attached."}
 </p>
 <small className="mt-2 block text-muted-soft">
 {primaryEvidence?.sourceTitle ?? "Task queue"}
 </small>
 </div>
 </div>
 {primary.figmaAudit ? (
 <div className="mt-6 rounded-2xl border border-border bg-surface-soft/50 p-5">
 <strong className="block text-xs uppercase tracking-[0.08em] text-accent-strong">
 Figma audit
 </strong>
 <p className="mt-2 text-sm leading-relaxed">{primary.figmaAudit.summary}</p>
 {primary.figmaAudit.notOk[0] ? (
 <p className="mt-3 text-sm leading-relaxed text-muted">
 Biggest gap: {primary.figmaAudit.notOk[0]}
 </p>
 ) : null}
 <p className="mt-2 text-sm font-semibold leading-relaxed">
 Next: {primary.figmaAudit.recommendedNextAction}
 </p>
 </div>
 ) : null}
 <p className="ft-source-meta mt-[22px] text-muted">
 {primary.doneCriteria.length} required outcome{primary.doneCriteria.length === 1 ? "" : "s"} · Highest source updated {relativeTime(latestEvidenceDate(primary))}
 </p>
 </div>
 </Link>

 <div className="flex items-center justify-end gap-2 -mt-1 pr-0.5">
 <FigmaValidateButton
 taskId={primary.id}
 taskTitle={primary.title}
 hasJiraEvidence={isJiraTask(primary)}
 />
 </div>

 {tasks.length > 1 ? (
 <div>
 <p className="mb-2.5 px-0.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-soft">
 Other priorities
 </p>
 <div className="grid gap-2 sm:grid-cols-2">
 {tasks.slice(1).map((task) => (
 <SecondaryTaskCard key={task.id} task={task} />
 ))}
 </div>
 </div>
 ) : null}
 </section>
 ) : (
 <section className="rounded-[28px] border border-border bg-surface p-8">
 {lastSyncAt ? (
 <>
 <h2 className="ft-card-title font-semibold">All clear</h2>
 <p className="ft-body mt-2 text-muted">
 Nothing new needs your attention based on the latest sources.
 Sync again when you want a fresh check.
 </p>
 </>
 ) : (
 <>
 <h2 className="ft-card-title font-semibold">No priorities yet</h2>
 <p className="ft-body mt-2 text-muted">Sync your day to collect evidence and build today&apos;s priority order.</p>
 </>
 )}
 </section>
 )}

 <p className="minimal-foot">
 Important recommendations expose their decisive source and the instructions that created the output.
 {" "}<Link href="/how-ai-works">How AI works</Link>
 </p>
 </div>
 );
}
