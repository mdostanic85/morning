import { createHash } from "node:crypto";
import {
  DAILY_BRIEF_SCHEMA_VERSION,
  dailyBriefV2Schema,
  type DailyBriefV2,
  type DailyWorkItem,
} from "@/domain/dailyBrief";
import type { SourceItem } from "@/domain/sourceItem";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import {
  resolveCanonicalKeyForTask,
  issueKeyFromCanonicalKey,
  isJiraDoneMetadata,
} from "@/lib/tasks/canonicalKey";
import { isNewJiraAssignment } from "@/lib/tasks/claimAwareRanking";
import { rankWorkTasks, type WorkTaskForRanking } from "@/lib/tasks/priorityRank";
import type { AttendanceContext } from "@/lib/tasks/sourceAuthority";
import { buildCoverageWarnings, buildMeetingPrep } from "@/lib/dailyBrief/coverage";
import { parseLinkedJiraRefs, resolveLinkedJiraEvidence } from "@/lib/tasks/linkedJiraRetrieval";
import { jiraKeyForTask } from "@/lib/tasks/transcriptTaskMerge";
import { detectJiraDoneVsOpenTaskConflicts } from "@/lib/tasks/conflictDetection";
import { detectSelfReportedCompletion } from "@/lib/tasks/completionEvidence";
import {
  classifyTaskOwnership,
  taskEligibleForBriefPriority,
} from "@/lib/filters/ownerFilter";
import {
  latestSignalDate,
  needsInputItemIsRelevant,
} from "@/lib/dailyBrief/needsInputRelevance";
import { isRejectedOwnership } from "@/lib/tasks/ownershipDecision";

export type ComposerTask = WorkTaskForRanking & {
  owner: string | null;
  confidence: number | null;
  canonicalKey?: string | null;
  ownershipDecision?: import("@/domain/workTask").OwnershipDecision | null;
};

export type PreviousBriefMemory = {
  todayFirstJiraKey: string | null;
  todayFirstTitle: string | null;
};

export type ComposeDailyBriefInput = {
  today: string;
  tasks: ComposerTask[];
  sources: SourceItem[];
  jiraPending: JiraPendingSnapshot[];
  meetings: { title: string; startAt?: string | null }[];
  attendance?: AttendanceContext;
  previousBrief?: PreviousBriefMemory | null;
  myName?: string | null;
  /** Injectable clock for stable scenario fixtures; defaults to Date.now(). */
  nowMs?: number;
};

function inputHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function toWorkItem(
  task: ComposerTask,
  sources: SourceItem[],
  kind: DailyWorkItem["kind"],
  statusHint?: DailyWorkItem["statusHint"]
): DailyWorkItem {
  const evidenceIds = task.evidence.map((item) => item.sourceItemId);
  const canonicalKey =
    task.canonicalKey ??
    resolveCanonicalKeyForTask({
      title: task.title,
      evidenceText: task.evidence.map((item) => item.summary).join(" "),
    });
  const evidenceJiraKey = evidenceIds
    .map((id) => sources.find((source) => source.id === id))
    .find((source): source is SourceItem => source?.sourceType === "jira")
    ?.sourceExternalId?.toUpperCase();
  const jiraKey =
    issueKeyFromCanonicalKey(canonicalKey) ?? jiraKeyForTask(task) ?? evidenceJiraKey ?? null;
  const sourceLinks = evidenceIds
    .map((id) => sources.find((source) => source.id === id))
    .filter((source): source is SourceItem => source != null)
    .map((source) => ({
      label: source.title,
      url: source.url,
    }));

  return {
    title: task.title,
    reason: task.reason,
    nextAction: task.nextAction,
    doneCriteria: task.doneCriteria.length
      ? task.doneCriteria
      : ["Source-backed outcome is recorded and linked from the task."],
    evidenceIds,
    sourceLinks,
    canonicalKey,
    jiraKey,
    taskId: task.id,
    kind,
    statusHint,
  };
}

/**
 * Deterministic DailyBriefV2 composer over already-synced evidence.
 * No connector fetch. LLM synthesis can wrap this later; invalid LLM must fall back here.
 */
export function composeDailyBriefV2(input: ComposeDailyBriefInput): DailyBriefV2 {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const jiraByKey = new Map(input.jiraPending.map((issue) => [issue.key.toUpperCase(), issue]));

  // Resolve a task's Jira key from every signal available — canonical key,
  // title, and cited evidence — not just the title. A task like "Content
  // File Manager" may never spell its Jira key in the title at all.
  const composerJiraKey = (task: ComposerTask): string | null => {
    const fromCanonical = issueKeyFromCanonicalKey(task.canonicalKey ?? null);
    if (fromCanonical) return fromCanonical;
    const fromTitle = jiraKeyForTask(task);
    if (fromTitle) return fromTitle;
    for (const item of task.evidence) {
      const source = sourceById.get(item.sourceItemId);
      if (source?.sourceType === "jira" && source.sourceExternalId) {
        return source.sourceExternalId.toUpperCase();
      }
    }
    return null;
  };

  // A task's Jira issue is Done when ANY cited evidence source (regardless
  // of title) or the freshest Jira snapshot says so. Evidence wins over
  // stale in-app status/manual pins — Jira is the authority for status.
  const isTaskJiraDone = (task: ComposerTask): boolean => {
    const evidenceDone = task.evidence.some((item) => {
      const source = sourceById.get(item.sourceItemId);
      return source?.sourceType === "jira" && isJiraDoneMetadata(source.metadata);
    });
    if (evidenceDone) return true;
    const key = composerJiraKey(task);
    if (!key) return false;
    const source = input.sources.find(
      (item) => item.sourceType === "jira" && item.sourceExternalId?.toUpperCase() === key
    );
    if (source && isJiraDoneMetadata(source.metadata)) return true;
    const pending = jiraByKey.get(key);
    return Boolean(pending && /done|closed|resolved/i.test(pending.status));
  };

  // A task's own freshest evidence can self-report the work is finished
  // (e.g. a meeting note saying "the design has been finalized") even
  // without a Jira ticket. Treat that the same as Jira Done: not active work.
  const isTaskSelfReportedComplete = (task: ComposerTask): boolean =>
    detectSelfReportedCompletion(
      task.evidence.map((item) => {
        const source = sourceById.get(item.sourceItemId);
        return {
          sourceItemId: item.sourceItemId,
          quote: item.quote,
          summary: item.summary,
          sourceDate: source?.sourceDate ?? "",
        };
      })
    ) != null;

  const myName = input.myName ?? input.attendance?.myName ?? null;

  const jiraAssigneeForTask = (task: ComposerTask): string | null => {
    const key = composerJiraKey(task);
    if (!key) return null;
    return jiraByKey.get(key)?.assignee ?? null;
  };

  // Exclude Done / self-reported complete work, then keep only the user's
  // owned tasks in the ranked priority pool. Someone else's action item must
  // never become todayFirst / afterThat.
  const activeTasks = input.tasks.filter(
    (task) =>
      !isTaskJiraDone(task) && !isTaskSelfReportedComplete(task) && !isRejectedOwnership(task)
  );
  const ownedForPriority = activeTasks.filter((task) =>
    taskEligibleForBriefPriority(
      {
        owner: task.owner,
        title: task.title,
        reason: task.reason,
        nextAction: task.nextAction,
        jiraAssignee: jiraAssigneeForTask(task),
        ownershipDecision: task.ownershipDecision ?? null,
      },
      myName
    )
  );

  // Single source of truth for ordering. rankWorkTasks already applies the
  // claim-aware adjustment (new assignment vs Done vs transcript) exactly once
  // inside rankWorkTask, then sorts and normalizes. Re-applying it here would
  // double-count NEW_ASSIGNMENT_BOOST / FRESH_OPEN_UPDATE_BOOST / the Done
  // penalty on the primary task only (forensic audit WLA-07). Pass myName
  // through attendance so the adjustment sees the user even when the caller
  // only supplied `myName`.
  const rankingAttendance: AttendanceContext | undefined = input.attendance
    ? { ...input.attendance, myName: input.attendance.myName ?? myName }
    : myName
      ? { myName }
      : undefined;
  const nowMs = input.nowMs ?? Date.now();
  const ranked = rankWorkTasks(
    ownedForPriority,
    input.today,
    sourceById as Map<number, SourceItem>,
    input.jiraPending,
    rankingAttendance,
    nowMs
  );

  const taskById = new Map(ownedForPriority.map((task) => [task.id, task]));
  // WLA-01: primary is the first ranked task that clears the promotion floor,
  // not merely the highest-ranked survivor. Rank order ≠ sufficiency.
  const primaryRanked = ranked.find((entry) => entry.clearsPromotionFloor) ?? null;
  const primaryTask = primaryRanked ? taskById.get(primaryRanked.taskId) : null;
  const topForAfter = ranked
    .filter((entry) => entry.taskId !== primaryRanked?.taskId)
    .slice(0, 2);

  // UATL-376 with missing CON-220 → unclear/clarify-first
  let todayFirst: DailyWorkItem;
  const coverageFromPrimary: { code: string; message: string }[] = [];

  if (!primaryTask) {
    const hadOwnedCandidates = ownedForPriority.length > 0;
    todayFirst = hadOwnedCandidates
      ? {
          title: "Nothing clearly demands attention first",
          reason:
            "Open work exists, but none clears the evidence and urgency bar for today's primary focus.",
          nextAction: "Review the open queue, or sync sources for a fresher signal.",
          doneCriteria: [
            "A task with fresh evidence, an open assignment, a due date, or your explicit pin is available.",
          ],
          evidenceIds: [],
          sourceLinks: [],
          canonicalKey: null,
          jiraKey: null,
          taskId: null,
          kind: "unknown",
          statusHint: "unclear",
        }
      : {
          title: "No open owned work",
          reason: "No active tasks remained after Done reconciliation and ownership filters.",
          nextAction: "Sync sources or add a manual task with evidence.",
          doneCriteria: ["At least one owned task with evidence is available."],
          evidenceIds: [],
          sourceLinks: [],
          canonicalKey: null,
          jiraKey: null,
          taskId: null,
          kind: "unknown",
          statusHint: "unclear",
        };
  } else {
    const jiraKey = composerJiraKey(primaryTask);
    const jiraSource = jiraKey
      ? input.sources.find(
          (source) =>
            source.sourceType === "jira" &&
            source.sourceExternalId?.toUpperCase() === jiraKey.toUpperCase()
        )
      : undefined;
    let kind: DailyWorkItem["kind"] = "fact";
    let statusHint: DailyWorkItem["statusHint"] = "now";

    if (jiraSource) {
      const linked = resolveLinkedJiraEvidence({
        refs: parseLinkedJiraRefs({
          text: jiraSource.body,
          parentIssueKey: jiraKey,
        }),
        sources: input.sources,
      });
      const missing = linked.filter((item) => item.status === "missing");
      if (missing.length > 0) {
        kind = "unknown";
        statusHint = "unclear";
        for (const item of missing) {
          coverageFromPrimary.push({
            code: "missing_linked_jira",
            message: `${item.missingEvidence} not loaded — do not invent scope`,
          });
        }
      }
    }

    // Generic unclear scope (e.g. UATL-233)
    if (
      /unclear|generic|not specified|scope not/i.test(
        `${primaryTask.reason} ${primaryTask.nextAction}`
      )
    ) {
      kind = "unknown";
      statusHint = "unclear";
    }

    todayFirst = toWorkItem(primaryTask, input.sources, kind, statusHint);
  }

  const afterThat = topForAfter
    .map((entry) => {
      const task = taskById.get(entry.taskId);
      if (!task) return null;
      const unclear = /unclear|generic|not specified|scope not|waiting/i.test(
        `${task.reason} ${task.nextAction} ${task.status}`
      );
      return toWorkItem(
        task,
        input.sources,
        unclear ? "unknown" : "fact",
        unclear ? "unclear" : entry.forceInclude ? "next" : "later"
      );
    })
    .filter((item): item is DailyWorkItem => item != null)
    .slice(0, 2);

  // Prefer putting unclear scope items into blockedWaiting — only for the
  // user's work (owned or ownership-unclear). Never surface someone else's
  // blockers on this brief.
  const blockedWaiting = activeTasks
    .filter((task) => {
      // Work the user actively queued (e.g. "This is mine" → next) is no
      // longer "needs your input" — it belongs in the ranked queue.
      if ((task.status === "now" || task.status === "next") && !task.waitingOn) {
        return false;
      }
      const ownership = classifyTaskOwnership(
        {
          owner: task.owner,
          title: task.title,
          reason: task.reason,
          nextAction: task.nextAction,
          jiraAssignee: jiraAssigneeForTask(task),
          evidenceQuotes: task.evidence.map((item) => item.quote),
        },
        myName
      );
      if (ownership === "other") return false;

      const inScope =
        task.status === "waiting" ||
        Boolean(task.waitingOn) ||
        ownership === "unclear" ||
        /unclear|generic|not specified|scope not/i.test(
          `${task.reason} ${task.nextAction} ${task.title}`
        );
      if (!inScope) return false;

      // Never surface stale items (older than the freshness window) or work
      // that never names the user. Only explicitly-owned or user-mentioned
      // items that are recent enough belong in "needs your input".
      return needsInputItemIsRelevant({
        ownership,
        text: [
          task.title,
          task.reason,
          task.nextAction,
          ...task.evidence.map((item) => `${item.quote ?? ""} ${item.summary}`),
        ].join("\n"),
        latestSignalDate: latestSignalDate(
          task.evidence.map((item) => sourceById.get(item.sourceItemId)?.sourceDate ?? null)
        ),
        myName,
        today: input.today,
      });
    })
    .filter((task) => task.id !== todayFirst.taskId)
    .slice(0, 5)
    .map((task) => ({
      title: task.title,
      jiraKey: composerJiraKey(task),
      // The task's own description — shown on the card, clamped to two lines.
      description: task.reason?.trim() || null,
      reason: task.waitingOn
        ? `Waiting on ${task.waitingOn}`
        : classifyTaskOwnership(
              {
                owner: task.owner,
                title: task.title,
                reason: task.reason,
                nextAction: task.nextAction,
                jiraAssignee: jiraAssigneeForTask(task),
                evidenceQuotes: task.evidence.map((item) => item.quote),
              },
              myName
            ) === "unclear"
          ? "Ownership unclear — confirm this is yours before acting"
          : "Scope/owner decision unclear",
      evidenceIds: task.evidence.map((item) => item.sourceItemId),
      // So the UI can link straight to the task and its "Not mine"/status
      // actions — a blocked/unclear item the user cannot act on is just noise.
      taskId: task.id,
    }));

  const dayChangeJira = input.jiraPending.find((issue) =>
    isNewJiraAssignment({
      jiraUpdatedAt: issue.updatedAt,
      today: input.today,
      assignee: issue.assignee,
      myName: input.myName ?? input.attendance?.myName ?? null,
      issueCreatedAt: issue.createdAt,
      assignmentChangedAt: issue.assignmentChangedAt,
      previousAssignee: issue.previousAssignee,
      nowMs,
    })
  );
  const dayChange =
    dayChangeJira != null
      ? {
          text: `${dayChangeJira.key} newly assigned to ${dayChangeJira.assignee}`,
          evidenceIds: input.sources
            .filter(
              (source) =>
                source.sourceType === "jira" &&
                source.sourceExternalId?.toUpperCase() === dayChangeJira.key.toUpperCase()
            )
            .map((source) => source.id),
          kind: "fact" as const,
        }
      : input.previousBrief?.todayFirstJiraKey &&
          todayFirst.jiraKey &&
          input.previousBrief.todayFirstJiraKey !== todayFirst.jiraKey
        ? {
            text: `Focus changed from ${input.previousBrief.todayFirstJiraKey} to ${todayFirst.jiraKey}`,
            evidenceIds: todayFirst.evidenceIds,
            kind: "fact" as const,
          }
        : null;

  // WL-06: structural conflict detection lives in conflictDetection.ts so it
  // is independently testable and task-keyed (evidence is only attached from
  // tasks that actually cite/name the conflicting ticket — never every
  // transcript-derived task in the queue).
  const sourceConflicts: DailyBriefV2["sourceConflicts"] = detectJiraDoneVsOpenTaskConflicts({
    tasks: input.tasks,
    sources: input.sources,
  });

  const coverageWarnings = [
    ...coverageFromPrimary,
    ...buildCoverageWarnings({
      sources: input.sources,
      primaryJiraBodies: input.sources
        .filter((source) => source.sourceType === "jira")
        .map((source) => ({
          key: source.sourceExternalId ?? source.title,
          body: source.body,
        })),
    }),
  ];

  const figmaSources = input.sources.filter((source) => source.sourceType === "figma");
  const reviewReadiness =
    figmaSources.length > 0
      ? {
          verified: false,
          checklist: [
            "Linked Figma node identified",
            "Review comments loaded",
            "Visual findings recorded",
          ],
          warning: "not verified",
          evidenceIds: figmaSources.map((source) => source.id),
        }
      : null;

  const openGaps = [
    ...blockedWaiting.map((item) => ({
      jiraKey: item.jiraKey,
      question: item.jiraKey
        ? `What decision is still open on ${item.jiraKey}?`
        : `What is blocking: ${item.title}?`,
      evidenceIds: item.evidenceIds,
    })),
    ...(todayFirst.statusHint === "unclear" && todayFirst.jiraKey
      ? [
          {
            jiraKey: todayFirst.jiraKey,
            question: `What is the exact scope for ${todayFirst.jiraKey}?`,
            evidenceIds: todayFirst.evidenceIds,
          },
        ]
      : []),
  ];

  const meetingPrep = buildMeetingPrep({
    meetings: input.meetings,
    openGaps,
  });

  const brief: DailyBriefV2 = {
    schemaVersion: DAILY_BRIEF_SCHEMA_VERSION,
    dayChange,
    todayFirst,
    afterThat,
    sourceConflicts,
    todayMeetings: input.meetings.map((meeting) => ({
      title: meeting.title,
      startAt: meeting.startAt ?? null,
      questions:
        meetingPrep.find((prep) => prep.meetingTitle === meeting.title)?.questions ?? [],
    })),
    meetingPrep,
    blockedWaiting,
    reviewReadiness,
    knowledgeHighlights: [],
    keySources: input.sources
      .filter((source) =>
        ["jira", "granola", "figma", "confluence"].includes(source.sourceType)
      )
      .slice(0, 8)
      .map((source) => ({
        label: source.title,
        url: source.url,
        sourceType: source.sourceType,
      })),
    coverageWarnings,
    generatedAt: new Date().toISOString(),
    inputHash: inputHash({
      today: input.today,
      taskIds: activeTasks.map((task) => task.id),
      ranked: ranked.map((entry) => entry.taskId),
      sourceIds: input.sources.map((source) => source.id),
    }),
    today: input.today,
  };

  return dailyBriefV2Schema.parse(brief);
}

export function validateDailyBriefCitations(
  brief: DailyBriefV2,
  knownEvidenceIds: Set<number>
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const check = (ids: number[], label: string) => {
    for (const id of ids) {
      if (!knownEvidenceIds.has(id)) {
        errors.push(`${label} cites unknown evidence ${id}`);
      }
    }
  };
  if (brief.dayChange) check(brief.dayChange.evidenceIds, "dayChange");
  check(brief.todayFirst.evidenceIds, "todayFirst");
  for (const item of brief.afterThat) check(item.evidenceIds, item.title);
  for (const warning of brief.coverageWarnings) {
    if (/invent/i.test(warning.message) && !/do not invent/i.test(warning.message)) {
      errors.push(`coverage warning looks fabricated: ${warning.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
