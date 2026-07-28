/**
 * WL-05 — decomposed, deterministic task confidence.
 *
 * Confidence must be explainable ("low because the owner is a named foreign
 * actor and only one stale source supports it"), not a single model-invented
 * scalar. Every component below is computed from signals Worklight already
 * derives in `sourceAuthority.ts` / `ownerFilter.ts` / `projectMatcher.ts` —
 * the LLM contributes only `extractionConfidence` (the genuine semantic
 * judgment "is this really an assignment/task"). Aggregation is a fixed
 * weighted sum, so identical inputs always produce an identical score and
 * component breakdown (gate: determinism).
 *
 * Explicitly replaces the old `resolvePlannerConfidence` default of `1.0`:
 * an unscored task is neutral (0.5), never fully trusted by default.
 *
 * NOTE on measurement (audit §18 WL-05 acceptance (b)): this module makes
 * confidence deterministic and explainable, which is verified by the golden
 * vectors in `confidenceModel.test.mts`. Whether the decomposed score is
 * *more accurate* than the old scalar (e.g. lower Brier score against a
 * labeled ownership corpus) is NOT verified here — that requires a labeled
 * corpus that does not yet exist. Ship this as measured-determinism /
 * unmeasured-accuracy, per the audit's own confidence rating for WL-05.
 */

import type { SourceAuthorityTier } from "./sourceAuthority";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// --- Component: assignment (deterministic) ---------------------------------

export interface AssignmentSignals {
  /** Jira `assignee` field literally resolves to the user. */
  explicitJiraAssigneeMatch: boolean;
  /** `owner` field present and resolves to the user (named ownership). */
  explicitOwnerNamedAsMe: boolean;
  /** No named owner, but the source uses first-person commitment language ("I'll do X"). */
  firstPersonCommitment: boolean;
}

/** How clearly this task belongs to the user, from deterministic ownership signals only. */
export function computeAssignmentConfidence(signals: AssignmentSignals): number {
  if (signals.explicitJiraAssigneeMatch) return 1;
  if (signals.explicitOwnerNamedAsMe) return 0.9;
  if (signals.firstPersonCommitment) return 0.75;
  // No owner, no first-person signal: ambiguous, not "probably mine".
  return 0.5;
}

// --- Component: identity (deterministic; improves once WL-10 lands) --------

export interface IdentitySignals {
  /** The name Worklight extracted as owner, if any. `null` when the task is self-scoped (no third party involved). */
  ownerName: string | null;
  /** A durable person-entity id once WL-10 exists. Always `null` until then. */
  resolvedPersonId?: number | null;
  /**
   * True only when `resolvedPersonId` came from an existing alias record — i.e.
   * the name was recognised, not invented.  A person that was just created by
   * `resolveOrCreatePerson` is a persisted guess, so it earns 0.6 (same as an
   * unresolved name), not the maximum 1.0.
   */
  resolvedPersonVerified?: boolean;
}

/** Is the named owner a verified identity (WL-10) or just a string match ("guessed")? */
export function computeIdentityConfidence(signals: IdentitySignals): number {
  if (!signals.ownerName?.trim()) return 1; // nothing to resolve — task is self-scoped
  if (signals.resolvedPersonId != null && signals.resolvedPersonVerified) return 1; // durable identity match (WL-10)
  return 0.6; // named but unresolved or newly minted — a guess, not a verified match
}

// --- Component: project match (deterministic + LLM matcher score) --------

export interface ProjectMatchSignals {
  /** The task's project came from an exact Jira-key → project mapping. */
  jiraKeyExactHit: boolean;
  /** Score from the LLM project matcher, when a project was assigned by semantic match. */
  llmMatchScore?: number | null;
  /** Whether any project is currently assigned at all. */
  hasProject: boolean;
}

export function computeProjectMatchConfidence(signals: ProjectMatchSignals): number {
  if (signals.jiraKeyExactHit) return 1;
  if (!signals.hasProject) return 1; // no project claimed — nothing to be wrong about
  if (typeof signals.llmMatchScore === "number") return clamp01(signals.llmMatchScore);
  return 0.5; // project assigned with no matcher score on record — neutral, not assumed correct
}

// --- Component: source authority (deterministic) ---------------------------

const AUTHORITY_TIER_ORDER: Record<SourceAuthorityTier, number> = {
  other: 0,
  confluence: 1,
  prd: 2,
  jira: 3,
  transcript: 4,
};
const MAX_AUTHORITY_TIER_ORDER = 4;

export interface SourceAuthoritySignals {
  tier: SourceAuthorityTier;
  hasStakeholderInstruction: boolean;
}

/** Monotonic 0.2..1.0 mapping of authority tier, with a small stakeholder bump. */
export function computeSourceAuthorityConfidence(signals: SourceAuthoritySignals): number {
  const base = (AUTHORITY_TIER_ORDER[signals.tier] + 1) / (MAX_AUTHORITY_TIER_ORDER + 1);
  return clamp01(signals.hasStakeholderInstruction ? base + 0.1 : base);
}

// --- Component: freshness (deterministic) -----------------------------------

/** Confidence decays linearly across the freshness window, floored at 0.2 (a stale task is still a real signal, not a false one). */
export function computeFreshnessConfidence(ageMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0.2;
  if (ageMs <= 0) return 1;
  if (ageMs >= windowMs) return 0.2;
  return clamp01(1 - (ageMs / windowMs) * 0.8);
}

// --- Component: corroboration (deterministic) -------------------------------

/** Diminishing returns: a second independent fresh source matters a lot; a fourth barely moves it. */
export function computeCorroborationConfidence(independentFreshSourceCount: number): number {
  if (independentFreshSourceCount <= 0) return 0.3;
  if (independentFreshSourceCount === 1) return 0.5;
  if (independentFreshSourceCount === 2) return 0.75;
  if (independentFreshSourceCount === 3) return 0.9;
  return 1;
}

// --- Component: conflict penalty (deterministic; fed by WL-06) -------------

/** 0 = no known conflict, 1 = a severe, unresolved contradiction (e.g. Jira Done vs a newer meeting still treating it as open). */
export function computeConflictPenalty(hasUnresolvedConflict: boolean, severity: number = 1): number {
  return hasUnresolvedConflict ? clamp01(severity) : 0;
}

// --- Aggregation -------------------------------------------------------------

export interface ConfidenceComponents {
  assignmentConfidence: number;
  identityConfidence: number;
  projectMatchConfidence: number;
  /** The only LLM-sourced component — the semantic "is this really an assignment/task" judgment. */
  extractionConfidence: number;
  sourceAuthorityConfidence: number;
  freshnessConfidence: number;
  corroborationConfidence: number;
  /** Not weighted in the sum — applied as a multiplicative penalty afterward. */
  conflictPenalty: number;
}

/** Weights sum to 1.0 over every component except `conflictPenalty`. */
export const CONFIDENCE_WEIGHTS: Record<
  Exclude<keyof ConfidenceComponents, "conflictPenalty">,
  number
> = {
  assignmentConfidence: 0.2,
  identityConfidence: 0.1,
  projectMatchConfidence: 0.1,
  extractionConfidence: 0.2,
  sourceAuthorityConfidence: 0.15,
  freshnessConfidence: 0.15,
  corroborationConfidence: 0.1,
};

export interface ConfidenceResult {
  finalConfidence: number;
  components: ConfidenceComponents;
}

/**
 * Deterministic aggregate: fixed weighted sum of every component, then a
 * multiplicative haircut for an unresolved conflict. Same input vector always
 * produces the same output (golden-vector tested).
 */
export function aggregateConfidence(components: ConfidenceComponents): ConfidenceResult {
  const clamped: ConfidenceComponents = {
    assignmentConfidence: clamp01(components.assignmentConfidence),
    identityConfidence: clamp01(components.identityConfidence),
    projectMatchConfidence: clamp01(components.projectMatchConfidence),
    extractionConfidence: clamp01(components.extractionConfidence),
    sourceAuthorityConfidence: clamp01(components.sourceAuthorityConfidence),
    freshnessConfidence: clamp01(components.freshnessConfidence),
    corroborationConfidence: clamp01(components.corroborationConfidence),
    conflictPenalty: clamp01(components.conflictPenalty),
  };

  let weightedSum = 0;
  for (const key of Object.keys(CONFIDENCE_WEIGHTS) as (keyof typeof CONFIDENCE_WEIGHTS)[]) {
    weightedSum += CONFIDENCE_WEIGHTS[key] * clamped[key];
  }

  // A severe conflict can cut confidence by up to 60% — enough to visibly
  // demote a contested task without ever forcing it to exactly zero (the
  // conflict itself, not this score, is what the UI must surface).
  const finalConfidence = clamp01(weightedSum * (1 - clamped.conflictPenalty * 0.6));

  return { finalConfidence, components: clamped };
}
