import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
} from "./confidenceModel";

const WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

describe("confidenceModel component functions (WL-05)", () => {
  it("assignment: explicit Jira assignee beats named owner beats first-person beats ambiguous", () => {
    assert.equal(
      computeAssignmentConfidence({
        explicitJiraAssigneeMatch: true,
        explicitOwnerNamedAsMe: false,
        firstPersonCommitment: false,
      }),
      1
    );
    assert.equal(
      computeAssignmentConfidence({
        explicitJiraAssigneeMatch: false,
        explicitOwnerNamedAsMe: true,
        firstPersonCommitment: false,
      }),
      0.9
    );
    assert.equal(
      computeAssignmentConfidence({
        explicitJiraAssigneeMatch: false,
        explicitOwnerNamedAsMe: false,
        firstPersonCommitment: true,
      }),
      0.75
    );
    assert.equal(
      computeAssignmentConfidence({
        explicitJiraAssigneeMatch: false,
        explicitOwnerNamedAsMe: false,
        firstPersonCommitment: false,
      }),
      0.5
    );
  });

  it("identity: self-scoped tasks and verified identities are fully trusted; a named-but-unresolved owner is not; a newly-minted person (created=true) is not verified", () => {
    assert.equal(computeIdentityConfidence({ ownerName: null }), 1);
    // Verified pre-existing identity → 1.0
    assert.equal(
      computeIdentityConfidence({ ownerName: "Matt Pettit", resolvedPersonId: 42, resolvedPersonVerified: true }),
      1
    );
    // Newly created person (created=true, so verified=false) → 0.6, not 1.0
    assert.equal(
      computeIdentityConfidence({ ownerName: "Matt Pettit", resolvedPersonId: 42, resolvedPersonVerified: false }),
      0.6,
      "a newly minted person id must not score 1.0"
    );
    // No id at all → 0.6
    assert.equal(computeIdentityConfidence({ ownerName: "Matt Pettit", resolvedPersonId: null }), 0.6);
  });

  it("project match: exact Jira-key hit and no-project-claimed are both 1.0; an LLM match score is used as-is; an unscored assignment is neutral", () => {
    assert.equal(
      computeProjectMatchConfidence({ jiraKeyExactHit: true, hasProject: true }),
      1
    );
    assert.equal(
      computeProjectMatchConfidence({ jiraKeyExactHit: false, hasProject: false }),
      1
    );
    assert.equal(
      computeProjectMatchConfidence({ jiraKeyExactHit: false, hasProject: true, llmMatchScore: 0.42 }),
      0.42
    );
    assert.equal(
      computeProjectMatchConfidence({ jiraKeyExactHit: false, hasProject: true }),
      0.5
    );
  });

  it("source authority: transcript > jira > prd > confluence > other, monotonically", () => {
    const transcript = computeSourceAuthorityConfidence({ tier: "transcript", hasStakeholderInstruction: false });
    const jira = computeSourceAuthorityConfidence({ tier: "jira", hasStakeholderInstruction: false });
    const prd = computeSourceAuthorityConfidence({ tier: "prd", hasStakeholderInstruction: false });
    const confluence = computeSourceAuthorityConfidence({ tier: "confluence", hasStakeholderInstruction: false });
    const other = computeSourceAuthorityConfidence({ tier: "other", hasStakeholderInstruction: false });
    assert.ok(transcript > jira);
    assert.ok(jira > prd);
    assert.ok(prd > confluence);
    assert.ok(confluence > other);
    assert.equal(transcript, 1);
  });

  it("source authority: a stakeholder instruction bumps confidence but never above 1.0", () => {
    const withStakeholder = computeSourceAuthorityConfidence({ tier: "transcript", hasStakeholderInstruction: true });
    assert.equal(withStakeholder, 1);
    const jiraWithStakeholder = computeSourceAuthorityConfidence({ tier: "jira", hasStakeholderInstruction: true });
    const jiraWithout = computeSourceAuthorityConfidence({ tier: "jira", hasStakeholderInstruction: false });
    assert.ok(jiraWithStakeholder > jiraWithout);
  });

  it("freshness: decays linearly across the window, floored at 0.2", () => {
    assert.equal(computeFreshnessConfidence(0, WINDOW_MS), 1);
    assert.equal(computeFreshnessConfidence(WINDOW_MS, WINDOW_MS), 0.2);
    assert.equal(computeFreshnessConfidence(WINDOW_MS * 2, WINDOW_MS), 0.2);
    const half = computeFreshnessConfidence(WINDOW_MS / 2, WINDOW_MS);
    assert.ok(half > 0.2 && half < 1);
  });

  it("corroboration: diminishing returns from 0 to 3+ independent fresh sources", () => {
    assert.equal(computeCorroborationConfidence(0), 0.3);
    assert.equal(computeCorroborationConfidence(1), 0.5);
    assert.equal(computeCorroborationConfidence(2), 0.75);
    assert.equal(computeCorroborationConfidence(3), 0.9);
    assert.equal(computeCorroborationConfidence(10), 1);
  });

  it("conflict penalty: zero unless a conflict is flagged, then matches severity", () => {
    assert.equal(computeConflictPenalty(false), 0);
    assert.equal(computeConflictPenalty(true, 0.5), 0.5);
    assert.equal(computeConflictPenalty(true), 1);
  });
});

function fullyTrustedComponents(): ConfidenceComponents {
  return {
    assignmentConfidence: 1,
    identityConfidence: 1,
    projectMatchConfidence: 1,
    extractionConfidence: 1,
    sourceAuthorityConfidence: 1,
    freshnessConfidence: 1,
    corroborationConfidence: 1,
    conflictPenalty: 0,
  };
}

describe("aggregateConfidence (WL-05 determinism gate)", () => {
  it("is 1.0 when every component is fully trusted and there is no conflict", () => {
    const { finalConfidence } = aggregateConfidence(fullyTrustedComponents());
    assert.equal(finalConfidence, 1);
  });

  it("is deterministic: identical inputs produce identical output and component breakdown", () => {
    const input: ConfidenceComponents = {
      assignmentConfidence: 0.9,
      identityConfidence: 0.6,
      projectMatchConfidence: 0.42,
      extractionConfidence: 0.8,
      sourceAuthorityConfidence: 0.75,
      freshnessConfidence: 0.6,
      corroborationConfidence: 0.5,
      conflictPenalty: 0,
    };
    const runs = Array.from({ length: 5 }, () => aggregateConfidence({ ...input }));
    for (const run of runs) {
      assert.equal(run.finalConfidence, runs[0].finalConfidence);
      assert.deepEqual(run.components, runs[0].components);
    }
  });

  it("golden vector: a well-supported, unambiguous, fresh task scores high", () => {
    const { finalConfidence } = aggregateConfidence({
      assignmentConfidence: 1, // explicit Jira assignee
      identityConfidence: 1, // self-scoped
      projectMatchConfidence: 1, // exact Jira-key hit
      extractionConfidence: 0.9, // LLM is confident this is a real assignment
      sourceAuthorityConfidence: 0.8, // Jira tier
      freshnessConfidence: 1, // brand new
      corroborationConfidence: 0.75, // two independent sources
      conflictPenalty: 0,
    });
    assert.ok(finalConfidence > 0.85, `expected > 0.85, got ${finalConfidence}`);
  });

  it("golden vector: an ambiguous, unresolved-identity, stale, single-source task scores low", () => {
    const { finalConfidence } = aggregateConfidence({
      assignmentConfidence: 0.5, // no owner, no first-person signal
      identityConfidence: 0.6, // named but never resolved
      projectMatchConfidence: 0.5, // unscored assignment
      extractionConfidence: 0.4, // LLM itself is unsure
      sourceAuthorityConfidence: 0.4, // confluence tier
      freshnessConfidence: 0.2, // stale
      corroborationConfidence: 0.3, // single source
      conflictPenalty: 0,
    });
    assert.ok(finalConfidence < 0.5, `expected < 0.5, got ${finalConfidence}`);
  });

  it("golden vector: an unresolved conflict measurably drags down an otherwise-strong task", () => {
    const strong: ConfidenceComponents = {
      assignmentConfidence: 1,
      identityConfidence: 1,
      projectMatchConfidence: 1,
      extractionConfidence: 0.9,
      sourceAuthorityConfidence: 0.8,
      freshnessConfidence: 1,
      corroborationConfidence: 0.75,
      conflictPenalty: 0,
    };
    const withConflict = { ...strong, conflictPenalty: 1 };
    const a = aggregateConfidence(strong).finalConfidence;
    const b = aggregateConfidence(withConflict).finalConfidence;
    assert.ok(b < a, `expected conflict penalty to lower confidence: ${b} >= ${a}`);
    // A severe conflict must be visible (>=25% cut) but never force confidence to zero —
    // the conflict itself, not this score, is what the UI must surface.
    assert.ok(a - b >= a * 0.25);
    assert.ok(b > 0);
  });

  it("clamps out-of-range component inputs instead of propagating garbage", () => {
    const { finalConfidence, components } = aggregateConfidence({
      assignmentConfidence: 1.5,
      identityConfidence: -0.2,
      projectMatchConfidence: 1,
      extractionConfidence: 1,
      sourceAuthorityConfidence: 1,
      freshnessConfidence: 1,
      corroborationConfidence: 1,
      conflictPenalty: -1,
    });
    assert.equal(components.assignmentConfidence, 1);
    assert.equal(components.identityConfidence, 0);
    assert.ok(finalConfidence >= 0 && finalConfidence <= 1);
  });
});
