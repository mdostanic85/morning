import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCriteriaToVerificationReport } from "./criterionVerificationMatch";

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
