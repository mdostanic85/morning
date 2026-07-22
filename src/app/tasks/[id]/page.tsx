import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronDownIcon, ExternalLink } from "lucide-react";
import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { BackToTodayButton } from "@/components/BackToTodayButton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { OwnershipDecisionButtons } from "@/components/OwnershipDecisionButtons";
import { TaskActionButtons } from "@/components/TaskActionButtons";
import { localStatusLabel } from "@/lib/tasks/taskDetailActionModel";
import {
  matchCriteriaToVerificationReport,
  CRITERION_VERDICT_LABEL,
  type CriterionVerdict,
} from "@/lib/tasks/criterionVerificationMatch";
import type { TaskMeetingContextEntry } from "@/domain/workTask";

export const dynamic = "force-dynamic";

/** A quote longer than this is assumed to overflow a 2-line clamp at this column width — long enough to earn an expand affordance (F8). */
const LONG_QUOTE_THRESHOLD = 160;

function meetingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Smallest-reasonable pluralization for the two count labels on this page. No i18n library needed for this fixed vocabulary. */
function countLabel(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusBadgeTone(status: string): "warning" | "good" | "neutral" | "danger" {
  if (status === "waiting" || status === "unclear") return "warning";
  if (status === "done") return "good";
  if (status === "now") return "neutral";
  return "neutral";
}

const VERDICT_TONE: Record<CriterionVerdict, AppBadgeTone> = {
  met: "good",
  missing: "warning",
  not_checked: "neutral",
};

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
  const linkedJiraKey = task.title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
  const linkedJiraUrl =
    task.evidence.find((item) => item.url && /jira|atlassian/i.test(item.url))?.url ?? null;
  const referenceLinks = task.evidence
    .filter((item) => item.url)
    .map((item) => ({
      label: sourceById.get(item.sourceItemId)?.title ?? "Source",
      url: item.url as string,
    }));
  const criterionVerdicts = matchCriteriaToVerificationReport(
    task.doneCriteria,
    task.latestVerificationReport
  );

  const sharedActionProps = {
    taskId: task.id,
    linkedJiraKey,
    linkedJiraUrl,
    referenceLinks,
    latestVerificationReport: task.latestVerificationReport,
    status: task.status,
    figmaFrameUrl: task.figmaFrameUrl,
    githubRepo: task.githubRepo,
    localRepoPath: task.localRepoPath,
    layout: "detail" as const,
    showJiraStatus: isJiraTask,
  };

  return (
    <div className="mx-auto w-full max-w-[77.5rem] py-8 pb-20">
      <div className="mb-6">
        <BackToTodayButton />
      </div>

      <header className="border-b border-border pb-7">
        <div className="flex flex-wrap gap-2">
          <AppBadge tone={statusBadgeTone(task.status)}>{localStatusLabel(task.status)}</AppBadge>
          {isJiraTask ? <AppBadge tone="sky">Jira</AppBadge> : null}
        </div>
        <h1 className="ft-task-title mt-3 max-w-4xl text-balance font-display">{task.title}</h1>
        <div className="mt-5 max-w-3xl">
          <strong className="ft-task-micro-label block text-accent-strong">
            What you are doing
          </strong>
          <p className="ft-task-lead mt-2 text-pretty text-muted">{task.reason}</p>
        </div>
        <p className="ft-header-meta mt-3 text-muted-soft">
          <Link href="#task-outcomes" className="underline-offset-2 hover:underline">
            {countLabel(task.doneCriteria.length, "required outcome")}
          </Link>
          {" · "}
          <Link href="#task-evidence" className="underline-offset-2 hover:underline">
            {countLabel(task.evidence.length, "supporting source")}
          </Link>
        </p>
      </header>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.65fr)] lg:items-start">
        <main className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
          {/* 1. Next action — the single thing this app exists to surface,
              now leading the page with its primary CTA inline instead of
              living as a 14px aside paragraph (task-detail-ux-audit F2/F6). */}
          <section id="next-action" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6">
            <h2 className="ft-panel-subtitle font-display">Next action</h2>
            <p className="ft-task-lead mt-2 text-pretty text-foreground">{task.nextAction}</p>
            <div className="mt-4 grid gap-2.5">
              <TaskActionButtons {...sharedActionProps} detailSlot="primary" />
            </div>
            {task.status === "unclear" ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="ft-task-caption mb-2 text-muted">
                  Ownership or scope is unclear for this task.
                </p>
                <OwnershipDecisionButtons taskId={task.id} />
              </div>
            ) : null}
          </section>

          {/* Mobile-only: the sticky aside (below) is hidden below `lg`, so
              status/queue/Jira controls render here instead — right after
              Next action, per the audit's mobile layout ("actions stay
              near the next action, content still leads"). */}
          <section className="rounded-2xl border border-border bg-surface p-6 lg:hidden">
            <TaskActionButtons {...sharedActionProps} detailSlot="panel" />
          </section>

          {/* 2. All required outcomes — "how do I know it's done", now with
              a completion-state badge per outcome (F3). */}
          <section id="task-outcomes" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6">
            <h2 className="ft-panel-title font-display">All required outcomes</h2>
            <p className="ft-task-body mt-2 text-muted">
              The task is done when every outcome below is true.
            </p>
            <div className="mt-4 grid gap-2.5">
              {task.doneCriteria.map((criterion, index) => {
                const verdict = criterionVerdicts[index] ?? "not_checked";
                return (
                  <Link
                    key={`${index}-${criterion}`}
                    href={`/tasks/${task.id}/corrections/${index + 1}`}
                    className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-border-strong"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-accent-soft-surface text-xs font-bold text-accent-strong tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <strong className="ft-task-body block text-foreground">{criterion}</strong>
                    </span>
                    <span className="flex items-center gap-2">
                      <AppBadge tone={VERDICT_TONE[verdict]}>{CRITERION_VERDICT_LABEL[verdict]}</AppBadge>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-5 text-accent-strong transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* 3. Evidence — confidence sits next to it, quotes are
              expandable in place instead of unrecoverably clamped (F8),
              and the confidence badge no longer links to its own
              container (F10). */}
          <section id="task-evidence" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="ft-panel-subtitle font-display">Evidence</h2>
              <ConfidenceBadge level={task.confidence} showExplanation />
            </div>
            <div className="mt-4 grid gap-2.5">
              {task.evidence.length > 0 ? (
                task.evidence.map((item) => {
                  const source = sourceById.get(item.sourceItemId);
                  const sourceTitle = source?.title ?? "Source evidence";
                  const quoteText = item.quote || item.summary;
                  const isLongQuote = quoteText.length > LONG_QUOTE_THRESHOLD;
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="ft-task-card-title truncate text-foreground">
                              {sourceTitle}
                            </strong>
                            {source ? <SourceBadge sourceType={source.sourceType} /> : null}
                          </div>
                          {isLongQuote ? (
                            <details className="group mt-1">
                              <summary className="ft-task-body cursor-pointer text-muted">
                                <span className="line-clamp-2 group-open:hidden">{quoteText}</span>
                                <span className="hidden group-open:inline">{quoteText}</span>
                                <span className="ft-task-caption mt-0.5 block font-semibold text-accent-strong group-open:hidden">
                                  Show full quote
                                </span>
                              </summary>
                            </details>
                          ) : (
                            <p className="ft-task-body mt-1 text-muted">{quoteText}</p>
                          )}
                        </div>
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ft-task-caption mt-0.5 inline-flex shrink-0 items-center gap-1 font-semibold text-accent-strong"
                          >
                            Open source
                            <ExternalLink aria-hidden="true" className="size-3.5" />
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-xl border border-danger/35 bg-danger-soft-surface p-4 text-sm text-muted">
                  No source attached. Clarify before acting.
                </p>
              )}
            </div>
          </section>

          {/* 4. What was said in meetings — the first (newest) meeting
              expanded, older ones collapsed behind their title (F2), each
              card reading top-to-bottom in one column, most-actionable
              lists first (F12). */}
          {task.meetingContext.length > 0 ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="ft-panel-title font-display">What was said in meetings</h2>
              <p className="ft-task-body mt-2 text-muted">
                The important decisions, feedback, and unresolved questions linked to this task.
              </p>
              <div className="mt-4 grid gap-4">
                {task.meetingContext.map((context, index) => (
                  <MeetingCard key={context.sourceItemId} context={context} defaultOpen={index === 0} />
                ))}
              </div>
            </section>
          ) : null}

          {/* 5. Figma requirement audit — last; useful context, not the
              reason the user opened this task (F2). */}
          {task.latestSyncReviewReport ? (
            <section className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="ft-panel-title font-display">Figma requirement audit</h2>
                  <p className="ft-task-body mt-2 text-muted">
                    {task.latestSyncReviewReport.summary}
                  </p>
                </div>
                {task.latestSyncReviewReport.figmaUrl ? (
                  <a
                    href={task.latestSyncReviewReport.figmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ft-task-caption inline-flex items-center gap-2 font-semibold text-accent-strong"
                  >
                    Open audited frame
                    <ExternalLink aria-hidden="true" className="size-4" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
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
              <p className="ft-task-body mt-4 rounded-xl border border-accent/20 bg-accent/8 p-4">
                <strong className="font-semibold">Next:</strong>{" "}
                {task.latestSyncReviewReport.recommendedNextAction}
              </p>
            </section>
          ) : null}
        </main>

        {/* Sticky aside — status/queue/Jira controls only; the primary CTA
            lives in the main column now (F2/F4). Capped height so a long
            Jira transition list never traps the page scroll. */}
        <aside className="hidden min-w-0 gap-4 [overflow-wrap:anywhere] lg:grid lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <section className="rounded-2xl border border-border bg-surface p-6">
            <TaskActionButtons {...sharedActionProps} detailSlot="panel" />
          </section>
        </aside>
      </div>
    </div>
  );
}

function MeetingCard({
  context,
  defaultOpen,
}: {
  context: TaskMeetingContextEntry;
  defaultOpen: boolean;
}) {
  const header = (
    <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
      <strong className="ft-task-card-title text-foreground">{context.sourceTitle}</strong>
      <span className="ft-task-caption tabular-nums text-muted-soft">
        {meetingDate(context.sourceDate)}
      </span>
    </div>
  );

  if (defaultOpen) {
    return (
      <article className="rounded-xl border border-border bg-surface-soft/40 p-5">
        {header}
        <MeetingCardBody context={context} />
      </article>
    );
  }

  return (
    <details className="group rounded-xl border border-border bg-surface-soft/40 p-5">
      <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
        {header}
        <ChevronDownIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted-soft transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">
        <MeetingCardBody context={context} />
      </div>
    </details>
  );
}

function MeetingCardBody({ context }: { context: TaskMeetingContextEntry }) {
  return (
    <>
      <p className="ft-task-body mt-3 text-foreground">{context.overview}</p>

      <div className="mt-4 grid gap-4">
        {context.decisions.length > 0 ? (
          <MeetingContextList title="Decisions" items={context.decisions} />
        ) : null}
        {context.requestedChanges.length > 0 ? (
          <MeetingContextList title="Requested changes" items={context.requestedChanges} />
        ) : null}
        {context.openQuestions.length > 0 ? (
          <MeetingContextList title="Open questions" items={context.openQuestions} />
        ) : null}
        {context.keyPoints.length > 0 ? (
          <MeetingContextList title="Important context" items={context.keyPoints} />
        ) : null}
      </div>

      {context.evidenceQuotes.length > 0 ? (
        <details className="mt-4 border-t border-border pt-4">
          <summary className="ft-task-caption cursor-pointer font-semibold text-accent-strong">
            Show supporting quotes
          </summary>
          <div className="mt-3 grid gap-2">
            {context.evidenceQuotes.map((quote) => (
              <blockquote
                key={quote}
                className="ft-task-body border-l-2 border-border-strong pl-3 text-muted"
              >
                “{quote}”
              </blockquote>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function MeetingContextList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="ft-task-micro-label text-muted">{title}</h3>
      <ul className="ft-task-body mt-2 list-disc space-y-1.5 pl-5 text-muted marker:text-muted-soft">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
