import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { BackToTodayButton } from "@/components/BackToTodayButton";
import { TaskActionButtons } from "@/components/TaskActionButtons";
import { buildTaskSupportingSources } from "@/lib/tasks/taskSupportingSources";
import { SOURCE_TYPES, type SourceType } from "@/domain/sourceItem";
import { filterMeetingContextForTask } from "@/lib/tasks/evidenceRelevance";
import { humanizeReason } from "@/lib/tasks/humanizeReason";
import { ReasonText } from "@/components/ReasonText";
import { Heading } from "@/components/Heading";
import { TaskOutcomesPanel } from "@/components/TaskOutcomesPanel";
import {
  matchCriteriaToDeliveryChecks,
  type CriterionCheckResult,
} from "@/lib/tasks/criterionVerificationMatch";

function isKnownSourceType(value: string): value is SourceType {
  return (SOURCE_TYPES as readonly string[]).includes(value);
}

export const dynamic = "force-dynamic";

/** Tone for a Jira status pill, matching the JiraStatusDropdown color language. */
function jiraStatusTone(status: string): AppBadgeTone {
  const normalized = status.toLowerCase();
  if (/done|closed|resolved|complete/.test(normalized)) return "good";
  if (/in progress|in development|doing|active/.test(normalized)) return "accent";
  if (/review|qa|ready for/.test(normalized)) return "warning";
  if (/block/.test(normalized)) return "danger";
  return "neutral";
}

function confidenceLabel(value: number | null): string {
 if (value == null) return "Not scored";
 if (value >= 0.75) return "High source confidence";
 if (value >= 0.5) return "Medium source confidence";
 return "Low source confidence";
}

/** Color for the confidence % — green above 65%, then amber, then red. */
function confidenceToneClass(value: number | null): string {
  if (value == null) return "text-muted";
  if (value > 0.65) return "text-good";
  if (value >= 0.5) return "text-warm";
  return "text-danger";
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

/** Normalizes whitespace/case so a quote can be compared against the action snippet drawn from it. */
function normalizeQuoteText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function EvidenceText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

/** Where sync looked and which job reported it — shown inside the accordion. */
function outcomeSyncMeta(
  check: CriterionCheckResult,
  sync: { figmaUrl: string | null; githubBranch: string | null } | null
): string | null {
  const locations = [
    check.verdict === "met" && sync?.figmaUrl ? "Figma frame" : null,
    check.verdict === "met" && sync?.githubBranch ? `branch ${sync.githubBranch}` : null,
  ].filter((value): value is string => Boolean(value));

  const parts = [
    locations.length > 0 ? `Found in ${locations.join(", ")}` : null,
    check.source === "sync_review"
      ? "delivery sync"
      : check.source === "verification"
        ? "delivery check"
        : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : null;
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
  const linkedJiraKey = task.title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
  const confidence = task.confidence == null ? null : Math.round(task.confidence * 100);
  const supporting = buildTaskSupportingSources({ task, sourceById });
  const relevantMeetingContext = filterMeetingContextForTask({
    task,
    entries: task.meetingContext,
    sourceById: new Map(
      sourceItems.map((source) => [
        source.id,
        {
          sourceType: source.sourceType,
          sourceExternalId: source.sourceExternalId,
          sourceDate: source.sourceDate,
        },
      ])
    ),
  });
  // Jira's operational status, surfaced as a read-only badge in the header
  // (the app never writes it back). Prefer the anchor ticket's status.
  const jiraStatus =
    supporting.groups.find((g) => g.isAnchor && g.jiraStatus)?.jiraStatus ??
    supporting.groups.find((g) => g.jiraStatus)?.jiraStatus ??
    null;

  const outcomeChecks = matchCriteriaToDeliveryChecks(task.doneCriteria, {
    verification: task.latestVerificationReport,
    syncReview: task.latestSyncReviewReport,
  });
  // Only "done" vs "still to do" is surfaced here. The verdict wording and the
  // sync report line live on the corrections page, one outcome at a time.
  const outcomes = task.doneCriteria.map((criterion, index) => {
    const check = outcomeChecks[index] ?? {
      verdict: "not_checked" as const,
      detail: null,
      source: null,
    };
    const evidence = task.evidence[index] ?? task.evidence[0] ?? null;
    return {
      number: index + 1,
      criterion,
      isDone: check.verdict === "met",
      detail: check.detail,
      meta: outcomeSyncMeta(check, task.latestSyncReviewReport),
      evidenceQuote: evidence?.quote || evidence?.summary || null,
      evidenceUrl: evidence?.url ?? null,
    };
  });

 return (
 <div className="mx-auto w-full max-w-[77.5rem] py-8 pb-20">
 <div className="mb-7">
 <BackToTodayButton />
 </div>

      <header className="pb-7">
 <div className="flex flex-wrap gap-2">
 <AppBadge tone={task.status === "waiting" || task.status === "unclear" ? "warning" : "danger"}>
 {task.status === "waiting" ? "Waiting" : task.status === "unclear" ? "Needs your input" : "Do first"}
 </AppBadge>
 {isJiraTask ? <AppBadge tone="sky">Jira</AppBadge> : null}
 {isJiraTask && jiraStatus ? (
 <AppBadge tone={jiraStatusTone(jiraStatus)}>{jiraStatus}</AppBadge>
 ) : null}
 </div>
 <Heading level={1} className="mt-4 max-w-4xl">{task.title}</Heading>
 <div className="mt-4 w-full">
 <strong className="block text-sm uppercase tracking-[0.08em] text-accent-strong">
 Why this matters
 </strong>
 <ReasonText
 text={humanizeReason(task.reason, task.title, { maxSentences: 4, maxLength: 1200 })}
 sentencePerLine
 className="ft-screen-lead mt-2 text-muted"
 />
 </div>
 </header>

 <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(22rem,.75fr)] lg:items-start">
 <div className="grid min-w-0 gap-6 [overflow-wrap:anywhere]">
 {relevantMeetingContext.length > 0 ? (
              <section className="rounded-[20px] bg-surface p-7 shadow-[var(--elevation-section)]">
                <Heading level={2} visualLevel={3}>What was said in meetings</Heading>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  Decisions, requested changes, and open questions linked to this task.
                </p>
                <div className="mt-6 grid gap-5">
 {relevantMeetingContext.map((context) => (
                    <article
                      key={context.sourceItemId}
                      className="overflow-hidden rounded-2xl bg-surface-soft"
                    >
                      <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
                        <Heading level={3} visualLevel={5}>{context.sourceTitle}</Heading>
                        <span className="text-metadata font-medium text-muted-soft">
                          {meetingDate(context.sourceDate)}
                        </span>
                      </header>

                      <p className="px-5 pb-1 pt-2 text-sm leading-7 text-foreground">
                        {context.overview}
                      </p>

                      <div className="divide-y divide-border px-5">
 {context.requestedChanges.length > 0 ? (
 <MeetingContextList
 title="Requested changes"
 items={context.requestedChanges}
 />
 ) : null}
 {context.decisions.length > 0 ? (
 <MeetingContextList title="Decisions" items={context.decisions} />
 ) : null}
 {context.openQuestions.length > 0 ? (
 <MeetingContextList
 title="Open questions"
 items={context.openQuestions}
 />
 ) : null}
 {context.keyPoints.length > 0 ? (
 <MeetingContextList title="Context" items={context.keyPoints} />
 ) : null}
 </div>

                      <details className="group px-5 pb-4 pt-3">
 <summary className="cursor-pointer list-none text-sm font-semibold text-accent-strong marker:content-none">
 <span className="inline-flex items-center gap-2">
 <span aria-hidden className="text-metadata transition-transform group-open:rotate-90">▶</span>
 {context.evidenceQuotes.length} supporting {context.evidenceQuotes.length === 1 ? "quote" : "quotes"}
 </span>
 </summary>
 <div className="mt-3 grid gap-2">
 {context.evidenceQuotes.map((quote) => (
 <blockquote
 key={quote}
 className="border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted"
 >
 “<EvidenceText text={quote} />”
 </blockquote>
 ))}
 </div>
 </details>
 </article>
 ))}
 </div>
 </section>
 ) : null}

          <section className="rounded-[20px] bg-surface p-7 shadow-[var(--elevation-section)]">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Heading level={2} visualLevel={3}>All required outcomes</Heading>
              {task.latestSyncReviewReport?.figmaUrl ? (
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
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              Sync marks an outcome done once it finds it in the delivery. Expand one to see what
              sync found, the source quote, and the full instruction.
            </p>
            <TaskOutcomesPanel taskId={task.id} outcomes={outcomes} />
          </section>

 </div>

 <aside className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:sticky lg:top-24">
            <section className="rounded-[20px] bg-surface p-6 shadow-[var(--elevation-section)]">
              <Heading level={2} visualLevel={4}>Supporting sources</Heading>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Verify the task against the source, date, and quote.
              </p>
              <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-surface-soft px-4 py-3">
                <strong
                  className={`font-display text-2xl leading-none tracking-[-0.04em] ${confidenceToneClass(task.confidence)}`}
                >
                  {confidence == null ? "Not scored" : `${confidence}%`}
                </strong>
                <span className="h-8 w-px bg-border-strong" aria-hidden />
                <span className={`text-sm font-bold ${confidenceToneClass(task.confidence)}`}>
                  {confidenceLabel(task.confidence)}
                </span>
              </div>

              {supporting.conflicts.map((conflict) => (
                <div
                  key={conflict.summary}
                  className="mt-4 rounded-[14px] bg-danger-soft-surface p-4"
                >
                  <AppBadge tone="danger" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
                    Conflict
                  </AppBadge>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">
                    <strong>{conflict.summary}.</strong> {conflict.detail}
                  </p>
                </div>
              ))}

              <div className="mt-4 grid gap-2">
                {supporting.groups.length > 0 ? (
                  supporting.groups.map((group) => (
                    <article
                      key={group.sourceItemId}
                      className={`flex flex-col gap-3 rounded-[14px] p-4 ${
                        group.inConflict ? "bg-danger-soft-surface" : "bg-surface-soft"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {isKnownSourceType(group.sourceType) ? (
                          <SourceBadge sourceType={group.sourceType} />
                        ) : (
                          <AppBadge tone="neutral">{group.label}</AppBadge>
                        )}
                        {group.isAnchor ? <AppBadge tone="accent">Proof of task</AppBadge> : null}
                        {group.jiraStatus ? (
                          <AppBadge tone={jiraStatusTone(group.jiraStatus)}>
                            {group.jiraStatus}
                          </AppBadge>
                        ) : null}
                        {group.isLatest ? <AppBadge tone="mint">Latest update</AppBadge> : null}
                        {group.inConflict ? <AppBadge tone="danger">Conflict</AppBadge> : null}
                      </div>

                      <div className="grid gap-1">
                        <Heading level={3} visualLevel={5} className="text-foreground [overflow-wrap:anywhere]">
                          {group.title}
                        </Heading>
                        <span className="text-sm font-medium leading-5 text-muted-soft">
                          {meetingDate(group.sourceDate)}
                        </span>
                      </div>

                      {group.actionSnippet ? (
                        <div>
                          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-accent-strong">
                            What this asks for
                          </span>
                          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                            “<EvidenceText text={group.actionSnippet} />”
                          </p>
                        </div>
                      ) : null}

                      {(() => {
                        const remainingQuotes = group.quotes.filter(
                          (quote) => normalizeQuoteText(quote.text) !== normalizeQuoteText(group.actionSnippet)
                        );
                        return remainingQuotes.length > 0 || group.url ? (
                          <div className="relative border-t border-border pt-3">
                            {group.url ? (
                              <a
                                href={group.url}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute right-0 top-3 inline-flex h-8 items-center gap-1 rounded-2xl text-sm font-medium text-accent-strong"
                              >
                                Open Source <ExternalLink className="size-4" />
                              </a>
                            ) : null}
                            {remainingQuotes.length > 0 ? (
                              <details className="group/quotes">
                                <summary
                                  className={`flex h-8 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-accent-strong marker:content-none ${
                                    group.url ? "pr-28" : ""
                                  }`}
                                >
                                  <span
                                    aria-hidden
                                    className="text-[10px] transition-transform group-open/quotes:rotate-90"
                                  >
                                    ▶
                                  </span>
                                  Show{" "}
                                  {remainingQuotes.length === 1
                                    ? "the quote"
                                    : `${remainingQuotes.length} quotes`}
                                </summary>
                                <ul className="mt-3 grid w-full gap-2">
                                  {remainingQuotes.map((quote) => (
                                    <li
                                      key={quote.id}
                                      className="w-full border-l-2 border-border-strong pl-3.5 text-sm leading-[22.75px] text-muted [overflow-wrap:anywhere]"
                                    >
                                      “<EvidenceText text={quote.text} />”
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : (
                              <div className="h-8" aria-hidden />
                            )}
                          </div>
                        ) : null;
                      })()}
                    </article>
                  ))
                ) : (
                  <p className="rounded-[14px] bg-danger-soft-surface p-4 text-sm text-muted">
                    No source evidence is attached. Verify this task before acting.
                  </p>
                )}
              </div>
            </section>

            {/* WL-12: corrections reachable from Today → task detail, using the existing write-confirmation pattern (TaskActionButtons already gates Done/Delete behind a confirm dialog). */}
            <section className="rounded-[20px] bg-surface p-6 shadow-[var(--elevation-section)]">
              <Heading level={2} visualLevel={4}>Change status</Heading>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                <span className="font-semibold text-foreground">Next: </span>
                {task.nextAction}
              </p>
              <div className="mt-4">
                <TaskActionButtons
                  taskId={task.id}
                  linkedJiraKey={linkedJiraKey}
                  latestVerificationReport={task.latestVerificationReport}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
}

function MeetingContextList({ title, items }: { title: string; items: string[] }) {
 return (
 <section className="grid gap-2.5 py-4 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-5">
			<Heading level={4} visualLevel={6} className="text-muted">
				{title}
			</Heading>
 <ul className="grid gap-2">
 {items.map((item) => (
 <li key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 text-sm leading-6">
 <span className="mt-[0.6rem] size-1 rounded-full bg-border-strong" aria-hidden />
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </section>
 );
}
