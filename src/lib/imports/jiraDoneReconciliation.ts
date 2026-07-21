import {
  isJiraDoneMetadata,
  isJiraDoneStatus,
  issueKeyFromCanonicalKey,
  resolveCanonicalKeyForTask,
} from "@/lib/tasks/canonicalKey";
import { jiraKeyForTask } from "@/lib/tasks/transcriptTaskMerge";

export type ReconcileTask = {
  id: number;
  title: string;
  status: string;
  statusManuallySet: boolean;
  canonicalKey?: string | null;
  evidence: { sourceItemId: number }[];
};

export type ReconcileSource = {
  id: number;
  sourceType: string;
  sourceExternalId: string | null;
  title: string;
  metadata: Record<string, unknown> | null;
};

export type DoneReconciliationAction = {
  taskId: number;
  jiraKey: string;
  canonicalKey: string;
  reason: string;
};

/**
 * Close open canonical Jira tasks when the latest Jira source is Done.
 * Jira Done is authoritative for mechanical status and closes the matching
 * canonical work item even if the user manually pinned its queue position —
 * that manual pin was about ordering, not about disputing Jira's status.
 * Does not close meeting-only follow-ups without a matching Jira canonical
 * key / evidence link.
 */
export function planJiraDoneReconciliation(input: {
  tasks: ReconcileTask[];
  sources: ReconcileSource[];
}): DoneReconciliationAction[] {
  const doneByKey = new Map<string, ReconcileSource>();
  const doneBySourceId = new Map<number, ReconcileSource>();
  for (const source of input.sources) {
    if (source.sourceType !== "jira") continue;
    if (!isJiraDoneMetadata(source.metadata)) continue;
    const key = (source.sourceExternalId ?? jiraKeyFromTitle(source.title))?.toUpperCase();
    if (!key) continue;
    doneByKey.set(key, source);
    doneBySourceId.set(source.id, source);
  }

  const actions: DoneReconciliationAction[] = [];
  for (const task of input.tasks) {
    if (task.status === "done") continue;

    const evidenceDone = task.evidence
      .map((item) => doneBySourceId.get(item.sourceItemId))
      .find((source): source is ReconcileSource => source != null);

    const canonicalKey =
      task.canonicalKey ??
      resolveCanonicalKeyForTask({
        title: task.title,
        evidenceText: evidenceDone?.sourceExternalId ?? "",
      });
    const jiraKey =
      issueKeyFromCanonicalKey(canonicalKey) ??
      jiraKeyForTask({ title: task.title }) ??
      evidenceDone?.sourceExternalId?.toUpperCase() ??
      null;
    if (!jiraKey) continue;

    const doneSource = evidenceDone ?? doneByKey.get(jiraKey.toUpperCase());
    if (!doneSource) continue;

    const citesDone = task.evidence.some((item) => item.sourceItemId === doneSource.id);
    const titleOwnsKey = jiraKeyForTask({ title: task.title })?.toUpperCase() === jiraKey.toUpperCase();
    if (!citesDone && !titleOwnsKey) continue;

    const resolvedCanonical =
      canonicalKey ??
      resolveCanonicalKeyForTask({ title: `UATL placeholder`, evidenceText: jiraKey }) ??
      `jira:default:${jiraKey.toUpperCase()}`;

    actions.push({
      taskId: task.id,
      jiraKey: jiraKey.toUpperCase(),
      canonicalKey: resolvedCanonical.includes(jiraKey.toUpperCase())
        ? resolvedCanonical
        : `jira:default:${jiraKey.toUpperCase()}`,
      reason: `Jira ${jiraKey.toUpperCase()} is ${String(doneSource.metadata?.status ?? "Done")} — closing canonical work item.`,
    });
  }

  return actions;
}

function jiraKeyFromTitle(title: string): string | null {
  return title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
}

export type DuplicateMergePlan = {
  canonicalTaskId: number;
  duplicateTaskIds: number[];
  jiraKey: string;
  canonicalKey: string;
};

/**
 * Keep one open task per Jira key. Prefer title that starts with the key,
 * then lower id (older). Manual status wins as canonical when present.
 */
export function planDuplicateJiraTaskMerge(input: {
  tasks: ReconcileTask[];
  site?: string | null;
}): DuplicateMergePlan[] {
  const open = input.tasks.filter((task) => task.status !== "done");
  const byKey = new Map<string, ReconcileTask[]>();

  for (const task of open) {
    const canonicalKey =
      task.canonicalKey ??
      resolveCanonicalKeyForTask({ title: task.title, site: input.site });
    const jiraKey = issueKeyFromCanonicalKey(canonicalKey);
    if (!jiraKey || !canonicalKey) continue;
    const list = byKey.get(jiraKey) ?? [];
    list.push({ ...task, canonicalKey });
    byKey.set(jiraKey, list);
  }

  const plans: DuplicateMergePlan[] = [];
  for (const [jiraKey, group] of byKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      if (a.statusManuallySet !== b.statusManuallySet) {
        return a.statusManuallySet ? -1 : 1;
      }
      const aPrefix = a.title.toUpperCase().startsWith(jiraKey) ? 0 : 1;
      const bPrefix = b.title.toUpperCase().startsWith(jiraKey) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.id - b.id;
    });
    const [canonical, ...duplicates] = sorted;
    plans.push({
      canonicalTaskId: canonical.id,
      duplicateTaskIds: duplicates.map((task) => task.id),
      jiraKey,
      canonicalKey:
        canonical.canonicalKey ??
        resolveCanonicalKeyForTask({ title: canonical.title, site: input.site })!,
    });
  }
  return plans;
}

export { isJiraDoneStatus };
