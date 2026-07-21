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
import { filterQueueByOwners, myOwnerFilter, taskEligibleForBriefPriority } from "@/lib/filters/ownerFilter";
import { filterTasksForTodayView } from "@/lib/tasks/taskVisibility";
import { deriveSyncFreshnessState } from "@/components/SyncFreshnessBanner";
import { HumanReadableTodayView } from "@/components/HumanReadableTodayView";

export const dynamic = "force-dynamic";

const CONNECTED_PROVIDER_LABEL: Record<ConnectionProvider, string> = {
  gmail: "Gmail & Gemini notes",
  calendar: "Google Calendar",
  drive: "Google Drive Gemini notes",
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

  const connectedProviderLabels = connections
    .filter((connection) => connection.status === "connected")
    .map((connection) => CONNECTED_PROVIDER_LABEL[connection.provider as ConnectionProvider])
    .filter(Boolean);

  const syncFreshness = deriveSyncFreshnessState(latestSync);
  const sourceTitleById = Object.fromEntries(sourceItems.map((source) => [source.id, source.title]));

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
      dailyBrief={dailyBrief}
      syncFreshness={syncFreshness}
      sourceTitleById={sourceTitleById}
    />
  );
}
