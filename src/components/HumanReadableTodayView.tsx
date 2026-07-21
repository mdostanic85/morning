import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  LockKeyhole,
} from "lucide-react";
import type { DailyBriefV2, DailyWorkItem } from "@/domain/dailyBrief";
import type { SourceType } from "@/domain/sourceItem";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { TodayMeetingsCard } from "@/components/TodayMeetingsCard";
import { WhyThisButton } from "@/components/WhyThisButton";
import { humanizeReason } from "@/lib/tasks/humanizeReason";
import { taskEligibleForBriefPriority } from "@/lib/filters/ownerFilter";

export interface HumanReadableTask {
  id: number;
  title: string;
  status: WorkTaskStatus;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  priorityExplanation: string | null;
  waitingOn: string | null;
  owner: string | null;
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

interface HumanReadableTodayViewProps {
  tasks: HumanReadableTask[];
  connectedProviderLabels: string[];
  sourceCount: number;
  lastSyncAt: string | null;
  profileName: string | null;
  profileReady: boolean;
  meetings: TodayMeeting[];
  calendarConnected: boolean;
  dailyBrief: DailyBriefV2 | null;
}

type BadgeTone = "accent" | "good" | "warning" | "danger" | "neutral";

interface AttentionEntry {
  item: DailyWorkItem | null;
  task: HumanReadableTask | null;
}

const SOURCE_LABEL: Record<string, string> = {
  "Gmail & Gemini notes": "Gemini",
  "Google Calendar": "Calendar",
  "Google Drive Gemini notes": "Drive",
  Jira: "Jira",
  Confluence: "Confluence",
  Granola: "Granola",
  GitHub: "GitHub",
  Discord: "Discord",
  Figma: "Figma",
};

function firstName(profileName: string | null): string | null {
  return profileName?.trim().split(/\s+/)[0] || null;
}

function todayLabel(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function compactSources(labels: string[]): string {
  return Array.from(new Set(labels.map((label) => SOURCE_LABEL[label] ?? label))).join(" · ");
}

function evidenceDate(task: HumanReadableTask | null): string | null {
  if (!task) return null;
  const times = task.evidence
    .map((evidence) => Date.parse(evidence.sourceDate))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : task.updatedAt;
}

function relativeTime(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const hours = Math.max(0, Math.round((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "updated less than an hour ago";
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}

function jiraKey(entry: AttentionEntry): string | null {
  return (
    entry.item?.jiraKey ??
    entry.task?.title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ??
    null
  );
}

function statusBadge(
  entry: AttentionEntry,
  brief: DailyBriefV2 | null,
  index: number
): { label: string; tone: BadgeTone; icon: typeof Clock3 } {
  const item = entry.item;
  const task = entry.task;
  const key = jiraKey(entry);
  const blocked = brief?.blockedWaiting.some(
    (blockedItem) =>
      (key && blockedItem.jiraKey === key) ||
      blockedItem.title.toLowerCase() === (item?.title ?? task?.title ?? "").toLowerCase()
  );
  const copy = `${item?.reason ?? task?.reason ?? ""} ${item?.nextAction ?? task?.nextAction ?? ""}`;

  if (blocked || task?.waitingOn) {
    return { label: "Blocked", tone: "danger", icon: LockKeyhole };
  }
  if (item?.statusHint === "unclear" || task?.status === "unclear") {
    return { label: "Clarify first", tone: "warning", icon: AlertTriangle };
  }
  if (/\b(confirm|confirmation|sign[- ]?off|approval|review from)\b/i.test(copy)) {
    return { label: "Waiting for confirmation", tone: "warning", icon: Clock3 };
  }
  if (task?.status === "waiting" || item?.statusHint === "waiting") {
    return { label: "Waiting", tone: "warning", icon: Clock3 };
  }
  if (index === 0) {
    return { label: "First today", tone: "accent", icon: CheckCircle2 };
  }
  if (task?.status === "now") {
    return { label: "In progress", tone: "good", icon: CheckCircle2 };
  }
  return { label: "To do", tone: "neutral", icon: CircleDashed };
}

function resolveAttention(
  tasks: HumanReadableTask[],
  dailyBrief: DailyBriefV2 | null,
  myName: string | null
): AttentionEntry[] {
  const isMine = (task: Pick<HumanReadableTask, "owner" | "title" | "reason" | "nextAction">) =>
    taskEligibleForBriefPriority(
      {
        owner: task.owner,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
      },
      myName
    );

  const ownedTasks = tasks.filter(isMine);

  // Without a brief, only surface clearly owned work — never pad with guesses.
  if (!dailyBrief) {
    return ownedTasks.slice(0, 2).map((task) => ({ item: null, task }));
  }

  return [dailyBrief.todayFirst, ...dailyBrief.afterThat]
    .map((item) => {
      // Composer placeholder when nothing is owned — do not render as a priority.
      if (
        item.taskId == null &&
        item.jiraKey == null &&
        /^no open owned work$/i.test(item.title.trim())
      ) {
        return null;
      }

      const task =
        (item.taskId != null
          ? ownedTasks.find((candidate) => candidate.id === item.taskId)
          : null) ??
        (item.jiraKey
          ? ownedTasks.find((candidate) => candidate.title.includes(item.jiraKey ?? ""))
          : null) ??
        null;

      // Stale brief slot pointing at non-owned / missing work.
      if (item.taskId != null && task == null) return null;

      if (!task) {
        // Unlinked brief text must still prove ownership on its own.
        if (
          !taskEligibleForBriefPriority(
            {
              owner: null,
              title: item.title,
              reason: item.reason,
              nextAction: item.nextAction,
            },
            myName
          )
        ) {
          return null;
        }
      }

      return { item, task };
    })
    .filter((entry): entry is AttentionEntry => entry != null)
    .slice(0, 2);
}

function StatusBadge({
  label,
  tone,
  Icon,
}: {
  label: string;
  tone: BadgeTone;
  Icon: typeof Clock3;
}) {
  return (
    <span className={`brief-status-badge brief-status-${tone}`}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function EvidenceRow({ entry }: { entry: AttentionEntry }) {
  const evidence = entry.task?.evidence[0] ?? null;
  const sourceLink = entry.item?.sourceLinks[0] ?? null;
  const label = evidence?.sourceTitle ?? sourceLink?.label ?? null;
  const url = evidence?.url ?? sourceLink?.url ?? null;
  const quote = evidence?.quote?.trim() || evidence?.summary?.trim() || null;

  return (
    <div className="brief-pillar brief-pillar-evidence">
      <p className="brief-pillar-label">Evidence</p>
      {label ? (
        <div>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="brief-source-link">
              {label}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : (
            <strong>{label}</strong>
          )}
          {quote ? <p className="brief-evidence-quote">“{quote}”</p> : null}
        </div>
      ) : (
        <p className="brief-evidence-missing">No source excerpt is available. Clarify before acting.</p>
      )}
    </div>
  );
}

/** The single most important task — the only one that should visually dominate the page. */
function FocusCard({ entry, brief }: { entry: AttentionEntry; brief: DailyBriefV2 | null }) {
  const index = 0;
  const title = entry.item?.title ?? entry.task?.title ?? "Unresolved work";
  const reason = humanizeReason(entry.item?.reason ?? entry.task?.reason, title);
  const nextAction =
    entry.item?.nextAction ??
    entry.task?.nextAction ??
    "Clarify the requirement and record the supporting source.";
  const doneCriteria =
    entry.item?.doneCriteria.length
      ? entry.item.doneCriteria
      : entry.task?.doneCriteria.length
        ? entry.task.doneCriteria
        : ["The requirement and completion check are recorded with evidence."];
  const badge = statusBadge(entry, brief, index);
  const updated = relativeTime(evidenceDate(entry.task));
  const key = jiraKey(entry);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;
  const whyFirst =
    entry.task?.priorityExplanation || entry.item?.reason || entry.task?.reason || "";

  return (
    <article className="brief-focus-card brief-focus-primary">
      <div className="brief-focus-topline">
        <span className="brief-order" aria-label={`Priority ${index + 1}`}>
          {index + 1}
        </span>
        <div className="brief-badge-row">
          <StatusBadge label={badge.label} tone={badge.tone} Icon={badge.icon} />
          {key ? <span className="brief-key-badge">{key}</span> : null}
          {updated ? <span className="brief-updated">{updated}</span> : null}
        </div>
      </div>

      <div className="brief-focus-heading">
        {href ? (
          <Link href={href}>
            <h2>{title}</h2>
          </Link>
        ) : (
          <h2>{title}</h2>
        )}
        <p>{reason}</p>
      </div>

      <div className="brief-pillars">
        <div className="brief-pillar brief-pillar-action">
          <p className="brief-pillar-label">Next action</p>
          <p className="brief-action-copy">{nextAction}</p>
        </div>

        <div className="brief-pillar brief-pillar-done">
          <p className="brief-pillar-label">Done when</p>
          <ul>
            {doneCriteria.slice(0, 3).map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>

        <EvidenceRow entry={entry} />
      </div>

      <div className="brief-focus-footer">
        {entry.task ? (
          <WhyThisButton whyFirst={whyFirst} evidence={entry.task.evidence} />
        ) : (
          <span className="text-sm text-muted">Needs a linked task before execution.</span>
        )}
        {href ? (
          <Link href={href} className="brief-open-task">
            Open task
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Secondary tasks stay quiet: a badge, the headline, and a two-line summary.
 * Anyone who wants more clicks through to the full task for evidence,
 * next action, and done criteria — it isn't repeated here.
 */
function SecondaryTaskCard({
  entry,
  brief,
}: {
  entry: AttentionEntry;
  brief: DailyBriefV2 | null;
}) {
  const title = entry.item?.title ?? entry.task?.title ?? "Unresolved work";
  const reason = humanizeReason(entry.item?.reason ?? entry.task?.reason, title);
  const badge = statusBadge(entry, brief, 1);
  const key = jiraKey(entry);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;

  const body = (
    <>
      <div className="brief-secondary-badges">
        <StatusBadge label={badge.label} tone={badge.tone} Icon={badge.icon} />
        {key ? <span className="brief-key-badge">{key}</span> : null}
      </div>
      <h3 className="brief-secondary-title">{title}</h3>
      <p className="brief-secondary-reason">{reason}</p>
    </>
  );

  if (!href) {
    return <div className="brief-secondary-card">{body}</div>;
  }

  return (
    <Link href={href} className="brief-secondary-card brief-secondary-card-link">
      {body}
      <span className="brief-secondary-more">
        More details
        <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  );
}

function MeetingPrep({ brief }: { brief: DailyBriefV2 | null }) {
  const questions = brief?.meetingPrep.flatMap((prep) =>
    prep.questions.map((question) => ({ meeting: prep.meetingTitle, question }))
  );
  if (!questions?.length) return null;

  return (
    <section className="brief-prep-card">
      <p className="brief-kicker">Say this in the meeting</p>
      <ul>
        {questions.slice(0, 3).map(({ meeting, question }) => (
          <li key={`${meeting}:${question}`}>
            <span>{meeting}</span>
            {question}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HumanReadableTodayView({
  tasks,
  connectedProviderLabels,
  sourceCount,
  lastSyncAt,
  profileName,
  profileReady,
  meetings,
  calendarConnected,
  dailyBrief,
}: HumanReadableTodayViewProps) {
  const attention = resolveAttention(tasks, dailyBrief, profileName).slice(0, 2);
  const name = firstName(profileName);
  const sources = compactSources(connectedProviderLabels);

  return (
    <div className="brief-page">
      <header className="brief-header">
        <div>
          <p className="brief-eyebrow">Morning operational brief</p>
          <h1>{name ? `${name}'s focus for today` : "Your focus for today"}</h1>
          <p className="brief-date">{todayLabel()}</p>
        </div>
        <div className="brief-header-actions">
          {sources ? (
            <p className="brief-sources-badge" title={`${sourceCount} sources available`}>
              Sources: {sources}
            </p>
          ) : null}
          <SyncMyDayButton sources={connectedProviderLabels} lastSyncAt={lastSyncAt} />
        </div>
      </header>

      {!profileReady ? (
        <div className="brief-alert brief-alert-blocked" role="status">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <p>Add your name in Settings so this brief can filter work assigned to you.</p>
        </div>
      ) : null}

      {dailyBrief?.dayChange ? (
        <section className="brief-change-alert">
          <div className="brief-change-mark" aria-hidden>
            !
          </div>
          <div>
            <p className="brief-kicker">What changed</p>
            <p>{dailyBrief.dayChange.text}</p>
          </div>
        </section>
      ) : null}

      <main className="brief-bento">
        {attention[0] ? (
          <div className="brief-bento-primary">
            <FocusCard entry={attention[0]} brief={dailyBrief} />
          </div>
        ) : (
          <section className="brief-empty brief-bento-primary">
            <h2>Nothing clearly yours yet</h2>
            <p>
              No open work is explicitly assigned to you. Sync again after updates, or leave the
              board empty rather than guessing.
            </p>
          </section>
        )}

        <aside className="brief-bento-meetings">
          <TodayMeetingsCard meetings={meetings} calendarConnected={calendarConnected} />
          <MeetingPrep brief={dailyBrief} />
        </aside>

        {attention[1] ? (
          <div className="brief-bento-secondary">
            <SecondaryTaskCard entry={attention[1]} brief={dailyBrief} />
          </div>
        ) : null}
      </main>

      {dailyBrief?.keySources.length ? (
        <details className="brief-source-details">
          <summary>Key sources and coverage</summary>
          <div>
            {dailyBrief.keySources.slice(0, 8).map((source) =>
              source.url ? (
                <a key={`${source.label}:${source.url}`} href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : (
                <span key={source.label}>{source.label}</span>
              )
            )}
          </div>
        </details>
      ) : null}

      <p className="brief-footnote">
        Up to two priorities, and only when ownership is clear. Empty is better than a forced guess.
      </p>
    </div>
  );
}
