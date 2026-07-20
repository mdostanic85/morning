import { getTodayQueue } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { getConnections } from "@/services/connections";
import { getUserProfile } from "@/services/userProfile";
import { getTodayBriefing } from "@/lib/tasks/todayBriefing";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { ConnectionProvider } from "@/lib/connectors/providers";
import { getLatestFinishedSyncRun } from "@/services/syncRuns";
import { resolveFocusLinkedTaskId } from "@/lib/tasks/resolveFocusTask";
import { MinimalTodayView } from "@/components/MinimalTodayView";

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
  const [queue, sourceItems, connections, profile, todayBriefing, latestSync] =
    await Promise.all([
      getTodayQueue(),
      getSourceItems(),
      getConnections(),
      getUserProfile(),
      getTodayBriefing(),
      getLatestFinishedSyncRun(),
    ]);

  const connectedProviderLabels = connections
    .filter((connection) => connection.status === "connected")
    .map((connection) => CONNECTED_PROVIDER_LABEL[connection.provider as ConnectionProvider])
    .filter(Boolean);

  const MIN_CONFIDENCE = 0.8;

  const allOpenTasks = OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]).filter(
    (task) => task.confidence == null || task.confidence >= MIN_CONFIDENCE
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
  const briefingFocus =
    primaryTask == null ? null : briefingFocusByTaskId.get(primaryTask.id) ?? null;

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

  // The main-card bullets must contain the synthesized work itself, never
  // instructions that hand source research back to the user.
  const isResearchInstruction = (value: string) =>
    /^\s*(open|read|review|check|inspect|compare|consult|look at|go through)\b/i.test(
      value
    );
  const isGenericOutcome = (value: string) =>
    /\b(has been reviewed|necessary actions? (or updates )?have been taken|work is complete|feedback (is )?addressed|updates? have been (made|taken))\b/i.test(
      value
    ) ||
    /^\s*(the jira issue|any necessary)\b/i.test(value);
  const workSummary = (briefingFocus?.todayWorkSummary ?? []).filter(
    (item) => !isResearchInstruction(item) && !isGenericOutcome(item)
  );
  const executionSteps = (briefingFocus?.actionSteps ?? []).filter(
    (item) => !isResearchInstruction(item) && !isGenericOutcome(item)
  );
  // Never fall back to doneCriteria here — those are outcomes, not today's work.
  const bulletSource =
    workSummary.length > 0 ? workSummary : executionSteps.length > 0 ? executionSteps : [];
  const primarySubtasks = bulletSource
    .slice(0, 5)
    .map((label) => ({ label, agreed: null }));

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
    <MinimalTodayView
      tasks={orderedTasks}
      connectedProviderLabels={connectedProviderLabels}
      sourceCount={todayBriefing?.sourceCount ?? sourceItems.length}
      lastSyncAt={
        latestSync?.run.completedAt ?? latestSync?.run.startedAt ?? null
      }
      profileReady={Boolean(profile?.name?.trim())}
      primarySummary={briefingFocus?.reason ?? null}
      primaryWhyFirst={briefingFocus?.priorityExplanation ?? null}
      primarySubtasks={primarySubtasks}
    />
  );
}
