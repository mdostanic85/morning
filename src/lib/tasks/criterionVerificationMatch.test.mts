import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchCriteriaToDeliveryChecks,
  matchCriteriaToVerificationReport,
} from "./criterionVerificationMatch";

test("returns not_checked for every criterion when there is no report", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Share the prototype branch link with Matt", "Update the ticket status"],
    null
  );
  assert.deepEqual(verdicts, ["not_checked", "not_checked"]);
});

test("marks a criterion as met when a matches line shares most of its words", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Share the prototype branch link with Matt for review"],
    { matches: ["Shared the prototype branch link with Matt"], missing: [] }
  );
  assert.deepEqual(verdicts, ["met"]);
});

test("marks a criterion as missing when a missing line shares most of its words", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Update the Jira ticket status to Done"],
    { matches: [], missing: ["Jira ticket status was not updated to Done"] }
  );
  assert.deepEqual(verdicts, ["missing"]);
});

test("falls back to not_checked when nothing in the report overlaps enough", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Rename the Figma frame to v2"],
    { matches: ["Pushed the branch to origin"], missing: ["Tests were not added"] }
  );
  assert.deepEqual(verdicts, ["not_checked"]);
});

test("prefers met over missing when both partially overlap but met scores higher", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Write unit tests for the export function"],
    {
      matches: ["Added unit tests for the export function"],
      missing: ["export function docs"],
    }
  );
  assert.deepEqual(verdicts, ["met"]);
});

test("scores each criterion independently against a multi-line report", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Share the prototype branch link with Matt", "Update the ticket status to Done"],
    {
      matches: ["Shared the prototype branch link with Matt"],
      missing: ["Ticket status was never updated to Done"],
    }
  );
  assert.deepEqual(verdicts, ["met", "missing"]);
});

test("does not match on a single generic shared word", () => {
  const verdicts = matchCriteriaToVerificationReport(
    ["Update the design"],
    { matches: ["Update the roadmap document"], missing: [] }
  );
  assert.deepEqual(verdicts, ["not_checked"]);
});

test("falls back to sync-review ok/notOk when verification did not classify a criterion", () => {
  const results = matchCriteriaToDeliveryChecks(
    ["Ship the empty-state illustration", "Wire the primary CTA"],
    {
      verification: {
        matches: ["Wired the primary CTA on the focus card"],
        missing: [],
      },
      syncReview: {
        ok: ["Empty-state illustration is present on the Figma frame"],
        notOk: [],
      },
    }
  );
  assert.equal(results[0]?.verdict, "met");
  assert.equal(results[0]?.source, "sync_review");
  assert.match(results[0]?.detail ?? "", /Empty-state illustration/i);
  assert.equal(results[1]?.verdict, "met");
  assert.equal(results[1]?.source, "verification");
});

test("keeps verification verdict when both reports could match", () => {
  const results = matchCriteriaToDeliveryChecks(["Share the prototype branch link with Matt"], {
    verification: {
      matches: ["Shared the prototype branch link with Matt"],
      missing: [],
    },
    syncReview: {
      ok: [],
      notOk: ["Prototype branch link with Matt is missing from Figma"],
    },
  });
  assert.equal(results[0]?.verdict, "met");
  assert.equal(results[0]?.source, "verification");
});

test("matches explicit Outcome N prefixes from sync-review lines", () => {
  const results = matchCriteriaToDeliveryChecks(
    ["Ship the empty-state illustration", "Wire the primary CTA"],
    {
      syncReview: {
        ok: ["Outcome 1: empty-state illustration on Figma frame Home / Empty"],
        notOk: ["Outcome 2: primary CTA still missing from the audited frame"],
      },
    }
  );
  assert.equal(results[0]?.verdict, "met");
  assert.equal(results[1]?.verdict, "missing");
  assert.match(results[0]?.detail ?? "", /Figma frame Home/i);
});
