import assert from "node:assert/strict";
import test from "node:test";
import {
  isRawPriorityExplanation,
  priorityExplanationForDisplay,
} from "./priorityExplanation.ts";

test("condenses raw ranking signals into two readable sentences", () => {
  const raw =
    "Marked as in focus now · Jira UATL-367 · Medium · Actively in progress in Jira (In Progress) · Fresh signal in last 48h · Meeting transcript instruction · Committed in a meeting you attended in the last 4 days · Explicit instruction from Matt Pettit or Lucas Saeed · Confirmed by jira and granola";
  const result = priorityExplanationForDisplay(raw);

  assert.equal(isRawPriorityExplanation(raw), true);
  assert.equal(result.includes("·"), false);
  assert.match(result, /recent meeting you attended/i);
  assert.match(result, /UATL-367 is already in progress/i);
  assert.equal((result.match(/[.!?](?:\s|$)/g) ?? []).length, 2);
});

test("keeps an already readable explanation unchanged", () => {
  const readable =
    "This was requested in yesterday’s design review. Finishing it now unblocks the handoff.";
  assert.equal(priorityExplanationForDisplay(readable), readable);
});
