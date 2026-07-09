"use client";

import { useMemo } from "react";
import type { WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import type { StoredTodayBriefing } from "@/lib/llm/prompts/todayBriefing";
import type { DailyMemory } from "@/domain/dailyMemory";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import type { TodayQueue } from "@/lib/filters/ownerFilter";
import {
  filterBriefingByOwners,
  filterQueueByOwners,
  myOwnerFilter,
} from "@/lib/filters/ownerFilter";
import { resolveFocusLinkedTaskId } from "@/lib/tasks/resolveFocusTask";
import { quotesToEvidenceItems } from "@/lib/briefing/evidence";
import type { SourceType } from "@/domain/sourceItem";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { ProjectAssignDropdown } from "@/components/ProjectAssignDropdown";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";
import { EndDayButton } from "@/components/EndDayButton";
import { TodayBriefing } from "@/components/TodayBriefing";
import { ResumeCard } from "@/components/ResumeCard";
import { TodayQueueTabs, type QueueTab } from "@/components/TodayQueueTabs";

const QUEUE_META: Record<
  Exclude<WorkTaskStatus, "done">,
  { title: string; description: string }
> = {
  now: { title: "Also in Now", description: "Started alongside the primary focus." },
  next: { title: "Next", description: "Ready when focus clears." },
  later: { title: "Later", description: "Not urgent, but on the radar." },
  waiting: { title: "Waiting", description: "Blocked on someone else — not your active work." },
  tomorrow: { title: "Tomorrow", description: "Scheduled to start tomorrow." },
  unclear: { title: "Unclear", description: "Needs your decision before work starts." },
};

function findTaskByTitle(
  tasks: WorkTaskWithEvidence[],
  title: string
): WorkTaskWithEvidence | undefined {
  const normalized = title.trim().toLowerCase();
  return (
    tasks.find((task) => task.title.trim().toLowerCase() === normalized) ??
    tasks.find((task) => {
      const taskTitle = task.title.trim().toLowerCase();
      return taskTitle.includes(normalized) || normalized.includes(taskTitle);
    })
  );
}

function isActionableTask(task: WorkTaskWithEvidence): boolean {
  return task.status !== "waiting" && !task.waitingOn;
}

interface SourceLookup {
  id: number;
  title: string;
  body: string;
  sourceType: SourceType;
  sourceDate: string;
  url: string | null;
}

export interface TodayFilteredViewProps {
  dateLabel: string;
  greeting: string;
  queue: TodayQueue;
  todayBriefing: StoredTodayBriefing | null;
  resumeMemory: DailyMemory | null;
  myName: string | null;
  connectedProviderLabels: string[];
  projectOptions: { id: number; name: string }[];
  projectNameById: Record<number, string>;
  sourceLookup: SourceLookup[];
}

export function TodayFilteredView({
  dateLabel,
  greeting,
  queue: fullQueue,
  todayBriefing: fullBriefing,
  resumeMemory,
  myName,
  connectedProviderLabels,
  projectOptions,
  projectNameById,
  sourceLookup,
}: TodayFilteredViewProps) {
  const selectedOwners = useMemo(() => myOwnerFilter(myName), [myName]);

  const allTasksById = useMemo(() => {
    const map = new Map<number, WorkTaskWithEvidence>();
    for (const status of OPEN_QUEUE_STATUSES) {
      for (const task of fullQueue[status]) {
        map.set(task.id, task);
      }
    }
    return map;
  }, [fullQueue]);

  const queue = useMemo(
    () => filterQueueByOwners(fullQueue, selectedOwners, myName),
    [fullQueue, selectedOwners, myName]
  );

  const jiraSourceByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const source of sourceLookup) {
      if (source.sourceType !== "jira") continue;
      const match = source.title.match(/^([A-Z][A-Z0-9]+-\d+):/);
      if (match) map.set(match[1], source.body);
    }
    return map;
  }, [sourceLookup]);

  const todayBriefing = useMemo(
    () =>
      fullBriefing
        ? filterBriefingByOwners(
            fullBriefing,
            allTasksById,
            selectedOwners,
            myName,
            jiraSourceByKey
          )
        : null,
    [fullBriefing, allTasksById, selectedOwners, myName, jiraSourceByKey]
  );

  const sourceById = useMemo(
    () => new Map(sourceLookup.map((source) => [source.id, source])),
    [sourceLookup]
  );

  const totalOpen = OPEN_QUEUE_STATUSES.reduce((sum, status) => sum + queue[status].length, 0);
  const primaryTask = queue.now[0] ?? queue.next[0] ?? null;
  const primaryIsSuggested = !queue.now[0] && primaryTask != null;
  const briefingTaskIds = new Set(
    (todayBriefing?.focusItems ?? [])
      .map((item) => item.linkedTaskId)
      .filter((id): id is number => id != null)
  );

  const allOpenTasks = useMemo(
    () => OPEN_QUEUE_STATUSES.flatMap((status) => queue[status]),
    [queue]
  );

  const allOpenTasksForResolve = useMemo(
    () => OPEN_QUEUE_STATUSES.flatMap((status) => fullQueue[status]),
    [fullQueue]
  );

  const resumeFocusTask = useMemo(() => {
    if (!resumeMemory?.firstTomorrow) return null;
    return findTaskByTitle(allOpenTasks, resumeMemory.firstTomorrow) ?? null;
  }, [resumeMemory, allOpenTasks]);

  const resumeFallbackTask = useMemo(() => {
    if (!resumeMemory) return null;
    const fromStillOpen = resumeMemory.stillOpen
      .map((title) => findTaskByTitle(allOpenTasks, title))
      .find((task) => task && isActionableTask(task));
    if (fromStillOpen) return fromStillOpen;
    return (
      queue.next.find(isActionableTask) ??
      queue.now.find(isActionableTask) ??
      queue.later.find(isActionableTask) ??
      null
    );
  }, [resumeMemory, allOpenTasks, queue]);

  const showResumeCard =
    resumeMemory != null &&
    (!todayBriefing || todayBriefing.focusItems.length === 0);

  function renderTask(task: WorkTaskWithEvidence, options?: { primary?: boolean }) {
    return (
      <div key={task.id}>
        <TaskCard
          id={task.id}
          title={task.title}
          reason={task.reason}
          nextAction={task.nextAction}
          doneCriteria={task.doneCriteria}
          status={task.status}
          priorityScore={task.priorityScore}
          confidence={task.confidence}
          waitingOn={task.waitingOn}
          owner={task.owner}
          dueDate={task.dueDate}
          projectName={task.projectId ? projectNameById[task.projectId] : null}
          primary={options?.primary}
          latestVerificationReport={task.latestVerificationReport}
          latestSyncReviewReport={task.latestSyncReviewReport}
          figmaFrameUrl={task.figmaFrameUrl}
          localRepoPath={task.localRepoPath}
          githubRepo={task.githubRepo}
          evidence={task.evidence.map((entry) => {
            const source = sourceById.get(entry.sourceItemId);
            return {
              id: entry.id,
              quote: entry.quote,
              summary: entry.summary,
              sourceTitle: source?.title,
              sourceType: source?.sourceType,
              sourceUrl: source?.url ?? null,
              sourceDate: source?.sourceDate ?? null,
            };
          })}
        />
        {task.projectId === null ? (
          <ProjectAssignDropdown
            taskId={task.id}
            projects={projectOptions}
            initialProjectId={task.projectId}
          />
        ) : null}
      </div>
    );
  }

  type OpenStatus = Exclude<WorkTaskStatus, "done">;
  const TODAY_STATUSES: OpenStatus[] = ["now", "next"];
  const DEFERRED_STATUSES: OpenStatus[] = ["later", "waiting", "tomorrow", "unclear"];

  function buildQueueTab(status: OpenStatus): QueueTab {
    const meta = QUEUE_META[status];
    const items = queue[status].filter(
      (task) => task.id !== primaryTask?.id && !briefingTaskIds.has(task.id)
    );
    return {
      id: status,
      label: meta.title,
      description: meta.description,
      count: items.length,
      unclear: status === "unclear",
      content: items.map((task) => renderTask(task)),
    };
  }

  const queueTabs = TODAY_STATUSES.map(buildQueueTab);
  const deferredTabs = DEFERRED_STATUSES.map(buildQueueTab);

  function evidenceForFocusItem(
    item: NonNullable<typeof todayBriefing>["focusItems"][number],
    linkedTask: WorkTaskWithEvidence | undefined
  ) {
    if (linkedTask && linkedTask.evidence.length > 0) {
      return linkedTask.evidence.map((entry) => {
        const source = sourceById.get(entry.sourceItemId);
        return {
          id: entry.id,
          quote: entry.quote,
          summary: entry.summary,
          sourceTitle: source?.title,
          sourceType: source?.sourceType,
          sourceUrl: source?.url ?? null,
          sourceDate: source?.sourceDate ?? null,
        };
      });
    }

    return quotesToEvidenceItems(
      item.evidenceQuotes.map((entry) => entry.quote),
      sourceLookup
    );
  }

  const hasBriefingContent = Boolean(
    todayBriefing &&
      (todayBriefing.focusItems.length > 0 ||
        todayBriefing.knowledgeHighlights.length > 0 ||
        todayBriefing.waitingOn.length > 0 ||
        todayBriefing.risks.length > 0)
  );

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            {greeting}.
          </h1>
          {myName ? (
            <p className="mt-3 text-[14px] text-muted">
              Only work assigned to{" "}
              <span className="font-medium text-foreground">{myName}</span>
            </p>
          ) : (
            <p className="mt-3 text-[14px] text-muted">
              Set your name in{" "}
              <a href="/settings" className="font-medium text-accent hover:underline">
                Settings
              </a>{" "}
              to hide other people&apos;s tasks.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-1.5">
          <SyncMyDayButton sources={connectedProviderLabels} />
          <EndDayButton />
        </div>
      </div>

      {!myName ? (
        <EmptyState
          title="Your name is not set."
          description="Add your name in Settings so Morning can show only tasks and Jira issues assigned to you."
        />
      ) : null}

      {myName && showResumeCard ? (
        <ResumeCard
          memory={resumeMemory}
          focusTask={resumeFocusTask}
          fallbackTask={resumeFallbackTask}
        />
      ) : null}

      {myName && hasBriefingContent && todayBriefing ? (
        <TodayBriefing
          summary={todayBriefing.summary}
          generatedAt={todayBriefing.generatedAt}
          focusItems={todayBriefing.focusItems.map((item) => {
            const resolvedTaskId = resolveFocusLinkedTaskId(
              item.linkedTaskId,
              item.linkedJiraKey,
              allOpenTasksForResolve
            );
            const linkedTask =
              resolvedTaskId != null ? allTasksById.get(resolvedTaskId) : undefined;
            const evidence = evidenceForFocusItem(item, linkedTask);
            const linkedJiraUrl =
              evidence.find((entry) => entry.sourceType === "jira" && entry.sourceUrl)?.sourceUrl ??
              todayBriefing.jiraPending.find((issue) => issue.key === item.linkedJiraKey)?.url ??
              null;
            return {
              title: item.title,
              reason: item.reason,
              nextAction: item.nextAction,
              actionSteps: item.actionSteps,
              referenceLinks: item.referenceLinks,
              doneCriteria: item.doneCriteria,
              evidence,
              linkedTaskId: resolvedTaskId,
              linkedJiraKey: item.linkedJiraKey,
              linkedJiraUrl,
              priorityExplanation:
                item.priorityExplanation ??
                "Ranked from queue position, Jira priority, due dates, and evidence recency.",
              latestVerificationReport: linkedTask?.latestVerificationReport ?? null,
              latestSyncReviewReport: linkedTask?.latestSyncReviewReport ?? null,
              figmaFrameUrl: linkedTask?.figmaFrameUrl ?? null,
              localRepoPath: linkedTask?.localRepoPath ?? null,
              githubRepo: linkedTask?.githubRepo ?? null,
            };
          })}
          jiraPending={todayBriefing.jiraPending.map((item) => ({
            key: item.key,
            title: item.title,
            status: item.status,
            reason: item.reason,
            nextAction: item.nextAction,
            actionSteps: item.actionSteps,
            referenceLinks: item.referenceLinks,
            doneCriteria: item.doneCriteria,
            evidence: quotesToEvidenceItems(
              item.evidenceQuotes.map((entry) => entry.quote),
              sourceLookup
            ),
            url: item.url ?? null,
            priorityExplanation: item.priorityExplanation,
          }))}
          knowledgeHighlights={todayBriefing.knowledgeHighlights.map((item) => ({
            title: item.title,
            content: item.content,
            type: item.type,
            evidence: quotesToEvidenceItems(
              item.evidenceQuotes.map((entry) => entry.quote),
              sourceLookup
            ),
          }))}
          waitingOn={todayBriefing.waitingOn}
          risks={todayBriefing.risks}
          jiraIssueCount={todayBriefing.jiraIssueCount}
          sourcesUsed={todayBriefing.sourcesUsed ?? []}
          connectedProviders={todayBriefing.connectedProviders ?? []}
        />
      ) : null}

      {myName && totalOpen === 0 && !hasBriefingContent ? (
        <EmptyState
          title="Nothing assigned to you right now."
          description="Sync my day to refresh Jira and sources, or check that task owners match your name in Settings."
        />
      ) : myName ? (
        <>
          {primaryTask && (!todayBriefing || todayBriefing.focusItems.length === 0) ? (
            <section>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="eyebrow text-warm">Start here</h2>
                {primaryIsSuggested ? (
                  <span className="text-[13px] text-muted">
                    Nothing is marked Now — this is the strongest Next task.
                  </span>
                ) : null}
              </div>
              <div className="mt-4">{renderTask(primaryTask, { primary: true })}</div>
            </section>
          ) : null}

          {totalOpen > 0 ? (
            <>
              {queueTabs.some((tab) => tab.count > 0) ? (
                todayBriefing && todayBriefing.focusItems.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer list-none">
                      <span className="eyebrow text-muted-soft transition-colors hover:text-muted">
                        Pending tasks for today
                        <span className="ml-1.5 font-normal">
                          ({queueTabs.reduce((sum, tab) => sum + tab.count, 0)})
                        </span>
                      </span>
                    </summary>
                    <div className="mt-4">
                      <TodayQueueTabs tabs={queueTabs.filter((tab) => tab.count > 0)} />
                    </div>
                  </details>
                ) : (
                  <TodayQueueTabs tabs={queueTabs} />
                )
              ) : null}

              {deferredTabs.some((tab) => tab.count > 0) ? (
                <details>
                  <summary className="cursor-pointer list-none">
                    <span className="eyebrow text-muted-soft transition-colors hover:text-muted">
                      Later &amp; waiting
                      <span className="ml-1.5 font-normal">
                        ({deferredTabs.reduce((sum, tab) => sum + tab.count, 0)})
                      </span>
                    </span>
                  </summary>
                  <div className="mt-4">
                    <TodayQueueTabs tabs={deferredTabs.filter((tab) => tab.count > 0)} />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
