import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { SourceType } from "@/domain/sourceItem";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { FigmaValidateButton } from "@/components/FigmaValidateButton";
import { WhyThisButton } from "@/components/WhyThisButton";
import { TodayMeetingsCard } from "@/components/TodayMeetingsCard";
import { TodaySignalsCard } from "@/components/TodaySignalsCard";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";
import type { PersonalMentionSignal } from "@/lib/signals/personalMentions";
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
    quote: string | null;
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
  meetings: TodayMeeting[];
  calendarConnected: boolean;
  meetingMentions: PersonalMentionSignal[];
  jiraMentions: PersonalMentionSignal[];
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

function normalizeSentence(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function echoesTitle(text: string, title: string): boolean {
  const a = text.trim().toLowerCase();
  const b = title.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.includes(a.slice(0, Math.min(a.length, 40)));
}

function isThinResearchLine(value: string): boolean {
  return /^\s*(open|read|review|check|inspect|compare|consult|look at|go through|focus first on)\b/i.test(
    value.trim()
  );
}

/** 3–5 sentence context reminder from AI reason / transcript synthesis. */
function buildTodayNarrative(
  task: MinimalTask,
  primarySummary: string | null
): string {
  const reason = (primarySummary || task.reason).trim();
  const reasonIsUseful =
    reason.length >= 80 &&
    !echoesTitle(reason, task.title) &&
    !isThinResearchLine(reason);

  if (reasonIsUseful) {
    return reason;
  }

  // Prefer a joined work summary as a paragraph when reason is thin.
  const summaryLines = task.todayWorkSummary
    .map((line) => line.trim())
    .filter((line) => line && !isThinResearchLine(line))
    .slice(0, 4);

  if (summaryLines.length >= 2) {
    return summaryLines.map(normalizeSentence).join(" ");
  }

  const parts: string[] = [];
  if (summaryLines[0]) parts.push(normalizeSentence(summaryLines[0]));

  const next = task.nextAction.trim();
  if (
    next &&
    !isThinResearchLine(next) &&
    !parts.some((part) => part.toLowerCase().includes(next.toLowerCase()))
  ) {
    parts.push(normalizeSentence(next));
  }

  if (parts.length > 0) return parts.join(" ");

  // Last resort — never invent "Focus first on / Done when" filler.
  return reasonIsUseful
    ? reason
    : "Recent sources need a richer briefing for this task. Open Why this for the underlying quotes, then Sync my day to refresh the reminder.";
}

function SecondaryTaskCard({ task }: { task: MinimalTask }) {
  const label = taskLabel(task);
  const summary = taskCardDescription(task);
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group relative flex items-start gap-3 rounded-[var(--radius)] border border-border bg-surface px-4 py-3.5 pr-10 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--panel-hover-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <ArrowRight
        className="absolute right-3 top-4 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-1"
        aria-hidden
      />
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
  meetings,
  calendarConnected,
  meetingMentions,
  jiraMentions,
}: MinimalTodayViewProps) {
  const primary = tasks[0] ?? null;
  const otherTasks = tasks.slice(1);

  const steps =
    primarySubtasks.length > 0
      ? primarySubtasks.map((item) => item.label)
      : primary
        ? [
            ...primary.actionSteps,
            ...primary.todayWorkSummary,
            ...primary.doneCriteria,
          ].filter(Boolean)
        : [];

  const uniqueSteps = Array.from(new Set(steps.map((step) => step.trim()).filter(Boolean))).slice(
    0,
    5
  );

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

  const narrative = primary ? buildTodayNarrative(primary, primarySummary) : "";
  const whyFirst = primary
    ? priorityExplanationForDisplay(
        primaryWhyFirst || primary.priorityExplanation || primary.reason || ""
      )
    : "";

  return (
    <div className="minimal-today">
      <section className="minimal-hero">
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
          <span>
            {tasks.length} {tasks.length === 1 ? "priority" : "priorities"} selected
          </span>
        </div>
      </section>

      {!profileReady ? (
        <p className="ft-body mb-5 rounded-[var(--radius)] border border-danger/35 bg-danger-soft-surface px-5 py-4 text-muted">
          Add your name in Settings so priorities can be filtered to your work.
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
          {primary ? (
            <article className="minimal-urgent-card min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3 pr-14">
                <div className="flex flex-wrap gap-[7px]">
                  <span className="minimal-badge minimal-badge-urgent">Urgent</span>
                  {isJiraTask(primary) ? (
                    <span className="minimal-badge minimal-badge-jira">Jira</span>
                  ) : null}
                  {confidenceBadge(primary) ? (
                    <span className="minimal-badge minimal-badge-confidence">
                      {confidenceBadge(primary)}
                    </span>
                  ) : null}
                </div>
              </div>

              <Link
                href={`/tasks/${primary.id}`}
                className="minimal-card-arrow"
                aria-label={`Open ${primary.title}`}
              >
                <ArrowRight className="size-5" />
              </Link>

              <div className="minimal-urgent-content">
                <Link href={`/tasks/${primary.id}`} className="block text-inherit no-underline">
                  <h2 className="ft-display">{primary.title}</h2>
                </Link>

                <strong className="mt-4 block text-xs uppercase tracking-[0.08em] text-muted">
                  Where things stand
                </strong>
                <p className="minimal-urgent-description ft-body-lg !mt-2">{narrative}</p>

                {uniqueSteps.length > 0 ? (
                  <>
                    <strong className="mt-4 block text-xs uppercase tracking-[0.08em] text-muted">
                      Do this today
                    </strong>
                    <ul className="minimal-steps" aria-label="Today’s concrete steps">
                      {uniqueSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {primary.figmaAudit ? (
                  <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-soft/60 px-3.5 py-3">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold text-accent-strong">Figma audit · </span>
                      {primary.figmaAudit.summary}
                    </p>
                    {primary.figmaAudit.recommendedNextAction ? (
                      <p className="mt-1.5 text-sm text-muted">
                        Next: {primary.figmaAudit.recommendedNextAction}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/80 pt-3">
                  <p className="ft-source-meta text-muted">
                    {primary.doneCriteria.length} required outcome
                    {primary.doneCriteria.length === 1 ? "" : "s"} · Highest source updated{" "}
                    {relativeTime(latestEvidenceDate(primary))}
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <WhyThisButton whyFirst={whyFirst} evidence={primary.evidence} />
                    <FigmaValidateButton
                      taskId={primary.id}
                      taskTitle={primary.title}
                      hasJiraEvidence={isJiraTask(primary)}
                    />
                  </div>
                </div>
              </div>
            </article>
          ) : (
            <div className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface p-8">
              {lastSyncAt ? (
                <>
                  <h2 className="ft-card-title font-semibold">All clear</h2>
                  <p className="ft-body mt-2 text-muted">
                    Nothing new needs your attention based on the latest sources. Sync again when
                    you want a fresh check.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="ft-card-title font-semibold">No priorities yet</h2>
                  <p className="ft-body mt-2 text-muted">
                    Sync your day to collect evidence and build today&apos;s priority order.
                  </p>
                </>
              )}
            </div>
          )}

          <aside className="w-full shrink-0 md:w-[18.75rem] lg:w-[20rem]">
            <TodayMeetingsCard meetings={meetings} calendarConnected={calendarConnected} />
          </aside>
        </div>

        {primary && tasks.length > 1 ? (
          <div>
            <p className="mb-2.5 px-0.5 text-xs font-bold uppercase tracking-[0.08em] text-muted-soft">
              Other priorities
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {tasks.slice(1).map((task) => (
                <SecondaryTaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ) : null}

        <TodaySignalsCard meetings={meetingMentions} jiraTagged={jiraMentions} />
      </section>

      <p className="minimal-foot">
        Important recommendations expose their decisive source and the instructions that created the
        output. <Link href="/how-ai-works">How AI works</Link>
      </p>
    </div>
  );
}
