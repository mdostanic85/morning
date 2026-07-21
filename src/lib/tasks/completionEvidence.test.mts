import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSelfReportedCompletion } from "./completionEvidence.ts";
import { planSelfReportedCompletionReconciliation } from "../imports/selfReportedCompletionReconciliation.ts";

describe("detectSelfReportedCompletion", () => {
  it("finds a completion claim in today's freshest evidence", () => {
    // Regression: "Review Content File Manager" (task 419) kept showing as
    // an actionable "next" task even though today's Granola note said the
    // design was already finalized.
    const signal = detectSelfReportedCompletion([
      {
        sourceItemId: 223,
        quote: "Content file manager is purely a utility for Merrill",
        summary:
          "The task is to review the content file manager design and functionality. The design has been finalized by Milos, and tickets have been updated by Sofija.",
        sourceDate: "2026-07-20T14:03:01.541Z",
      },
    ]);
    assert.ok(signal);
    assert.equal(signal?.sourceItemId, 223);
    assert.match(signal?.matchedText ?? "", /finaliz/i);
  });

  it("ignores a stale completion claim from before the freshest evidence", () => {
    const signal = detectSelfReportedCompletion([
      {
        sourceItemId: 1,
        quote: null,
        summary: "This was already done last week.",
        sourceDate: "2026-07-01T09:00:00.000Z",
      },
      {
        sourceItemId: 2,
        quote: null,
        summary: "New scope added today, still needs a decision on rollout.",
        sourceDate: "2026-07-20T09:00:00.000Z",
      },
    ]);
    assert.equal(signal, null);
  });

  it("returns null when there is no completion language", () => {
    const signal = detectSelfReportedCompletion([
      {
        sourceItemId: 1,
        quote: "We still need to finish the review before shipping",
        summary: "Open item, in progress.",
        sourceDate: "2026-07-20T09:00:00.000Z",
      },
    ]);
    assert.equal(signal, null);
  });
});

describe("planSelfReportedCompletionReconciliation", () => {
  it("closes a task whose own freshest evidence reports it is done", () => {
    const actions = planSelfReportedCompletionReconciliation({
      tasks: [
        {
          id: 419,
          status: "next",
          statusManuallySet: false,
          evidence: [
            {
              sourceItemId: 223,
              quote: null,
              summary: "The design has been finalized by Milos, and tickets have been updated by Sofija.",
              sourceDate: "2026-07-20T14:03:01.541Z",
            },
          ],
        },
      ],
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].taskId, 419);
  });

  it("does not close a task with no completion signal", () => {
    const actions = planSelfReportedCompletionReconciliation({
      tasks: [
        {
          id: 1,
          status: "now",
          statusManuallySet: false,
          evidence: [
            {
              sourceItemId: 1,
              quote: null,
              summary: "Still waiting on design review.",
              sourceDate: "2026-07-20T09:00:00.000Z",
            },
          ],
        },
      ],
    });
    assert.equal(actions.length, 0);
  });
});
