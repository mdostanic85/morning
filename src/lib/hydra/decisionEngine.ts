import type { HydraReport, HydraActionItem, SourceStatus } from "@/domain/hydraReport";
import type { HydraEvidence } from "@/services/hydra";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import { isTranscriptSource } from "@/lib/tasks/sourceAuthority";
import {
  effectiveStakeholderPeople,
  matchesStakeholder,
  stakeholderLabel,
} from "@/lib/tasks/highAuthorityPeople";

const DAY_MS = 86_400_000;
const BLOCKER_PATTERN = /\b(blocked|blocker|waiting on|cannot proceed|can't proceed|needs? decision|čeka|blokiran)\b/i;
const DIRECT_PATTERN = /\b(miloš|milos|you need to|please|assigned to you|can you|your task|action item)\b/i;
const DONE_PATTERN = /\b(done|completed|approved|resolved|shipped|završeno|odobreno)\b/i;
const NOT_DONE_PATTERN = /\b(blocked|open|in progress|to do|not started|needs work|pending|čeka|blokiran)\b/i;
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

function metadataString(metadata: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function evidenceId(item: HydraEvidence): string {
  return `ev_${item.id}`;
}

export function jiraKeysForEvidence(item: HydraEvidence): string[] {
  const values = `${item.externalId} ${item.title} ${item.content}`.match(JIRA_KEY_PATTERN) ?? [];
  return Array.from(new Set(values.map((value) => value.toUpperCase())));
}

export function scoreHydraEvidence(input: {
  item: HydraEvidence;
  currentUserName?: string | null;
  stakeholders?: string[];
  now?: Date;
}): { score: number; reasons: string[] } {
  const { item } = input;
  const now = input.now ?? new Date();
  const configuredStakeholders = input.stakeholders ?? ["Matt Pettit", "Lucas Saeed"];
  const stakeholderPeople = effectiveStakeholderPeople(configuredStakeholders);
  const haystack = `${item.title}\n${item.content}`;
  const author = item.author ?? "";
  const reasons: string[] = [];
  let score = 0;

  if (DIRECT_PATTERN.test(haystack)) {
    score += 100;
    reasons.push("Directly relevant to Miloš");
  }
  if (input.currentUserName && haystack.toLowerCase().includes(input.currentUserName.toLowerCase())) {
    score += 30;
    reasons.push("Names the current user");
  }
  if (matchesStakeholder(author, stakeholderPeople, { authorField: true })) {
    score += 80;
    reasons.push(`Instruction from ${stakeholderLabel(stakeholderPeople)}`);
  }
  // Meeting transcripts carry equal authority regardless of provider: Granola
  // and Gemini (Gmail/Drive) notes are the same tier of "action instruction"
  // evidence. Recency (the recency component below) is what breaks conflicts
  // between them, not the provider.
  const isMeetingEvidence =
    isTranscriptSource({
      sourceType: item.sourceType,
      title: item.title,
      body: item.content,
      metadata: item.metadata,
    }) ||
    item.source === "granola" ||
    item.source === "calendar" ||
    item.sourceType.includes("meeting");
  if (isMeetingEvidence) {
    score += 55;
    reasons.push("Meeting evidence");
  } else if (item.source === "jira") {
    score += 40;
    reasons.push("Jira operational state");
  } else if (item.source === "confluence" || item.source === "drive") {
    score += 20;
    reasons.push("Product context");
  }
  if (BLOCKER_PATTERN.test(haystack)) {
    score += 25;
    reasons.push("Blocker or unresolved decision");
  }
  if (item.source === "jira" && !/done|closed|resolved/i.test(metadataString(item.metadata, "status", "statusName") ?? "")) {
    score += 15;
    reasons.push("Active Jira issue");
  }
  const occurred = new Date(item.occurredAt).getTime();
  if (Number.isFinite(occurred)) {
    const ageDays = Math.max(0, (now.getTime() - occurred) / DAY_MS);
    const recency = Math.max(0, 30 - ageDays * 3);
    score += recency;
    if (recency > 0) reasons.push("Recent evidence");
  }
  return { score: Math.round(score * 10) / 10, reasons };
}

export interface DetectedConflict {
  title: string;
  winningEvidenceId: number;
  losingEvidenceId: number;
  winningInstruction: string;
  reason: string;
}

export function detectHydraConflicts(items: HydraEvidence[]): DetectedConflict[] {
  const byJiraKey = new Map<string, HydraEvidence[]>();
  for (const item of items) {
    for (const key of jiraKeysForEvidence(item)) {
      const list = byJiraKey.get(key) ?? [];
      list.push(item);
      byJiraKey.set(key, list);
    }
  }

  const conflicts: DetectedConflict[] = [];
  for (const [key, grouped] of byJiraKey) {
    if (grouped.length < 2) continue;
    const saysDone = grouped.filter((entry) => DONE_PATTERN.test(`${entry.title} ${entry.content}`));
    const saysNotDone = grouped.filter((entry) => NOT_DONE_PATTERN.test(`${entry.title} ${entry.content}`));
    if (saysDone.length === 0 || saysNotDone.length === 0) continue;
    const ranked = [...new Set([...saysDone, ...saysNotDone])].sort(
      (a, b) => b.score - a.score || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );
    const winner = ranked[0];
    const loser = ranked.find((entry) =>
      DONE_PATTERN.test(`${winner.title} ${winner.content}`)
        ? NOT_DONE_PATTERN.test(`${entry.title} ${entry.content}`)
        : DONE_PATTERN.test(`${entry.title} ${entry.content}`)
    );
    if (!loser) continue;
    conflicts.push({
      title: `${key} has conflicting source state`,
      winningEvidenceId: winner.id,
      losingEvidenceId: loser.id,
      winningInstruction: winner.title,
      reason: "The higher-authority or newer evidence wins for planning; both claims remain visible.",
    });
  }
  return conflicts;
}

function taskEvidenceIds(task: WorkTaskWithEvidence, evidenceBySourceId: Map<number, HydraEvidence>) {
  return task.evidence
    .map((entry) => evidenceBySourceId.get(entry.sourceItemId))
    .filter((entry): entry is HydraEvidence => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .map(evidenceId);
}

function actionFromTask(
  task: WorkTaskWithEvidence,
  evidenceBySourceId: Map<number, HydraEvidence>
): HydraActionItem | null {
  const evidence = taskEvidenceIds(task, evidenceBySourceId);
  if (evidence.length === 0) return null;
  const sourceRows = evidence
    .map((id) => Number(id.replace("ev_", "")))
    .map((id) => [...evidenceBySourceId.values()].find((entry) => entry.id === id))
    .filter((entry): entry is HydraEvidence => Boolean(entry));
  const jiraKey = sourceRows.flatMap(jiraKeysForEvidence)[0] ?? null;
  return {
    title: task.title,
    reason: task.reason,
    nextStep: task.nextAction,
    doneWhen: task.doneCriteria[0] ?? "The requested outcome is ready for review.",
    evidenceIds: evidence,
    sourceUrls: Array.from(new Set(sourceRows.map((entry) => entry.url).filter((url): url is string => Boolean(url)))),
    jiraKey,
  };
}

function actionFromEvidence(item: HydraEvidence): HydraActionItem {
  const jiraKey = jiraKeysForEvidence(item)[0] ?? null;
  return {
    title: item.title,
    reason: item.scoreReasons[0] ?? "This is the strongest current evidence.",
    nextStep: BLOCKER_PATTERN.test(item.content)
      ? "Resolve the named blocker or ask the missing decision question."
      : "Review the source and complete the explicitly requested next step.",
    doneWhen: "The source request is addressed and the outcome is ready for review.",
    evidenceIds: [evidenceId(item)],
    sourceUrls: item.url ? [item.url] : [],
    jiraKey,
  };
}

export function buildDeterministicHydraReport(input: {
  evidence: HydraEvidence[];
  tasks: WorkTaskWithEvidence[];
  conflicts: DetectedConflict[];
  sourceStatus: SourceStatus[];
  configVersion: number;
  promptVersion: string;
}): HydraReport {
  const ranked = [...input.evidence].sort(
    (a, b) => b.score - a.score || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
  if (ranked.length === 0) throw new Error("No evidence is available for a Hydra report.");

  const evidenceBySourceId = new Map(
    ranked.filter((entry) => entry.sourceItemId != null).map((entry) => [entry.sourceItemId!, entry])
  );
  const actions = input.tasks
    .map((task) => actionFromTask(task, evidenceBySourceId))
    .filter((item): item is HydraActionItem => Boolean(item));
  for (const item of ranked) {
    if (actions.length >= 4) break;
    if (actions.some((action) => action.evidenceIds.includes(evidenceId(item)))) continue;
    actions.push(actionFromEvidence(item));
  }

  const directInstructions = ranked
    .filter((item) => DIRECT_PATTERN.test(`${item.title} ${item.content}`))
    .slice(0, 8)
    .map((item) => ({
      instruction: item.title,
      author: item.author ?? "Unknown author",
      occurredAt: item.occurredAt,
      evidenceIds: [evidenceId(item)],
      sourceUrl: item.url,
    }));

  const blockers = ranked
    .filter((item) => BLOCKER_PATTERN.test(`${item.title} ${item.content}`))
    .slice(0, 8)
    .map((item) => ({
      title: item.title,
      waitingOn: metadataString(item.metadata, "waitingOn", "assignee", "owner") ?? "A decision owner",
      question: `What is the decision or input needed to unblock “${item.title}”?`,
      evidenceIds: [evidenceId(item)],
    }));

  const jiraState = ranked
    .filter((item) => item.source === "jira")
    .map((item) => {
      const key = jiraKeysForEvidence(item)[0] ?? item.externalId;
      const status = metadataString(item.metadata, "status", "statusName") ?? "Open";
      const conflicting = input.conflicts.some(
        (conflict) => conflict.winningEvidenceId === item.id || conflict.losingEvidenceId === item.id
      );
      return {
        key,
        title: item.title.replace(new RegExp(`^${key}:?\\s*`, "i"), ""),
        status,
        outdated: conflicting,
        evidenceIds: [evidenceId(item)],
        url: item.url,
      };
    })
    .filter((item, index, all) => all.findIndex((candidate) => candidate.key === item.key) === index);

  const nodeEvidence = ranked.find((item) => /figma\.com\/design\/.+node-id=/i.test(`${item.url ?? ""} ${item.content}`));
  const nodeUrl = nodeEvidence
    ? (`${nodeEvidence.url ?? ""} ${nodeEvidence.content}`.match(/https?:\/\/[^\s)]+figma\.com\/design\/[^\s)]+node-id=[^\s)&]+/i)?.[0] ??
      (nodeEvidence.url?.includes("node-id=") ? nodeEvidence.url : null))
    : null;

  return {
    todayFirst: actions[0] ?? actionFromEvidence(ranked[0]),
    afterThat: actions.slice(1, 4),
    directInstructions,
    blockers,
    jiraState,
    conflicts: input.conflicts.map((conflict) => ({
      title: conflict.title,
      winningInstruction: conflict.winningInstruction,
      reason: conflict.reason,
      evidenceIds: [`ev_${conflict.winningEvidenceId}`, `ev_${conflict.losingEvidenceId}`],
    })),
    ...(blockers.length > 0
      ? { suggestedMessage: `Hi — I’m blocked on ${blockers[0].title}. ${blockers[0].question}` }
      : {}),
    ...(nodeEvidence && nodeUrl
      ? {
          figmaAudit: {
            status: "yellow" as const,
            preliminary: true,
            nodeUrl,
            summary: "A valid node-specific Figma link was found. The audit is preliminary until the node snapshot is reviewed.",
            findings: ["Node link is specific and traceable.", "Confirm component states, copy, and handoff readiness in Figma."],
            evidenceIds: [evidenceId(nodeEvidence)],
          },
        }
      : {}),
    runSummary: {
      sourceStatus: input.sourceStatus,
      evidenceCount: ranked.length,
      generatedAt: new Date().toISOString(),
      configVersion: input.configVersion,
      promptVersion: input.promptVersion,
    },
  };
}

export function reportCitationCoverage(report: HydraReport, validEvidenceIds: Set<string>): number {
  const groups = [
    report.todayFirst,
    ...report.afterThat,
    ...report.directInstructions,
    ...report.blockers,
    ...report.jiraState,
    ...report.conflicts,
    ...(report.figmaAudit ? [report.figmaAudit] : []),
  ];
  if (groups.length === 0) return 1;
  const valid = groups.filter(
    (item) => item.evidenceIds.length > 0 && item.evidenceIds.every((id) => validEvidenceIds.has(id))
  ).length;
  return valid / groups.length;
}
