import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectJiraDoneVsOpenTaskConflicts, type ConflictCandidateSource, type ConflictCandidateTask } from "./conflictDetection";

function jiraDoneSource(id: number, key: string): ConflictCandidateSource {
  return {
    id,
    sourceType: "jira",
    sourceExternalId: key,
    metadata: { statusCategoryKey: "done" },
  };
}

function jiraOpenSource(id: number, key: string): ConflictCandidateSource {
  return {
    id,
    sourceType: "jira",
    sourceExternalId: key,
    metadata: { statusCategoryKey: "indeterminate" },
  };
}

describe("detectJiraDoneVsOpenTaskConflicts (WL-06)", () => {
  it("flags a conflict when a non-done task cites a Jira-Done source", () => {
    const conflicts = detectJiraDoneVsOpenTaskConflicts({
      tasks: [
        {
          status: "next",
          title: "Finish UATL-367 review",
          evidence: [{ sourceItemId: 10 }, { sourceItemId: 11 }],
        },
      ],
      sources: [jiraDoneSource(10, "UATL-367")],
    });
    assert.equal(conflicts.length, 1);
    assert.match(conflicts[0].summary, /UATL-367/);
    assert.deepEqual(new Set(conflicts[0].evidenceIds), new Set([10, 11]));
  });

  it("flags a conflict via title key match even without a direct evidence citation", () => {
    const conflicts = detectJiraDoneVsOpenTaskConflicts({
      tasks: [
        {
          status: "waiting",
          title: "UATL-367 · Convert file manager to Canvas",
          evidence: [{ sourceItemId: 99 }],
        },
      ],
      sources: [jiraDoneSource(10, "UATL-367")],
    });
    assert.equal(conflicts.length, 1);
  });

  it("does not flag a conflict when the citing task is itself already done", () => {
    const conflicts = detectJiraDoneVsOpenTaskConflicts({
      tasks: [
        { status: "done", title: "UATL-367 wrap-up", evidence: [{ sourceItemId: 10 }] },
      ],
      sources: [jiraDoneSource(10, "UATL-367")],
    });
    assert.equal(conflicts.length, 0);
  });

  it("does not flag a conflict for a Jira source that is not Done", () => {
    const conflicts = detectJiraDoneVsOpenTaskConflicts({
      tasks: [
        { status: "next", title: "UATL-500 follow-up", evidence: [{ sourceItemId: 20 }] },
      ],
      sources: [jiraOpenSource(20, "UATL-500")],
    });
    assert.equal(conflicts.length, 0);
  });

  // Explicit negative case required by the audit's WL-06 acceptance
  // criteria: a second, unrelated Done ticket with no citing task must
  // produce no conflict, and — critically — unrelated meeting evidence from
  // a completely different task must never be pulled into any conflict.
  it("two-ticket negative case: an unrelated Done ticket with no citing task attaches no unrelated meeting evidence", () => {
    const conflictedTicket = jiraDoneSource(10, "UATL-367");
    const unrelatedDoneTicket = jiraDoneSource(30, "UATL-999");

    const conflictedTask: ConflictCandidateTask = {
      status: "next",
      title: "Finish UATL-367 review",
      evidence: [{ sourceItemId: 10 }, { sourceItemId: 11 }],
    };
    // A task from a completely different meeting/topic — must never be
    // treated as evidence for UATL-999's (non-existent) conflict.
    const unrelatedMeetingTask: ConflictCandidateTask = {
      status: "next",
      title: "Prep Q3 roadmap deck",
      evidence: [{ sourceItemId: 42 }],
    };

    const conflicts = detectJiraDoneVsOpenTaskConflicts({
      tasks: [conflictedTask, unrelatedMeetingTask],
      sources: [conflictedTicket, unrelatedDoneTicket],
    });

    assert.equal(conflicts.length, 1);
    assert.match(conflicts[0].summary, /UATL-367/);
    assert.ok(!conflicts.some((conflict) => conflict.summary.includes("UATL-999")));
    // The unrelated meeting's evidence id (42) must never appear anywhere.
    assert.ok(!conflicts.some((conflict) => conflict.evidenceIds.includes(42)));
  });

  it("is deterministic and order-independent for the source list", () => {
    const tasks: ConflictCandidateTask[] = [
      { status: "next", title: "Finish A review", evidence: [{ sourceItemId: 1 }] },
    ];
    const sources = [jiraDoneSource(1, "A-1"), jiraOpenSource(2, "B-2")];
    const a = detectJiraDoneVsOpenTaskConflicts({ tasks, sources });
    const b = detectJiraDoneVsOpenTaskConflicts({ tasks, sources: [...sources].reverse() });
    assert.deepEqual(a, b);
  });
});
