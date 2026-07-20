import "server-only";
import { runLlmJob } from "@/lib/llm/router";
import {
  buildFocusActionPlanUserPrompt,
  focusActionPlanOutputSchema,
  type FocusActionPlanItemInput,
} from "@/lib/llm/prompts/focusActionPlan";
import type { SourceItem } from "@/domain/sourceItem";
import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";
import type { BriefingFocusItemDraft } from "@/lib/tasks/priorityRank";
import type { WorkTaskForRanking } from "@/lib/tasks/priorityRank";
import { buildFocusEvidenceBundle } from "@/lib/tasks/focusEvidenceBundle";
import type { StoredTodayBriefingJiraItem } from "@/lib/llm/prompts/todayBriefing";
import { priorityExplanationForDisplay } from "@/lib/tasks/priorityExplanation";
import { updateWorkTask } from "@/services/workTasks";

export interface EnrichFocusActionsInput {
  today: string;
  focusItems: BriefingFocusItemDraft[];
  jiraPending: JiraPendingSnapshot[];
  tasksById: Map<number, WorkTaskForRanking>;
  sourceItems: SourceItem[];
}

function mergePlanIntoFocusItem(
  item: BriefingFocusItemDraft,
  plan: {
    reason: string;
    priorityExplanation: string;
    nextAction: string;
    actionSteps: string[];
    todayWorkSummary?: string[];
    doneCriteria: string[];
    evidenceQuotes: { quote: string }[];
    referenceLinks: { label: string; url: string }[];
  }
): BriefingFocusItemDraft {
  return {
    ...item,
    reason: plan.reason,
    priorityExplanation: priorityExplanationForDisplay(plan.priorityExplanation),
    nextAction: plan.nextAction,
    actionSteps: plan.actionSteps,
    todayWorkSummary: plan.todayWorkSummary,
    referenceLinks: plan.referenceLinks,
    doneCriteria: plan.doneCriteria,
    evidenceQuotes: plan.evidenceQuotes,
  };
}

export async function enrichFocusItemsWithActionPlans(
  input: EnrichFocusActionsInput
): Promise<BriefingFocusItemDraft[]> {
  if (input.focusItems.length === 0) return input.focusItems;

  const jiraByKey = new Map(input.jiraPending.map((issue) => [issue.key, issue]));

  const planInputs: FocusActionPlanItemInput[] = input.focusItems.map((item, index) => {
    const task = item.linkedTaskId != null ? input.tasksById.get(item.linkedTaskId) : undefined;
    const jiraIssue = item.linkedJiraKey ? jiraByKey.get(item.linkedJiraKey) : undefined;
    const sources = buildFocusEvidenceBundle({
      focusItem: item,
      task,
      jiraIssue,
      sourceItems: input.sourceItems,
    });

    return {
      id: `focus-${index}`,
      title: item.title,
      jiraKey: item.linkedJiraKey,
      jiraStatus: jiraIssue?.status ?? null,
      currentNextAction: item.nextAction,
      currentReason: item.reason,
      currentPriorityExplanation: item.priorityExplanation,
      sources,
    };
  });

  const result = await runLlmJob({
    jobType: "focus_action_plan",
    userPrompt: buildFocusActionPlanUserPrompt({
      today: input.today,
      items: planInputs,
    }),
    schema: focusActionPlanOutputSchema,
  });

  if (!result.ok) return input.focusItems;

  const planById = new Map(result.data.items.map((entry) => [entry.id, entry]));

  const enrichedItems = input.focusItems.map((item, index) => {
    const plan = planById.get(`focus-${index}`);
    if (!plan) return item;
    return mergePlanIntoFocusItem(item, plan);
  });

  // Persist the source-grounded pillars so task detail, Tomorrow, and project
  // cards show the same concrete plan as the Today briefing.
  await Promise.all(
    enrichedItems.map((item, index) => {
      const plan = planById.get(`focus-${index}`);
      if (!plan || item.linkedTaskId == null) return Promise.resolve(null);
      return updateWorkTask(item.linkedTaskId, {
        reason: plan.reason,
        nextAction: plan.nextAction,
        doneCriteria: plan.doneCriteria,
      });
    })
  );

  return enrichedItems;
}

export async function enrichJiraPendingWithActionPlans(input: {
  today: string;
  items: StoredTodayBriefingJiraItem[];
  jiraPending: JiraPendingSnapshot[];
  sourceItems: SourceItem[];
}): Promise<StoredTodayBriefingJiraItem[]> {
  if (input.items.length === 0) return input.items;

  const jiraByKey = new Map(input.jiraPending.map((issue) => [issue.key, issue]));

  const planInputs: FocusActionPlanItemInput[] = input.items.map((item, index) => {
    const jiraIssue = jiraByKey.get(item.key);
    const draft: BriefingFocusItemDraft = {
      title: `${item.key}: ${item.title}`,
      reason: item.reason,
      nextAction: item.nextAction,
      doneCriteria: item.doneCriteria,
      evidenceQuotes: item.evidenceQuotes,
      linkedTaskId: null,
      linkedJiraKey: item.key,
      priorityExplanation: item.priorityExplanation ?? "",
    };
    const sources = buildFocusEvidenceBundle({
      focusItem: draft,
      jiraIssue,
      sourceItems: input.sourceItems,
    });

    return {
      id: `jira-${index}`,
      title: draft.title,
      jiraKey: item.key,
      jiraStatus: item.status,
      currentNextAction: item.nextAction,
      currentReason: item.reason,
      currentPriorityExplanation: item.priorityExplanation ?? "",
      sources,
    };
  });

  const result = await runLlmJob({
    jobType: "focus_action_plan",
    userPrompt: buildFocusActionPlanUserPrompt({
      today: input.today,
      items: planInputs,
    }),
    schema: focusActionPlanOutputSchema,
  });

  if (!result.ok) return input.items;

  const planById = new Map(result.data.items.map((entry) => [entry.id, entry]));

  return input.items.map((item, index) => {
    const plan = planById.get(`jira-${index}`);
    if (!plan) return item;
    return {
      ...item,
      reason: plan.reason,
      priorityExplanation: priorityExplanationForDisplay(plan.priorityExplanation),
      nextAction: plan.nextAction,
      doneCriteria: plan.doneCriteria,
      evidenceQuotes: plan.evidenceQuotes,
      actionSteps: plan.actionSteps,
      referenceLinks: plan.referenceLinks,
    };
  });
}
