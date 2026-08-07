import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LockKeyhole,
} from "lucide-react";
import type { DailyBriefV2, DailyWorkItem } from "@/domain/dailyBrief";
import type { SourceType } from "@/domain/sourceItem";
import type { WorkTaskStatus } from "@/domain/workTask";
import type { TodayMeeting } from "@/lib/calendar/todayMeetings";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";
import { JiraStatusBadge } from "@/components/JiraMetadataBadges";
import { Heading } from "@/components/Heading";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { TodayMeetingsCard } from "@/components/TodayMeetingsCard";
import { NeedsInputRail } from "@/components/NeedsInputRail";
import { DismissibleDayChange } from "@/components/DismissibleDayChange";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { WhyThisButton } from "@/components/WhyThisButton";
import { dedupeBlockedWaiting } from "@/lib/dailyBrief/blockedWaitingDedupe";
import { addressUserInCopy } from "@/lib/tasks/addressUserInCopy";
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

/** Condensed for the focus status signal when the next action could not be verified. */
const ACTION_GAP_SIGNAL: Record<FocusCoherenceGap, string> = {
  ungrounded: "Needs confirmation before acting",
  "off-topic": "Needs clarification before acting",
};

const ACTION_GAP_HINT: Record<FocusCoherenceGap, string> = {
  ungrounded: "The next action is not backed by the task’s sources. Confirm it in the detail view before starting.",
  "off-topic": "The next action does not match the title and done criteria. Confirm it before starting.",
};

function firstFilled(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Compact next-up row under focus — two visible, the rest behind See more. */
const MAX_NEXT_UP_VISIBLE = 2;
const MAX_NEXT_UP_TOTAL = 6;
const MAX_ATTENTION = 1 + MAX_NEXT_UP_TOTAL;

function latestSignalTime(task: HumanReadableTask | null): number | null {
  if (!task) return null;
  const times = [
    ...task.evidence.map((evidence) => Date.parse(evidence.sourceDate)),
    Date.parse(task.updatedAt),
  ].filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

function nextUpcomingMeeting(meetings: TodayMeeting[]): TodayMeeting | null {
  const now = Date.now();
  const upcoming = meetings
    .filter((meeting) => {
      if (meeting.allDay || !meeting.startsAt) return false;
      const start = Date.parse(meeting.startsAt);
      if (!Number.isFinite(start)) return false;
      const end = meeting.endsAt ? Date.parse(meeting.endsAt) : start + 3_600_000;
      return Number.isFinite(end) && end > now;
    })
    .sort(
      (a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "")
    );
  return upcoming[0] ?? null;
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
} | null {
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
      description: ACTION_GAP_HINT[actionGap],
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
  // Default "To do" adds no signal on next-up cards — omit it.
  return null;
}

/** Drop a leading Jira key from the title when the same key already has a badge. */
function titleWithoutJiraKey(title: string, key: string | null): string {
  if (!key) return title;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = title
    .replace(new RegExp(`^${escaped}\\s*[·.:\\-–—|]\\s*`, "i"), "")
    .replace(new RegExp(`^${escaped}\\b\\s*`, "i"), "")
    .trim();
  return stripped || title;
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

  // Pad next-up from the owned queue so See more has something to reveal
  // beyond the brief's two afterThat slots. Never invent a focus here —
  // only fill when a primary already qualified.
  if (resolved.length > 0 && resolved.length < MAX_ATTENTION) {
    const usedIds = new Set(
      resolved.map((entry) => entry.task?.id).filter((id): id is number => id != null)
    );
    const usedKeys = new Set(
      resolved.map((entry) => jiraKey(entry)).filter((key): key is string => Boolean(key))
    );

    for (const task of ownedTasks) {
      if (usedIds.has(task.id)) continue;
      const key = task.title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
      if (key && usedKeys.has(key)) continue;
      resolved.push({ item: null, task });
      usedIds.add(task.id);
      if (key) usedKeys.add(key);
      if (resolved.length >= MAX_ATTENTION) break;
    }
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

type FocusSignalKind =
  | "blocked"
  | "clarify"
  | "waiting"
  | "review"
  | "continue"
  | "meeting"
  | "recent"
  | "ready";

interface FocusSignal {
  kind: FocusSignalKind;
  label: string;
  description: string | null;
}

/** Short essence of the task itself — what it is — not the ranking rationale. */
function focusSupportingSentence(
  entry: AttentionEntry,
  title: string,
  profileName: string | null
): string {
  const raw = firstFilled(entry.task?.reason, entry.item?.reason);
  if (!raw) {
    return "Clarify what this work requires, then take the next concrete step.";
  }
  return addressUserInCopy(humanizeReason(raw, title), profileName);
}

function resolveFocusSignal(
  entry: AttentionEntry,
  brief: DailyBriefV2 | null,
  actionGap: FocusCoherenceGap | null,
  nextMeeting: TodayMeeting | null
): FocusSignal | null {
  const item = entry.item;
  const task = entry.task;
  const key = jiraKey(entry);
  const blocked = brief?.blockedWaiting.some(
    (blockedItem) =>
      (key && blockedItem.jiraKey === key) ||
      blockedItem.title.toLowerCase() === (item?.title ?? task?.title ?? "").toLowerCase()
  );
  const copy = `${item?.reason ?? task?.reason ?? ""} ${item?.nextAction ?? task?.nextAction ?? ""} ${task?.priorityExplanation ?? ""}`;
  const waitingOn = task?.waitingOn?.trim();

  if (blocked || waitingOn) {
    const person = waitingOn
      ? waitingOn.replace(/^(waiting on|blocked by|blocked on)\s+/i, "").trim()
      : null;
    return {
      kind: "blocked",
      label: person
        ? `Waiting for ${person}`
        : blocked
          ? "Blocked"
          : "Waiting on someone else",
      description: "Something outside your control has to move before you can finish.",
    };
  }

  if (item?.statusHint === "unclear" || task?.status === "unclear" || actionGap) {
    return {
      kind: "clarify",
      label: actionGap ? ACTION_GAP_SIGNAL[actionGap] : "Needs clarification",
      description: actionGap ? ACTION_GAP_HINT[actionGap] : "Ownership or the requirement is unclear.",
    };
  }

  if (/\b(confirm|confirmation|sign[- ]?off|approval)\b/i.test(copy)) {
    return {
      kind: "waiting",
      label: "Waiting for approval",
      description: null,
    };
  }

  if (/\b(review|changes requested|feedback)\b/i.test(copy) || /\breview\b/i.test(task?.jiraStatus ?? "")) {
    return {
      kind: "review",
      label: "Needs review",
      description: null,
    };
  }

  if (task?.status === "waiting" || item?.statusHint === "waiting") {
    return {
      kind: "waiting",
      label: "Waiting to continue",
      description: "Paused until something outside your control changes.",
    };
  }

  if (task?.status === "now") {
    return {
      kind: "continue",
      label: "Ready to continue",
      description: null,
    };
  }

  if (nextMeeting?.startsAt) {
    const starts = Date.parse(nextMeeting.startsAt);
    const minutes = (starts - Date.now()) / 60_000;
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 120) {
      return {
        kind: "meeting",
        label: "Before your next meeting",
        description: nextMeeting.title ? `Next up: ${nextMeeting.title}` : null,
      };
    }
  }

  const latest = latestSignalTime(task);
  if (latest != null) {
    const hours = (Date.now() - latest) / 3_600_000;
    if (hours >= 0 && hours < 4) {
      return {
        kind: "recent",
        label: hours < 1 ? "New instruction received" : "Recently changed",
        description: null,
      };
    }
  }

  return {
    kind: "ready",
    label: "Needs attention now",
    description: null,
  };
}

function focusPrimaryLabel(signal: FocusSignal | null, status: WorkTaskStatus | undefined): string {
  switch (signal?.kind) {
    case "blocked":
      return "Resolve blocker";
    case "clarify":
      return "Clarify task";
    case "waiting":
      return "Check dependency";
    case "review":
      return "Review changes";
    case "continue":
      return "Continue";
    case "meeting":
      return "Prepare for meeting";
    default:
      return status === "now" ? "Continue" : "Start this task";
  }
}

/** The single most important task — the only one that should visually dominate the page. */
function FocusCard({
  entry,
  brief,
  nextMeeting,
  profileName,
}: {
  entry: AttentionEntry;
  brief: DailyBriefV2 | null;
  nextMeeting: TodayMeeting | null;
  profileName: string | null;
}) {
  // Live task fields win over the brief snapshot so the card never pairs a
  // stale action with fresher task state. Brief text is the fallback only.
  const rawTitle = firstFilled(entry.task?.title, entry.item?.title) ?? "Unresolved work";
  const title = addressUserInCopy(rawTitle, profileName);
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
    title: rawTitle,
    doneCriteria,
    evidence: entry.task?.evidence ?? [],
  });
  const support = focusSupportingSentence(entry, rawTitle, profileName);
  const signal = resolveFocusSignal(entry, brief, coherence.gap, nextMeeting);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;
  const primaryLabel = focusPrimaryLabel(signal, entry.task?.status);
  const whyFirst = addressUserInCopy(
    firstFilled(
      entry.task?.priorityExplanation,
      entry.item?.reason,
      entry.task?.reason
    ) ?? "",
    profileName
  );
  const signalClass =
    signal?.kind === "blocked" || signal?.kind === "clarify"
      ? "brief-focus-signal brief-focus-signal--alert"
      : signal?.kind === "waiting" || signal?.kind === "review"
        ? "brief-focus-signal brief-focus-signal--caution"
        : "brief-focus-signal";

  return (
    <article
      className={css("brief-focus-card brief-focus-primary")}
      aria-labelledby="today-focus-title"
    >
      <div className={css("brief-focus-context")}>
        <AppBadge tone="accent">Current focus</AppBadge>
      </div>

      <div className={css("brief-focus-heading")}>
        {href ? (
          <Link href={href} className={css("brief-focus-title-link")}>
            <Heading id="today-focus-title" level={2} visualLevel={2}>
              {title}
            </Heading>
          </Link>
        ) : (
          <Heading id="today-focus-title" level={2} visualLevel={2}>
            {title}
          </Heading>
        )}
        {support ? <p className={css("brief-focus-support")}>{support}</p> : null}
      </div>

      {signal ? (
        <p className={css(signalClass)} title={signal.description ?? undefined}>
          {addressUserInCopy(signal.label, profileName)}
        </p>
      ) : null}

      <div className={css("brief-focus-actions")}>
        {entry.task ? (
          <WhyThisButton
            whyFirst={whyFirst}
            evidence={entry.task.evidence}
            className={css("brief-focus-action-btn")}
          />
        ) : null}
        {href ? (
          <Link
            href={href}
            className={cn("link-btn-primary motion-btn", css("brief-focus-action-btn"))}
          >
            {primaryLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <p className={css("brief-focus-unlinked")}>
            Link a task before you can continue from here.
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Compact next-up card under focus: badges, headline, one short line
 * about what the work is. Full pillars live on the task detail page.
 */
function NextUpCard({
  entry,
  brief,
  index,
  profileName,
}: {
  entry: AttentionEntry;
  brief: DailyBriefV2 | null;
  index: number;
  profileName: string | null;
}) {
  const rawTitle = entry.item?.title ?? entry.task?.title ?? "Unresolved work";
  const key = jiraKey(entry);
  const title = addressUserInCopy(titleWithoutJiraKey(rawTitle, key), profileName);
  const support = focusSupportingSentence(entry, rawTitle, profileName);
  const badge = statusBadge(entry, brief, index);
  const href = entry.task ? `/tasks/${entry.task.id}` : null;
  const confidence = entry.task?.confidence ?? null;

  return (
    <div
      className={cn(
        styles["brief-nextup-card"],
        href && styles["brief-nextup-card--linked"]
      )}
    >
      <div className={css("brief-nextup-card-badges")}>
        {badge ? (
          <StatusBadge
            label={badge.label}
            description={badge.description}
            tone={badge.tone}
            Icon={badge.icon}
          />
        ) : null}
        <JiraStatusBadge status={entry.task?.jiraStatus ?? null} />
        {confidence != null ? <ConfidenceBadge level={confidence} /> : null}
        {key ? <AppBadge tone="neutral">{key}</AppBadge> : null}
      </div>
      <h3 className={css("brief-nextup-card-title")}>
        {href ? (
          <Link href={href} className={css("brief-nextup-card-title-link")}>
            {title}
          </Link>
        ) : (
          <span>{title}</span>
        )}
      </h3>
      <p className={css("brief-nextup-card-support")}>{support}</p>
    </div>
  );
}

/** Horizontal next-up row under focus; overflow sits behind a plain See more. */
function NextUpRail({
  entries,
  brief,
  profileName,
}: {
  entries: AttentionEntry[];
  brief: DailyBriefV2 | null;
  profileName: string | null;
}) {
  if (entries.length === 0) return null;

  const visible = entries.slice(0, MAX_NEXT_UP_VISIBLE);
  const extra = entries.slice(MAX_NEXT_UP_VISIBLE);

  return (
    <section className={css("brief-nextup")} aria-labelledby="today-nextup-title">
      <h2 id="today-nextup-title" className={css("brief-kicker")}>
        Next up
      </h2>
      <div className={css("brief-nextup-rail")}>
        {visible.map((entry, index) => (
          <NextUpCard
            key={entry.task?.id ?? entry.item?.jiraKey ?? entry.item?.title ?? index}
            entry={entry}
            brief={brief}
            index={index + 1}
            profileName={profileName}
          />
        ))}
        {extra.length > 0 ? (
          <details className={css("brief-nextup-more")}>
            <summary className={css("brief-nextup-more-summary")}>
              <span className={css("brief-nextup-more-open")}>See more</span>
              <span className={css("brief-nextup-more-close")}>Show less</span>
            </summary>
            <div className={css("brief-nextup-extra")}>
              {extra.map((entry, index) => (
                <NextUpCard
                  key={
                    entry.task?.id ??
                    entry.item?.jiraKey ??
                    entry.item?.title ??
                    index + MAX_NEXT_UP_VISIBLE
                  }
                  entry={entry}
                  brief={brief}
                  index={index + 1 + MAX_NEXT_UP_VISIBLE}
                  profileName={profileName}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
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
  const nextTasks = attention.slice(1, 1 + MAX_NEXT_UP_TOTAL);
  const dedupedBlockedWaiting = dailyBrief ? dedupeBlockedWaiting(dailyBrief.blockedWaiting) : [];
  const conflicts = dailyBrief?.sourceConflicts ?? [];
  const hasSideContent = calendarConnected || meetings.length > 0;
  const nextMeeting = nextUpcomingMeeting(meetings);

  return (
    <div className={css("brief-page")}>
      <header className={css("brief-header")}>
        <div className={css("brief-header-copy")}>
          <div className={css("brief-header-title-row")}>
            <Heading level={1} visualLevel={3}>
              Your focus for today
            </Heading>
            <div className={css("brief-header-actions")}>
              <SyncMyDayButton sources={connectedProviderLabels} lastSyncAt={lastSyncAt} />
            </div>
          </div>
          <p className={css("brief-lede")}>
            One focus to start, a short next-up list, and today&apos;s meetings — unclear work waits until you decide.
          </p>
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
            <FocusCard
              entry={primary}
              brief={dailyBrief}
              nextMeeting={nextMeeting}
              profileName={profileName}
            />
            <NextUpRail entries={nextTasks} brief={dailyBrief} profileName={profileName} />
          </div>
        ) : (
          <section className={css("brief-empty brief-bento-primary")} aria-labelledby="today-focus-empty-title">
            <div className={css("brief-focus-context")}>
              <AppBadge tone="accent">Current focus</AppBadge>
            </div>
            <Heading id="today-focus-empty-title" level={2} visualLevel={2}>
              Nothing clearly yours yet
            </Heading>
            <p className={css("brief-focus-support")}>
              No open work is explicitly assigned to you. Sync again after updates, or leave the
              board empty rather than guessing.
            </p>
            <div className={css("brief-focus-actions")}>
              <SyncMyDayButton sources={connectedProviderLabels} lastSyncAt={lastSyncAt} />
            </div>
          </section>
        )}

        {hasSideContent ? (
          <aside className={css("brief-bento-side")}>
            <TodayMeetingsCard meetings={meetings} calendarConnected={calendarConnected} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
