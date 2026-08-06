import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileText,
  GitBranch,
  LockKeyhole,
  Mail,
  MessageSquare,
  PenTool,
  Ticket,
} from "lucide-react";
import type { DailyBriefV2, DailyWorkItem } from "@/domain/dailyBrief";
import type { SourceType } from "@/domain/sourceItem";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";
import { sourceTypeDescription } from "@/components/SourceBadge";
import { JiraStatusBadge } from "@/components/JiraMetadataBadges";
import { Heading } from "@/components/Heading";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { TodayMeetingsCard } from "@/components/TodayMeetingsCard";
import { NeedsInputRail } from "@/components/NeedsInputRail";
import { DismissibleDayChange } from "@/components/DismissibleDayChange";
import { WhyThisButton } from "@/components/WhyThisButton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { sourceTypeLabel } from "@/lib/tasks/taskSupportingSources";
import { dedupeBlockedWaiting } from "@/lib/dailyBrief/blockedWaitingDedupe";
import { humanizeReason } from "@/lib/tasks/humanizeReason";
import { assessFocusCoherence, type FocusCoherenceGap } from "@/lib/tasks/focusCoherence";
import { taskEligibleForBriefPriority } from "@/lib/filters/ownerFilter";
import { cn } from "@/lib/utils";
import styles from "./HumanReadableTodayView.module.css";

function css(value: string): string {
  return value
    .split(/\s+/)
    .map((name) => styles[name] ?? name)
    .join(" ");
}

export interface HumanReadableTask {
  id: number;
  title: string;
  status: WorkTaskStatus;
  jiraStatus: string | null;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  priorityExplanation: string | null;
  waitingOn: string | null;
  owner: string | null;
  updatedAt: string;
  /** WL-12: 0..1, decomposed per WL-05. Null for tasks with no scored confidence yet. */
  confidence: number | null;
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
  lastSyncAt: string | null;
  profileName: string | null;
  profileReady: boolean;
  meetings: TodayMeeting[];
  calendarConnected: boolean;
  dailyBrief: DailyBriefV2 | null;
  /** WL-12: providers whose last sync did not complete cleanly — surfaced on Today chrome, not only the sync overlay. */
  failedProviderLabels: string[];
}

interface AttentionEntry {
  item: DailyWorkItem | null;
  task: HumanReadableTask | null;
}

function firstName(profileName: string | null): string | null {
  return profileName?.trim().split(/\s+/)[0] || null;
}

/** Shown under the next action itself, where the user is about to act on it. */
const ACTION_GAP_COPY: Record<FocusCoherenceGap, string> = {
  ungrounded: "Nothing in the evidence below backs this action. Open the source and confirm it before acting.",
  "off-topic":
    "This action describes different work than the title and done criteria above. Confirm what this task is before acting.",
};

/** The same finding, condensed for the status badge tooltip. */
const ACTION_GAP_BADGE_HINT: Record<FocusCoherenceGap, string> = {
  ungrounded: "The next action is not backed by this card's evidence. Confirm it before starting.",
  "off-topic": "The next action does not match the title and done criteria. Confirm it before starting.",
};

function firstFilled(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function todayLabel(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function evidenceDate(task: HumanReadableTask | null): string | null {
  if (!task) return null;
  const times = task.evidence
    .map((evidence) => Date.parse(evidence.sourceDate))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : task.updatedAt;
}

/** Bento side column — at most two "Next up" rows inside the tile. */
const MAX_NEXT_UP = 2;
const MAX_ATTENTION = 1 + MAX_NEXT_UP;

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
  index: number,
  /** Set when the card's own next action could not be verified. */
  actionGap: FocusCoherenceGap | null = null
): {
  label: string;
  /** Only set when the label alone leaves the user guessing. */
  description: string | null;
  tone: AppBadgeTone;
  icon: typeof Clock3;
} {
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
    return {
      label: "Blocked",
      description: "Cannot start until the dependency or person named in the task responds.",
      tone: "danger",
      icon: LockKeyhole,
    };
  }
  if (item?.statusHint === "unclear" || task?.status === "unclear") {
    return {
      label: "Clarify first",
      description: "Ownership or the requirement is unclear. Resolve that before starting.",
      tone: "warning",
      icon: AlertTriangle,
    };
  }
  if (actionGap) {
    return {
      label: "Clarify first",
      description: ACTION_GAP_BADGE_HINT[actionGap],
      tone: "warning",
      icon: AlertTriangle,
    };
  }
  if (/\b(confirm|confirmation|sign[- ]?off|approval|review from)\b/i.test(copy)) {
    return {
      label: "Waiting for confirmation",
      description: null,
      tone: "warning",
      icon: Clock3,
    };
  }
  if (task?.status === "waiting" || item?.statusHint === "waiting") {
    return {
      label: "Waiting",
      description: "Paused until something outside your control changes.",
      tone: "warning",
      icon: Clock3,
    };
  }
  if (index === 0) {
    return {
      label: "First today",
      description: "Worklight's recommendation from your synced sources, not a deadline.",
      tone: "accent",
      icon: CheckCircle2,
    };
  }
  if (task?.status === "now") {
    return {
      label: "In progress",
      description: null,
      tone: "good",
      icon: CheckCircle2,
    };
  }
  return {
    label: "To do",
    description: null,
    tone: "neutral",
    icon: CircleDashed,
  };
}

function resolveAttention(
  tasks: HumanReadableTask[],
  dailyBrief: DailyBriefV2 | null,
  myName: string | null
): AttentionEntry[] {
  const isMine = (
    task: Pick<HumanReadableTask, "owner" | "title" | "reason" | "nextAction"> &
      Partial<Pick<HumanReadableTask, "evidence">>
  ) =>
    taskEligibleForBriefPriority(
      {
        owner: task.owner,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
        evidenceQuotes: task.evidence?.map((item) => item.quote),
      },
      myName
    );

  const ownedTasks = tasks.filter(isMine);

  // Without a brief, only surface clearly owned work — never pad with guesses.
  if (!dailyBrief) {
    return ownedTasks.slice(0, MAX_ATTENTION).map((task) => ({ item: null, task }));
  }

  const resolved: AttentionEntry[] = [];
  const todayFirst = dailyBrief.todayFirst;
  const todayFirstIsPlaceholder =
    todayFirst.taskId == null &&
    todayFirst.jiraKey == null &&
    /^(no open owned work|nothing clearly demands attention first)$/i.test(
      todayFirst.title.trim()
    );

  // No qualifying primary (WLA-01 floor or empty owned set). Do not promote
  // afterThat into the focus card — open work stays in the queue list.
  const briefSlots = todayFirstIsPlaceholder
    ? []
    : [dailyBrief.todayFirst, ...dailyBrief.afterThat];

  for (const item of briefSlots) {
    const task =
      (item.taskId != null
        ? ownedTasks.find((candidate) => candidate.id === item.taskId)
        : null) ??
      (item.jiraKey
        ? ownedTasks.find((candidate) => candidate.title.includes(item.jiraKey ?? ""))
        : null) ??
      null;

    // Stale brief slot pointing at non-owned / missing work.
    if (item.taskId != null && task == null) continue;

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
        continue;
      }
    }

    resolved.push({ item, task });
    if (resolved.length >= MAX_ATTENTION) break;
  }

  return resolved;
}

function StatusBadge({
  label,
  description,
  tone,
  Icon,
}: {
  label: string;
  description: string | null;
  tone: AppBadgeTone;
  Icon: typeof Clock3;
}) {
  const badge = (
    <AppBadge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>
      {label}
    </AppBadge>
  );

  if (!description) return badge;

  return <AppTooltip content={description}>{badge}</AppTooltip>;
}

const SOURCE_ICON: Partial<Record<SourceType, typeof Clock3>> = {
  jira: Ticket,
  granola: FileText,
  drive: FileText,
  manual_transcript: FileText,
  confluence: FileText,
  calendar: CalendarDays,
  gmail: Mail,
  figma: PenTool,
  github: GitBranch,
  discord: MessageSquare,
  git: GitBranch,
};

/** Where this evidence came from — the source system, not just its title. */
function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  const Icon = SOURCE_ICON[sourceType] ?? FileText;
  return (
    <AppTooltip content={sourceTypeDescription(sourceType)}>
      <AppBadge tone="default" icon={<Icon className="size-3.5" aria-hidden />}>
        {sourceTypeLabel(sourceType)}
      </AppBadge>
    </AppTooltip>
  );
}

function EvidenceRow({
  entry,
  evidence,
  confidence,
}: {
  entry: AttentionEntry;
  /** Chosen by `assessFocusCoherence` so it matches the action shown above. */
  evidence: HumanReadableTask["evidence"][number] | null;
  confidence: number | null | undefined;
}) {
  const sourceLink = entry.item?.sourceLinks[0] ?? null;
  const label = evidence?.sourceTitle ?? sourceLink?.label ?? null;
  const url = evidence?.url ?? sourceLink?.url ?? null;
  const sourceType = evidence?.sourceType ?? null;
  // A quote is only a quote when it is verbatim. A summary is a paraphrase and
  // must never be dressed up in quotation marks (evidence over assertion).
  const quote = evidence?.quote?.trim() || null;
  const summary = evidence?.summary?.trim() || null;

  return (
    <div className={css("brief-pillar brief-pillar-evidence")}>
      <div className={css("brief-pillar-label-row")}>
        <h3 className={css("brief-pillar-label")}>Evidence</h3>
        {confidence != null ? <ConfidenceBadge level={confidence} /> : null}
      </div>
      {label || sourceType ? (
        <div className={css("brief-evidence-body")}>
          <div className={css("brief-evidence-source")}>
            {sourceType ? <SourceBadge sourceType={sourceType} /> : null}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className={css("brief-source-link")}>
                {label}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : label ? (
              <strong className={css("brief-evidence-title")}>{label}</strong>
            ) : null}
          </div>
          {quote ? (
            <blockquote className={css("brief-evidence-quote")}>“{quote}”</blockquote>
          ) : summary ? (
            <p className={css("brief-evidence-summary")}>{summary}</p>
          ) : (
            <p className={css("brief-evidence-missing")}>
              No direct quote confirms this yet. Open the source before acting.
            </p>
          )}
        </div>
      ) : (
        <p className={css("brief-evidence-missing")}>No source excerpt is available. Clarify before acting.</p>
      )}
    </div>
  );
}

/** The single most important task — the only one that should visually dominate the page. */
function FocusCard({ entry, brief }: { entry: AttentionEntry; brief: DailyBriefV2 | null }) {
  const index = 0;
  // Every pillar reads from the live task first. Evidence only ever comes from
  // the task, and the brief is a snapshot composed in parallel with the action
  // planner — mixing the two let the card pair a sync-old action with fresh
  // evidence. The brief item stays the fallback for unlinked brief text.
  const title = firstFilled(entry.task?.title, entry.item?.title) ?? "Unresolved work";
  const reason = humanizeReason(firstFilled(entry.task?.reason, entry.item?.reason), title);
  const nextAction =
    firstFilled(entry.task?.nextAction, entry.item?.nextAction) ??
    "Clarify the requirement and record the supporting source.";
  const doneCriteria =
    entry.task?.doneCriteria.length
      ? entry.task.doneCriteria
      : entry.item?.doneCriteria.length
        ? entry.item.doneCriteria
        : ["The requirement and completion check are recorded with evidence."];
  const coherence = assessFocusCoherence({
    nextAction,
    title,
    doneCriteria,
    evidence: entry.task?.evidence ?? [],
  });
  const badge = statusBadge(entry, brief, index, coherence.gap);
  const updated = relativeTime(evidenceDate(entry.task));
  const key = jiraKey(entry);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;
  const whyFirst =
    entry.task?.priorityExplanation || entry.item?.reason || entry.task?.reason || "";

  return (
    <article className={css("brief-focus-card brief-focus-primary")}>
      <div className={css("brief-focus-topline")}>
        <div className={css("brief-badge-row")}>
          <StatusBadge
            label={badge.label}
            description={badge.description}
            tone={badge.tone}
            Icon={badge.icon}
          />
          <JiraStatusBadge status={entry.task?.jiraStatus ?? null} />
          {key ? <AppBadge tone="neutral">{key}</AppBadge> : null}
          {updated ? <span className={css("brief-updated")}>{updated}</span> : null}
        </div>
      </div>

      <div className={css("brief-focus-heading")}>
        {href ? (
          <Link href={href}>
            <Heading level={2} visualLevel={3}>{title}</Heading>
          </Link>
        ) : (
          <Heading level={2} visualLevel={3}>{title}</Heading>
        )}
        <p>{reason}</p>
      </div>

      <div className={css("brief-pillars")}>
        <div className={css("brief-pillar brief-pillar-action")}>
          <h3 className={css("brief-pillar-label")}>
            {coherence.gap ? "Next action — unverified" : "Next action"}
          </h3>
          <p className={css("brief-action-copy")}>{nextAction}</p>
          {coherence.gap ? (
            <p className={css("brief-action-warning")}>{ACTION_GAP_COPY[coherence.gap]}</p>
          ) : null}
        </div>

        <div className={css("brief-pillar brief-pillar-done")}>
          <h3 className={css("brief-pillar-label")}>Done when</h3>
          <ul>
            {doneCriteria.slice(0, 3).map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>

        <EvidenceRow
          entry={entry}
          evidence={coherence.evidence}
          confidence={entry.task?.confidence}
        />
      </div>

      <div className={css("brief-focus-footer")}>
        {entry.task ? (
          <WhyThisButton whyFirst={whyFirst} evidence={entry.task.evidence} />
        ) : (
          <span className="text-sm text-muted">Link a task before you can start work here.</span>
        )}
        {href ? (
          <Link href={href} className="button button--primary button--sm shrink-0">
            Start this task
            <ArrowRight aria-hidden />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/**
 * One compact row inside the Next up tile.
 * Next action and the first done criterion stay visible at this size; the
 * evidence source is intentionally deferred to the task detail page rather
 * than repeated in this compact list.
 */
function NextUpRow({
  entry,
  brief,
  index,
}: {
  entry: AttentionEntry;
  brief: DailyBriefV2 | null;
  index: number;
}) {
  const title = entry.item?.title ?? entry.task?.title ?? "Unresolved work";
  const nextAction =
    entry.item?.nextAction ??
    entry.task?.nextAction ??
    "Clarify the requirement before acting.";
  const badge = statusBadge(entry, brief, index);
  const key = jiraKey(entry);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;
  const confidence = entry.task?.confidence ?? null;

  return (
    <div
      className={cn(
        styles["brief-nextup-row"],
        href && styles["brief-nextup-row--linked"]
      )}
    >
      <div className={css("brief-nextup-row-badges")}>
        <StatusBadge
          label={badge.label}
          description={badge.description}
          tone={badge.tone}
          Icon={badge.icon}
        />
        <JiraStatusBadge status={entry.task?.jiraStatus ?? null} />
        {confidence != null ? <ConfidenceBadge level={confidence} /> : null}
        {key ? <AppBadge tone="neutral">{key}</AppBadge> : null}
      </div>
      <div className={css("brief-nextup-body")}>
        <h3 className={css("brief-nextup-title")}>
          {href ? (
            // Stretched link: the whole card opens the task, this anchor just
            // supplies the accessible label and hit-area (see ::after in CSS).
            <Link href={href} className={css("brief-nextup-title-link")}>
              {title}
            </Link>
          ) : (
            <span>{title}</span>
          )}
        </h3>
        <p className={css("brief-nextup-action")}>{nextAction}</p>
      </div>
    </div>
  );
}

/** Single bounded tile that holds at most MAX_NEXT_UP compact rows. */
function NextUpTile({
  entries,
  brief,
}: {
  entries: AttentionEntry[];
  brief: DailyBriefV2 | null;
}) {
  if (entries.length === 0) return null;
  return (
    <section className={css("brief-nextup-tile")}>
      <h2 className={css("brief-kicker")}>Next up</h2>
      {entries.map((entry, index) => (
        <NextUpRow
          key={entry.task?.id ?? entry.item?.jiraKey ?? entry.item?.title ?? index}
          entry={entry}
          brief={brief}
          index={index + 1}
        />
      ))}
    </section>
  );
}

export function HumanReadableTodayView({
  tasks,
  connectedProviderLabels,
  lastSyncAt,
  profileName,
  profileReady,
  meetings,
  calendarConnected,
  dailyBrief,
  failedProviderLabels,
}: HumanReadableTodayViewProps) {
  const attention = resolveAttention(tasks, dailyBrief, profileName);
  const primary = attention[0] ?? null;
  const nextTasks = attention.slice(1, 1 + MAX_NEXT_UP);
  const name = firstName(profileName);
  const dedupedBlockedWaiting = dailyBrief ? dedupeBlockedWaiting(dailyBrief.blockedWaiting) : [];
  const conflicts = dailyBrief?.sourceConflicts ?? [];
  const hasSideContent = nextTasks.length > 0 || calendarConnected || meetings.length > 0;

  return (
    <div className={css("brief-page")}>
      <header className={css("brief-header")}>
        <div>
          <Heading level={1}>{name ? `${name}'s focus for today` : "Your focus for today"}</Heading>
          <p className={css("brief-date")}>
            <span>{todayLabel()}</span>
            <span className={css("brief-date-sep")} aria-hidden>
              ·
            </span>
            <span className={css("brief-date-meta")}>What to do first today</span>
          </p>
        </div>
        <div className={css("brief-header-actions")}>
          <SyncMyDayButton sources={connectedProviderLabels} lastSyncAt={lastSyncAt} />
        </div>
      </header>

      {!profileReady ? (
        <div className={css("brief-alert brief-alert-blocked")} role="status">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <p>Add your name in Settings so this brief can filter work assigned to you.</p>
        </div>
      ) : null}

      {/* WL-12: sync health belongs on Today chrome itself, not only the sync overlay — a failed provider must stay visible until the next successful sync. */}
      {failedProviderLabels.length > 0 ? (
        <DismissibleDayChange
          title="Last sync was incomplete"
          text={`${failedProviderLabels.join(", ")} did not sync cleanly. Some evidence here may be out of date.`}
          tone="warning"
          icon={<AlertTriangle />}
          dismissLabel="Dismiss sync warning"
        />
      ) : null}

      {dailyBrief?.dayChange ? <DismissibleDayChange text={dailyBrief.dayChange.text} /> : null}

      {/* Full-width attention rail — triage-only, never competes with focus work */}
      <NeedsInputRail blockedWaiting={dedupedBlockedWaiting} conflicts={conflicts} />

      <div className={css(`brief-bento${hasSideContent ? "" : " brief-bento--wide"}`)}>
        {primary ? (
          <div className={css("brief-bento-primary")}>
            <FocusCard entry={primary} brief={dailyBrief} />
          </div>
        ) : (
          <section className={css("brief-empty brief-bento-primary")}>
            <Heading level={2} visualLevel={3}>Nothing clearly yours yet</Heading>
            <p>
              No open work is explicitly assigned to you. Sync again after updates, or leave the
              board empty rather than guessing.
            </p>
          </section>
        )}

        {hasSideContent ? (
          <aside className={css("brief-bento-side")}>
            {/* Next up first — work priority above the calendar */}
            <NextUpTile entries={nextTasks} brief={dailyBrief} />
            <TodayMeetingsCard meetings={meetings} calendarConnected={calendarConnected} />
          </aside>
        ) : null}
      </div>

      <p className={css("brief-footnote")}>
        Today shows one focus, up to two next tasks, and your meetings. Unclear work waits for your review.
        Ambiguous items stay in the attention rail above until you decide.
      </p>
    </div>
  );
}
