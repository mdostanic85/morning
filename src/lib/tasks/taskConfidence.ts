/**
 * WL-05 wiring layer: maps Worklight's actual signals (source authority,
 * ownership classification, project-match metadata, evidence freshness) onto
 * the pure `confidenceModel.ts` component functions. Deliberately
 * dependency-free of the database so it stays unit-testable — the DB-facing
 * callers (`extractor.ts`) only gather inputs and read the result.
 */
import {
  aggregateConfidence,
  computeAssignmentConfidence,
  computeConflictPenalty,
  computeCorroborationConfidence,
  computeFreshnessConfidence,
  computeIdentityConfidence,
  computeProjectMatchConfidence,
  computeSourceAuthorityConfidence,
  type ConfidenceComponents,
  type ConfidenceResult,
} from "./confidenceModel";
import {
  hasHighAuthorityStakeholderInstruction,
  sourceAuthorityTier,
  TASK_SOURCE_FRESHNESS_WINDOW_MS,
} from "./sourceAuthority";
import {
  classifyTaskOwnership,
  myOwnerFilter,
  parseJiraAssigneeFromText,
  personMatchesFilter,
} from "@/lib/filters/ownerFilter";

interface ConfidenceSourceFields {
  sourceType: string;
  title?: string | null;
  body?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceDate: string;
}

export interface TaskConfidenceInput {
  ownerName: string | null;
  /** The LLM's own semantic judgment — the only non-deterministic input. */
  extractionConfidence: number;
  title: string;
  reason: string;
  nextAction: string;
  currentUserName: string | null;
  /** The source that most directly grounds this task/evidence group. */
  primarySource: ConfidenceSourceFields;
  /** Whether a project is currently assigned to the primary source/task. */
  hasProject: boolean;
  /** Verbatim source quotes — the only free text that may prove ownership. */
  evidenceQuotes?: string[];
  /** WL-10: a durable person-entity id for `ownerName`, once resolved. Null when unresolved or self-scoped. */
  resolvedPersonId?: number | null;
  /**
   * True when the person id came from an existing alias record (pre-existing identity match).
   * False / omitted when the id was just created by `resolveOrCreatePerson` — it is a persisted
   * guess, not a verified identity, so it should not earn the maximum identity confidence score.
   */
  resolvedPersonVerified?: boolean;
  /** All sources providing fresh-window-eligible evidence for this task (including the primary source), for freshness/corroboration. */
  evidenceSources: ConfidenceSourceFields[];
  hasUnresolvedConflict?: boolean;
  conflictSeverity?: number;
  now?: number;
}

function projectMatchScoreFromMetadata(metadata: Record<string, unknown> | null | undefined): number | null {
  const projectMatch = metadata?.projectMatch as { confidence?: unknown } | undefined;
  return typeof projectMatch?.confidence === "number" ? projectMatch.confidence : null;
}

function sourceTimeMs(source: { sourceDate: string }): number {
  const time = new Date(source.sourceDate).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Deterministic assignment signals: a Jira `Assignee:` field parsed straight
 * from the source body (never the LLM-extracted `owner` field) is the only
 * thing that counts as "explicit Jira assignee match" — everything else
 * falls back to owner-name matching or first-person commitment language.
 */
function computeAssignmentSignals(input: {
  ownerName: string | null;
  title: string;
  reason: string;
  nextAction: string;
  currentUserName: string | null;
  primarySource: ConfidenceSourceFields;
  evidenceQuotes?: string[];
}) {
  const selected = input.currentUserName ? myOwnerFilter(input.currentUserName) : null;
  const jiraAssignee =
    input.primarySource.sourceType === "jira" && input.primarySource.body
      ? parseJiraAssigneeFromText(input.primarySource.body)
      : null;
  const explicitJiraAssigneeMatch =
    jiraAssignee != null &&
    selected != null &&
    personMatchesFilter(jiraAssignee, selected, input.currentUserName);
  const explicitOwnerNamedAsMe =
    !explicitJiraAssigneeMatch &&
    input.ownerName != null &&
    selected != null &&
    personMatchesFilter(input.ownerName, selected, input.currentUserName);
  // Source-backed only: a commitment the user actually made, addressed to him,
  // or handed down by a stakeholder. LLM prose naming the user proves nothing.
  const firstPersonCommitment =
    !input.ownerName &&
    input.currentUserName != null &&
    classifyTaskOwnership(
      {
        owner: null,
        title: input.title,
        reason: input.reason,
        nextAction: input.nextAction,
        evidenceQuotes: input.evidenceQuotes,
      },
      input.currentUserName
    ) === "mine";

  return { explicitJiraAssigneeMatch, explicitOwnerNamedAsMe, firstPersonCommitment };
}

/** Full WL-05 decomposition for one task, from Worklight's real signals. */
export function computeTaskConfidence(input: TaskConfidenceInput): ConfidenceResult {
  const now = input.now ?? Date.now();

  const assignmentSignals = computeAssignmentSignals(input);
  const assignmentConfidence = computeAssignmentConfidence(assignmentSignals);

  const identityConfidence = computeIdentityConfidence({
    ownerName: input.ownerName,
    resolvedPersonId: input.resolvedPersonId ?? null,
    resolvedPersonVerified: input.resolvedPersonVerified ?? false,
  });

  const projectMatchConfidence = computeProjectMatchConfidence({
    jiraKeyExactHit: false, // no deterministic Jira-key->project short circuit exists yet
    llmMatchScore: projectMatchScoreFromMetadata(input.primarySource.metadata),
    hasProject: input.hasProject,
  });

  const sourceAuthorityConfidence = computeSourceAuthorityConfidence({
    tier: sourceAuthorityTier(input.primarySource),
    hasStakeholderInstruction: hasHighAuthorityStakeholderInstruction(input.primarySource),
  });

  const times = input.evidenceSources.map(sourceTimeMs).filter((time) => time > 0);
  const newestTime = times.length > 0 ? Math.max(...times) : 0;
  const ageMs = newestTime > 0 ? Math.max(0, now - newestTime) : 0;
  const freshnessConfidence = computeFreshnessConfidence(ageMs, TASK_SOURCE_FRESHNESS_WINDOW_MS);

  const freshSourceCount =
    newestTime > 0
      ? times.filter((time) => newestTime - time <= TASK_SOURCE_FRESHNESS_WINDOW_MS).length
      : input.evidenceSources.length;
  const corroborationConfidence = computeCorroborationConfidence(freshSourceCount);

  const conflictPenalty = computeConflictPenalty(
    input.hasUnresolvedConflict ?? false,
    input.conflictSeverity ?? 1
  );

  const components: ConfidenceComponents = {
    assignmentConfidence,
    identityConfidence,
    projectMatchConfidence,
    extractionConfidence: input.extractionConfidence,
    sourceAuthorityConfidence,
    freshnessConfidence,
    corroborationConfidence,
    conflictPenalty,
  };

  return aggregateConfidence(components);
}
