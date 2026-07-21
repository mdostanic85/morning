import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { AppBadge } from "@/components/AppBadge";

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

  const [task, sourceItems] = await Promise.all([
    getWorkTaskById(taskId),
    getSourceItems(),
  ]);
  if (!task) notFound();

  const criterion = task.doneCriteria[criterionIndex];
  if (!criterion) notFound();

  const evidence = task.evidence[criterionIndex] ?? task.evidence[0] ?? null;
  const source = evidence
    ? sourceItems.find((item) => item.id === evidence.sourceItemId) ?? null
    : null;

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
          <AppBadge tone="danger">Required</AppBadge>
          <h1 className="ft-screen-title mt-4 max-w-4xl font-display">{criterion}</h1>
          <p className="ft-screen-lead mt-4 max-w-3xl text-muted">
            Complete this outcome as part of {task.title}.
          </p>
          <p className="ft-header-meta mt-3 text-muted-soft">
            Source: {source?.title ?? "Task evidence"}
          </p>
        </div>
        <Link
          href={`/tasks/${task.id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border border-border-strong bg-surface px-4 text-sm font-semibold text-accent-strong"
        >
          <ArrowLeft className="size-4" /> Back to all outcomes
        </Link>
      </header>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)] lg:items-start">
        <main className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
          <section className="rounded-[20px] border border-border bg-surface p-6">
            <p className="ft-section-label text-accent-strong">Exact instruction</p>
            <blockquote className="mt-4 rounded-r-[14px] border-l-4 border-accent bg-accent-soft-surface p-[18px] text-[17px] leading-relaxed text-foreground/85">
              {evidence?.quote || evidence?.summary || task.reason}
            </blockquote>
            {evidence?.url ? (
              <a href={evidence.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-strong">
                Open original source <ExternalLink className="size-4" />
              </a>
            ) : null}
          </section>

          <section className="rounded-[20px] border border-border bg-surface p-6">
            <p className="ft-section-label text-accent-strong">What needs to change</p>
            <ul className="mt-4 grid gap-2.5">
              <li className="relative rounded-[14px] border border-border p-4 pl-11 text-sm leading-relaxed text-muted before:absolute before:left-4 before:top-4 before:grid before:size-5 before:place-items-center before:rounded-md before:bg-success-soft-surface before:text-xs before:font-bold before:text-good before:content-['✓']">
                {task.nextAction}
              </li>
              <li className="relative rounded-[14px] border border-border p-4 pl-11 text-sm leading-relaxed text-muted before:absolute before:left-4 before:top-4 before:grid before:size-5 before:place-items-center before:rounded-md before:bg-success-soft-surface before:text-xs before:font-bold before:text-good before:content-['✓']">
                Verify the result against the attached source evidence.
              </li>
            </ul>
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
