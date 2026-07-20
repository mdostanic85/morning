import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";

export const dynamic = "force-dynamic";

function confidenceLabel(value: number | null): string {
 if (value == null) return "Not scored";
 if (value >= 0.75) return "High source confidence";
 if (value >= 0.5) return "Medium source confidence";
 return "Low source confidence";
}

function meetingDate(value: string): string {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return new Intl.DateTimeFormat("en", {
 day: "numeric",
 month: "short",
 year: "numeric",
 }).format(date);
}

export default async function TaskDetailPage({
 params,
}: {
 params: Promise<{ id: string }>;
}) {
 const { id } = await params;
 const taskId = Number(id);
 if (!Number.isInteger(taskId)) notFound();

 const [task, sourceItems] = await Promise.all([
 getWorkTaskById(taskId),
 getSourceItems(),
 ]);
 if (!task) notFound();

 const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
 const isJiraTask = task.evidence.some(
 (item) => sourceById.get(item.sourceItemId)?.sourceType === "jira"
 );
 const confidence = task.confidence == null ? null : Math.round(task.confidence * 100);

 return (
 <div className="mx-auto w-full max-w-[77.5rem] py-8 pb-20">
 <nav className="flex items-center gap-2 text-sm font-medium text-muted">
 <Link href="/" className="text-accent-strong hover:underline">Today</Link>
 <span>/</span>
 <strong className="text-foreground">{task.title}</strong>
 </nav>

 <header className="mt-7 grid gap-6 border-b border-border pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
 <div>
 <div className="flex flex-wrap gap-2">
 <span className="minimal-badge minimal-badge-urgent">
 {task.status === "waiting" ? "Waiting" : task.status === "unclear" ? "Verify" : "Priority"}
 </span>
 {isJiraTask ? (
 <span className="minimal-badge minimal-badge-jira">Jira</span>
 ) : null}
 {confidence != null ? (
 <span className="minimal-badge minimal-badge-confidence">Source confidence {confidence}%</span>
 ) : null}
 </div>
 <h1 className="ft-screen-title mt-4 max-w-4xl font-display">{task.title}</h1>
 <div className="mt-4 max-w-3xl">
 <strong className="block text-xs uppercase tracking-[0.08em] text-accent-strong">
 What you are doing
 </strong>
 <p className="ft-screen-lead mt-2 text-muted">{task.reason}</p>
 </div>
 <p className="ft-header-meta mt-3 text-muted-soft">
 {task.doneCriteria.length} required outcomes · {task.evidence.length} supporting sources
 </p>
 </div>
 <Link
 href="/"
 className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-border-strong bg-surface px-4 text-sm font-semibold text-accent-strong"
 >
 <ArrowLeft className="size-4" /> Back to today
 </Link>
 </header>

 <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.65fr)] lg:items-start">
 <main className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
 {task.latestSyncReviewReport ? (
 <section className="rounded-[20px] border border-border bg-surface p-6">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <h2 className="ft-panel-title font-display">Figma requirement audit</h2>
 <p className="mt-2 text-sm leading-relaxed text-muted">
 {task.latestSyncReviewReport.summary}
 </p>
 </div>
 {task.latestSyncReviewReport.figmaUrl ? (
 <a
 href={task.latestSyncReviewReport.figmaUrl}
 target="_blank"
 rel="noreferrer"
 className="inline-flex items-center gap-2 text-sm font-semibold text-accent-strong"
 >
 Open audited frame <ExternalLink className="size-4" />
 </a>
 ) : null}
 </div>
 <div className="mt-5 grid gap-5 sm:grid-cols-2">
 <MeetingContextList
 title="Matches requirement"
 items={task.latestSyncReviewReport.ok}
 />
 <MeetingContextList
 title="Missing or incomplete"
 items={task.latestSyncReviewReport.notOk}
 />
 {task.latestSyncReviewReport.conflicts.length > 0 ? (
 <MeetingContextList
 title="Conflicts"
 items={task.latestSyncReviewReport.conflicts}
 />
 ) : null}
 </div>
 <p className="mt-5 rounded-2xl border border-accent/20 bg-accent/8 p-4 text-sm leading-relaxed">
 <strong>Next:</strong> {task.latestSyncReviewReport.recommendedNextAction}
 </p>
 </section>
 ) : null}

 {task.meetingContext.length > 0 ? (
 <section className="rounded-[20px] border border-border bg-surface p-6">
 <h2 className="ft-panel-title font-display">What was said in meetings</h2>
 <p className="mt-2 text-sm leading-relaxed text-muted">
 The important decisions, feedback, and unresolved questions linked to this task.
 </p>
 <div className="mt-5 grid gap-5">
 {task.meetingContext.map((context) => (
 <article
 key={context.sourceItemId}
 className="rounded-2xl border border-border bg-surface-soft/40 p-5"
 >
 <div className="flex flex-wrap items-baseline justify-between gap-2">
 <strong className="text-[15px]">{context.sourceTitle}</strong>
 <span className="text-xs font-medium text-muted-soft">
 {meetingDate(context.sourceDate)}
 </span>
 </div>
 <p className="mt-3 text-sm leading-7 text-foreground">
 {context.overview}
 </p>

 <div className="mt-5 grid gap-5 sm:grid-cols-2">
 {context.keyPoints.length > 0 ? (
 <MeetingContextList title="Important context" items={context.keyPoints} />
 ) : null}
 {context.decisions.length > 0 ? (
 <MeetingContextList title="Decisions" items={context.decisions} />
 ) : null}
 {context.requestedChanges.length > 0 ? (
 <MeetingContextList
 title="Requested changes"
 items={context.requestedChanges}
 />
 ) : null}
 {context.openQuestions.length > 0 ? (
 <MeetingContextList
 title="Open questions"
 items={context.openQuestions}
 />
 ) : null}
 </div>

 <details className="mt-5 border-t border-border pt-4">
 <summary className="cursor-pointer text-sm font-semibold text-accent-strong">
 Show supporting quotes
 </summary>
 <div className="mt-3 grid gap-2">
 {context.evidenceQuotes.map((quote) => (
 <blockquote
 key={quote}
 className="border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted"
 >
 “{quote}”
 </blockquote>
 ))}
 </div>
 </details>
 </article>
 ))}
 </div>
 </section>
 ) : null}

 <section className="rounded-[20px] border border-border bg-surface p-6">
 <h2 className="ft-panel-title font-display">All required outcomes</h2>
 <p className="mt-2 text-sm text-muted">Open an outcome to see the instruction, evidence, and expected result.</p>
 <div className="mt-5 grid gap-2.5">
 {task.doneCriteria.map((criterion, index) => (
 <Link
 key={`${index}-${criterion}`}
 href={`/tasks/${task.id}/corrections/${index + 1}`}
 className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-border-strong hover:"
 >
 <span className="grid size-10 place-items-center rounded-xl bg-accent-soft-surface text-xs font-bold text-accent-strong">
 {String(index + 1).padStart(2, "0")}
 </span>
 <span>
 <strong className="block text-[15px]">{criterion}</strong>
 </span>
 <ArrowRight className="mt-2 size-5 text-accent-strong transition-transform group-hover:translate-x-1" />
 </Link>
 ))}
 </div>
 </section>

 <section className="rounded-[20px] border border-border bg-surface p-6">
 <h2 className="ft-panel-subtitle font-display">Supporting sources</h2>
 <div className="mt-4 grid gap-2.5">
 {task.evidence.length > 0 ? task.evidence.map((item) => {
 const content = (
 <>
 <span className="grid size-9 place-items-center rounded-xl bg-accent-soft-surface text-xs font-bold text-accent-strong">EV</span>
 <span className="min-w-0">
 <strong className="block truncate text-sm">{sourceById.get(item.sourceItemId)?.title ?? "Source evidence"}</strong>
 <small className="mt-1 line-clamp-2 text-sm text-muted">{item.quote || item.summary}</small>
 </span>
 {item.url ? <ExternalLink className="size-4 text-accent-strong" /> : null}
 </>
 );
 const className = "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-border bg-surface p-3";
 return item.url ? (
 <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className={className}>{content}</a>
 ) : (
 <div key={item.id} className={className}>{content}</div>
 );
 }) : (
 <p className="rounded-[14px] border border-danger/35 bg-danger-soft-surface p-4 text-sm text-muted">
 No source evidence is attached. Verify this task before acting.
 </p>
 )}
 </div>
 </section>
 </main>

 <aside className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:sticky lg:top-24">
 <section className="focus-soft-gradient rounded-[20px] border border-border-strong p-6">
 <strong className="block font-display text-3xl tracking-[-0.05em]">
 {confidence == null ? "—" : `${confidence}%`}
 </strong>
 <span className="mt-1 block text-sm font-bold text-accent-strong">{confidenceLabel(task.confidence)}</span>
 <p className="mt-3 text-sm leading-relaxed text-muted">
 This score describes extraction confidence. Priority is determined by the current queue and supporting evidence.
 </p>
 </section>
 <section className="rounded-[20px] border border-border bg-surface p-6">
 <h2 className="ft-panel-subtitle font-display">Next action</h2>
 <p className="mt-2 text-sm leading-relaxed text-muted">{task.nextAction}</p>
 {task.evidence.find((item) => item.url)?.url ? (
 <a
 href={task.evidence.find((item) => item.url)?.url ?? "#"}
 target="_blank"
 rel="noreferrer"
 className="link-btn-primary link-btn-md motion-btn mt-5 w-full"
 >
 Open decisive source ↗
 </a>
 ) : null}
 </section>
 </aside>
 </div>
 </div>
 );
}

function MeetingContextList({ title, items }: { title: string; items: string[] }) {
 return (
 <div>
 <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
 {title}
 </h3>
 <ul className="mt-2 grid gap-2">
 {items.map((item) => (
 <li key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm leading-relaxed">
 <span className="text-muted-soft">—</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 );
}
