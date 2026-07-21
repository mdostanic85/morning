import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { AppBadge } from "@/components/AppBadge";
import {
  buildTaskEvidenceEntries,
  hasTaskEvidence,
} from "@/lib/tasks/outcomeEvidencePresentation";
import {
  criterionItemIdForText,
  evidenceForCriterion,
} from "@/lib/tasks/criterionEvidence";
import { listCriterionEvidenceLinks } from "@/lib/tasks/criterionEvidenceStore";

export const dynamic = "force-dynamic";

export default async function CorrectionDetailPage({
  params,
}: {
  params: Promise<{ id: string; index: string }>;
}) {
  const { id, index } = await params;
  const taskId = Number(id);
  const criterionIndex = Number(index) - 1;
  if (!Number.isInteger(taskId) || !Number.isInteger(criterionIndex) || criterionIndex < 0) notFound();

  const [task, sourceItems, criterionLinks] = await Promise.all([
    getWorkTaskById(taskId),
    getSourceItems(),
    listCriterionEvidenceLinks(taskId),
  ]);
  if (!task) notFound();

  const criterion = task.doneCriteria[criterionIndex];
  if (!criterion) notFound();

  const sourcesById = new Map(
    sourceItems.map((source) => [source.id, { id: source.id, title: source.title }])
  );
  const taskEvidence = buildTaskEvidenceEntries(task.evidence, sourcesById);
  const taskHasEvidence = hasTaskEvidence(task.evidence);
  const criterionItemId = criterionItemIdForText(criterion, criterionIndex);
  const linkedEvidence = evidenceForCriterion(
    criterionItemId,
    task.doneCriteria,
    task.evidence,
    criterionLinks
  );
  const hasLinkedEvidence = linkedEvidence.length > 0;

  return (
    <div className="mx-auto w-full max-w-[77.5rem] py-8 pb-20">
      <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
        <Link href="/" className="text-accent-strong hover:underline">Today</Link>
        <span>/</span>
        <Link href={`/tasks/${task.id}`} className="text-accent-strong hover:underline">{task.title}</Link>
        <span>/</span>
        <strong className="text-foreground">Outcome {String(criterionIndex + 1).padStart(2, "0")}</strong>
      </nav>

      <header className="mt-7 grid gap-6 border-b border-border pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div>
          <AppBadge tone="danger">Required outcome</AppBadge>
          <h1 className="ft-screen-title mt-4 max-w-4xl font-display">{criterion}</h1>
          <p className="ft-screen-lead mt-4 max-w-3xl text-muted">
            Complete this outcome as part of {task.title}.
          </p>
        </div>
        <Link
          href={`/tasks/${task.id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-border-strong bg-surface px-4 text-sm font-semibold text-accent-strong"
        >
          <ArrowLeft className="size-4" /> Back to task
        </Link>
      </header>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)] lg:items-start">
        <main className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
          <section className="rounded-[20px] border border-border bg-surface p-6">
            {hasLinkedEvidence ? (
              <>
                <p className="ft-section-label text-accent-strong">Evidence for this outcome</p>
                <div className="mt-4 grid gap-4">
                  {linkedEvidence.map((entry) => {
                    const sourceTitle =
                      sourcesById.get(entry.sourceItemId)?.title ?? "Unknown source";
                    const excerpt = entry.quote?.trim() || entry.summary.trim();
                    return (
                      <article
                        key={entry.id}
                        className="rounded-[14px] border border-border bg-surface-soft/40 p-4"
                      >
                        <strong className="text-sm">{sourceTitle}</strong>
                        <blockquote className="mt-3 border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted">
                          “{excerpt}”
                        </blockquote>
                        {entry.url ? (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong"
                          >
                            Open original source <ExternalLink className="size-4" />
                          </a>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="ft-section-label text-accent-strong">Evidence not linked to this outcome</p>
                {taskHasEvidence ? (
                  <>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      Worklight has task-level evidence, but it cannot verify which source supports this
                      specific outcome.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={`/tasks/${task.id}#task-evidence`}
                        className="inline-flex min-h-11 items-center rounded-[14px] bg-accent px-4 text-sm font-semibold text-accent-foreground"
                      >
                        Review task evidence
                      </Link>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="inline-flex min-h-11 items-center rounded-[14px] border border-border-strong bg-surface px-4 text-sm font-semibold text-accent-strong"
                      >
                        Back to task
                      </Link>
                    </div>

                    <details className="mt-6 border-t border-border pt-5">
                      <summary className="cursor-pointer text-sm font-semibold text-accent-strong">
                        Task evidence
                      </summary>
                      <p className="mt-2 text-sm text-muted">
                        These sources support the task generally, not necessarily this outcome.
                      </p>
                      <div className="mt-4 grid gap-4">
                        {taskEvidence.map((entry) => (
                          <article
                            key={entry.evidence.id}
                            className="rounded-[14px] border border-border bg-surface-soft/40 p-4"
                          >
                            <strong className="text-sm">{entry.sourceTitle}</strong>
                            {entry.excerpt ? (
                              <blockquote className="mt-3 border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted">
                                “{entry.excerpt}”
                              </blockquote>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    No source is attached to this task yet. Review the task before acting on this outcome.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-[20px] border border-border bg-surface p-6">
            <p className="ft-section-label text-accent-strong">Next action for this task</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">{task.nextAction}</p>
          </section>
        </main>

        <aside className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:sticky lg:top-24">
          <section className="rounded-[20px] border border-good/35 bg-success-soft-surface p-6">
            <span className="ft-section-label text-good">Expected result</span>
            <strong className="mt-2 block text-lg leading-relaxed">{criterion}</strong>
          </section>
          <section className="rounded-[20px] border border-border bg-surface p-6">
            <span className="ft-section-label text-accent-strong">Task</span>
            <strong className="mt-2 block text-lg leading-snug">{task.title}</strong>
            <p className="mt-2 text-sm text-muted">{task.reason}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
