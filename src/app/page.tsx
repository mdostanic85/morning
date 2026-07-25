import { getTodayQueue } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { getTodayBriefing } from "@/lib/tasks/todayBriefing";
import { getTodayDailyBrief } from "@/lib/dailyBrief/buildDailyBrief";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { getLatestFinishedSyncRun } from "@/services/syncRuns";
import { resolveFocusLinkedTaskId } from "@/lib/tasks/resolveFocusTask";
import { getTodayMeetings } from "@/lib/calendar/todayMeetings";
import {
  classifyTaskOwnership,
  filterQueueByOwners,
  myOwnerFilter,
  taskEligibleForBriefPriority,
} from "@/lib/filters/ownerFilter";
import { filterTasksForTodayView } from "@/lib/tasks/taskVisibility";
import {
  latestSignalDate,
  needsInputItemIsRelevant,
} from "@/lib/dailyBrief/needsInputRelevance";
import { humanizeReason } from "@/lib/tasks/humanizeReason";
import { HumanReadableTodayView } from "@/components/HumanReadableTodayView";

export const dynamic = "force-dynamic";

const CONNECTED_PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  gmail: "Gemini notes",
  calendar: "Google Calendar",
  drive: "Gemini notes",
  jira: "Jira",
  confluence: "Confluence",
  granola: "Granola",
  github: "GitHub",
  discord: "Discord",
  figma: "Figma",
};

export default async function TodayPage() {
  const [
    rawQueue,
    sourceItems,
    connections,
    profile,
    todayBriefing,
    dailyBrief,
    latestSync,
    todayMeetings,
  ] = await Promise.all([
      getTodayQueue(),
      getSourceItems(),
      getConnections(),
      getUserProfile(),
      getTodayBriefing(),
      getTodayDailyBrief(),
      getLatestFinishedSyncRun(),
      getTodayMeetings(),
    ]);

  const myName = profile?.name?.trim() || null;
  const queue = filterQueueByOwners(rawQueue, myOwnerFilter(myName), myName);

  // The stored daily brief is only recomputed on sync, so reconcile its
  // "Needs your input" list against live task state — a task the user just
  // claimed ("This is mine" → queued) or disowned ("Not mine") must drop out
  // of this bucket immediately, without waiting for the next sync.
  const liveTaskById = new Map(
    OPEN_QUEUE_STATUSES.flatMap((status) => rawQueue[status]).map((task) => [task.id, task] as const)
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const reconciledBrief = dailyBrief
    ? {
        ...dailyBrief,
        blockedWaiting: dailyBrief.blockedWaiting
          .filter((item) => {
            if (item.taskId == null) return true;
            const task = liveTaskById.get(item.taskId);
            if (!task) return false;
            if ((task.status === "now" || task.status === "next") && !task.waitingOn) return false;
            const ownership = classifyTaskOwnership(
              {
                owner: task.owner,
                title: task.title,
                reason: task.reason,
                nextAction: task.nextAction,
              },
              myName
            );
            if (ownership === "other") return false;
            // Enforce the same freshness + mention gate as the composer so a
            // cached brief cannot keep showing stale or never-me items until
            // the next full sync.
            return needsInputItemIsRelevant({
              ownership,
              text: [
                task.title,
                task.reason,
                task.nextAction,
                ...task.evidence.map((ev) => `${ev.quote ?? ""} ${ev.summary}`),
              ].join("\n"),
              latestSignalDate: latestSignalDate(task.evidence.map((ev) => ev.sourceDate)),
              myName,
              today: todayIso,
            });
          })
          .map((item) => {
            // Show the task's own description (its "why"), clamped to two lines
            // on the card — prefer the live task so edits reflect immediately.
            const task = item.taskId != null ? liveTaskById.get(item.taskId) : null;
            return {
              ...item,
              description: task
                ? humanizeReason(task.reason, task.title)
                : item.description,
            };
          }),
      }
    : null;

  const connectedProviderLabels = connections
    .filter(
      (connection) => connection.status === "connected" && connection.provider !== "drive"
    )
    .map((connection) => CONNECTED_PROVIDER_LABEL[connection.provider as ConnectionProvider])
    .filter(Boolean);

  // WL-12: sync health belongs on Today chrome, not only the sync overlay —
  // driven by the now-honest per-provider status (WL-01).
  const failedProviderLabels = (latestSync?.providerRuns ?? [])
    .filter(
      (providerRun) =>
        providerRun.provider !== "drive" &&
        (providerRun.status === "failed" || providerRun.status === "cancelled")
    )
    .map(
      (providerRun) =>
        CONNECTED_PROVIDER_LABEL[providerRun.provider as ConnectionProvider] ?? providerRun.provider
    );

  // Never drop valid tasks because priorityScore was copied into confidence.
  // Brief cards only use work that is clearly owned — never pad with unclear/
  // someone-else's meeting items.
  const allOpenTasks = filterTasksForTodayView(
    OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]),
    myName
  ).filter((task) =>
    taskEligibleForBriefPriority(
      {
        owner: task.owner,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
      },
      myName
    )
  );
  // Live queue wins over a cached briefing. Briefing only enriches the same
  // task — otherwise a stale focusItems[0] can hide the real top priority.
  const primaryTask = queue.now[0] ?? queue.next[0] ?? null;
  const briefingFocusByTaskId = new Map(
    (todayBriefing?.focusItems ?? []).flatMap((item) => {
      const linkedId = resolveFocusLinkedTaskId(
        item.linkedTaskId,
        item.linkedJiraKey,
        allOpenTasks
      );
      return linkedId == null ? [] : [[linkedId, item] as const];
    })
  );
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const tasks = allOpenTasks.map((task) => {
    const focus = briefingFocusByTaskId.get(task.id);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      reason: focus?.reason || task.reason,
      nextAction: focus?.nextAction || task.nextAction,
      actionSteps: focus?.actionSteps ?? [],
      todayWorkSummary: focus?.todayWorkSummary ?? [],
      priorityExplanation: focus?.priorityExplanation ?? null,
      doneCriteria: focus?.doneCriteria.length ? focus.doneCriteria : task.doneCriteria,
      figmaAudit: task.latestSyncReviewReport
        ? {
            summary: task.latestSyncReviewReport.summary,
            ok: task.latestSyncReviewReport.ok,
            notOk: task.latestSyncReviewReport.notOk,
            conflicts: task.latestSyncReviewReport.conflicts,
            recommendedNextAction: task.latestSyncReviewReport.recommendedNextAction,
            figmaUrl: task.latestSyncReviewReport.figmaUrl,
          }
        : null,
      confidence: task.confidence,
      waitingOn: task.waitingOn,
      owner: task.owner,
      updatedAt: task.updatedAt,
      evidence: task.evidence.map((item) => ({
        summary: item.summary,
        quote: item.quote,
        sourceDate: item.sourceDate,
        url: item.url,
        sourceTitle: sourceById.get(item.sourceItemId)?.title ?? "Source",
        sourceType: sourceById.get(item.sourceItemId)?.sourceType ?? null,
      })),
    };
  });

  const normalizedTitle = (title: string) => title.trim().toLowerCase();
  const orderedTasks = primaryTask
    ? [
        ...tasks.filter((task) => task.id === primaryTask.id),
        // Same-title duplicates of the urgent task never compete with it.
        ...tasks.filter(
          (task) =>
            task.id !== primaryTask.id &&
            normalizedTitle(task.title) !== normalizedTitle(primaryTask.title)
        ),
      ]
    : tasks;

  return (
    <HumanReadableTodayView
      tasks={orderedTasks}
      connectedProviderLabels={connectedProviderLabels}
      lastSyncAt={
        latestSync?.run.completedAt ?? latestSync?.run.startedAt ?? null
      }
      profileName={profile?.name?.trim() || null}
      profileReady={Boolean(profile?.name?.trim())}
      meetings={todayMeetings.meetings}
      calendarConnected={todayMeetings.calendarConnected}
      dailyBrief={reconciledBrief}
      failedProviderLabels={failedProviderLabels}
    />
  );
}
