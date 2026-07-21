import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTaskConfidence } from "./taskConfidence";

const NOW = new Date("2026-07-21T12:00:00.000Z").getTime();

function jiraSource(overrides: Partial<{ body: string; sourceDate: string }> = {}) {
  return {
    sourceType: "jira",
    title: "UATL-367",
    body: overrides.body ?? "Assignee: Milos Dostanic\nStatus: In Progress",
    url: null,
    metadata: null,
    sourceDate: overrides.sourceDate ?? "2026-07-21T09:00:00.000Z",
  };
}

function transcriptSource(overrides: Partial<{ sourceDate: string; body: string }> = {}) {
  return {
    sourceType: "granola",
    title: "Design sync",
    body: overrides.body ?? "Matt said we should ship the Canvas change by Friday.",
    url: null,
    metadata: null,
    sourceDate: overrides.sourceDate ?? "2026-07-21T10:00:00.000Z",
  };
}

describe("computeTaskConfidence (WL-05 wiring)", () => {
  it("scores highest for an explicit Jira assignee match on a fresh, corroborated task", () => {
    const source = jiraSource();
    const result = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.9,
      title: "UATL-367 · Convert file manager to Canvas",
      reason: "Ticket assigned to Milos",
      nextAction: "Implement Canvas conversion",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: true,
      evidenceSources: [source, transcriptSource()],
      now: NOW,
    });
    assert.equal(result.components.assignmentConfidence, 1);
    assert.ok(result.finalConfidence > 0.7, `expected > 0.7, got ${result.finalConfidence}`);
  });

  it("gives a lower assignment score when the owner is named but not the current user", () => {
    const source = jiraSource({ body: "Assignee: Sofija Peric\nStatus: In Progress" });
    const result = computeTaskConfidence({
      ownerName: "Sofija Peric",
      extractionConfidence: 0.8,
      title: "Some other task",
      reason: "Assigned to Sofija",
      nextAction: "Do the work",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: true,
      evidenceSources: [source],
      now: NOW,
    });
    // Not "me" — assignmentConfidence must not be the max Jira-assignee-match score.
    assert.ok(result.components.assignmentConfidence < 1);
  });

  it("treats a named-but-unresolved owner as a lower identity score than a self-scoped task", () => {
    const source = transcriptSource();
    const selfScoped = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.8,
      title: "Follow up on design",
      reason: "I'll follow up",
      nextAction: "Send the follow-up",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: false,
      evidenceSources: [source],
      now: NOW,
    });
    const namedOwner = computeTaskConfidence({
      ownerName: "Lucas",
      extractionConfidence: 0.8,
      title: "Follow up on design",
      reason: "Lucas to follow up",
      nextAction: "Send the follow-up",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: false,
      evidenceSources: [source],
      now: NOW,
    });
    assert.ok(selfScoped.components.identityConfidence > namedOwner.components.identityConfidence);
  });

  it("gives more corroboration confidence with more independent fresh sources", () => {
    const s1 = transcriptSource({ sourceDate: "2026-07-21T09:00:00.000Z" });
    const s2 = jiraSource({ sourceDate: "2026-07-20T09:00:00.000Z" });
    const single = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.7,
      title: "Task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: s1,
      hasProject: false,
      evidenceSources: [s1],
      now: NOW,
    });
    const corroborated = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.7,
      title: "Task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: s1,
      hasProject: false,
      evidenceSources: [s1, s2],
      now: NOW,
    });
    assert.ok(corroborated.components.corroborationConfidence > single.components.corroborationConfidence);
    assert.ok(corroborated.finalConfidence > single.finalConfidence);
  });

  it("lowers freshness confidence for evidence outside the 5-day window", () => {
    const stale = transcriptSource({ sourceDate: "2026-06-01T09:00:00.000Z" });
    const result = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.8,
      title: "Old task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: stale,
      hasProject: false,
      evidenceSources: [stale],
      now: NOW,
    });
    assert.equal(result.components.freshnessConfidence, 0.2);
  });

  it("applies the conflict penalty when a conflict is flagged", () => {
    const source = jiraSource();
    const withoutConflict = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.9,
      title: "Task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: true,
      evidenceSources: [source],
      now: NOW,
    });
    const withConflict = computeTaskConfidence({
      ownerName: null,
      extractionConfidence: 0.9,
      title: "Task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: true,
      evidenceSources: [source],
      hasUnresolvedConflict: true,
      conflictSeverity: 1,
      now: NOW,
    });
    assert.ok(withConflict.finalConfidence < withoutConflict.finalConfidence);
  });

  it("is deterministic for identical inputs", () => {
    const source = jiraSource();
    const input = {
      ownerName: "Milos Dostanic",
      extractionConfidence: 0.85,
      title: "Task",
      reason: "reason",
      nextAction: "next",
      currentUserName: "Milos Dostanic",
      primarySource: source,
      hasProject: true,
      evidenceSources: [source],
      now: NOW,
    };
    const a = computeTaskConfidence(input);
    const b = computeTaskConfidence({ ...input });
    assert.deepEqual(a, b);
  });
});
