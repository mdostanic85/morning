import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MEETING_IMMINENT_BOOST,
  MEETING_LATER_TODAY_BOOST,
  meetingPressureBoost,
} from "./meetingPressure";
import { rankWorkTasks, type WorkTaskForRanking } from "./priorityRank";
import { priorityExplanationForDisplay } from "./priorityExplanation";
import type { SourceItem } from "../../domain/sourceItem";

const NOW = Date.parse("2026-08-11T09:00:00.000Z");

function inHours(hours: number): string {
  return new Date(NOW + hours * 60 * 60 * 1000).toISOString();
}

function boost(
  meetings: { title: string; startAt?: string | null }[],
  task: { jiraKey: string | null; text: string }
) {
  return meetingPressureBoost({ task, meetings, nowMs: NOW });
}

const FILE_MANAGER_TASK = {
  jiraKey: "UATL-367",
  text: "Convert file manager to Canvas. Finish the remaining file manager screens.",
};

describe("meetingPressureBoost", () => {
  it("boosts work a meeting names by its Jira key", () => {
    const result = boost(
      [{ title: "UATL-367 walkthrough", startAt: inHours(1) }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, MEETING_IMMINENT_BOOST);
    assert.match(result.notes[0], /UATL-367 walkthrough/);
    assert.match(result.notes[0], /covers this — prepare before it/);
  });

  it("boosts work a meeting names in words, ignoring the ceremony label", () => {
    const result = boost(
      [{ title: "Content File Manager - Review", startAt: inHours(5) }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, MEETING_LATER_TODAY_BOOST);
  });

  it("does not boost on a generic ceremony title alone", () => {
    const result = boost([{ title: "Daily standup", startAt: inHours(1) }], {
      jiraKey: null,
      text: "Run the daily standup notes cleanup and review the sync",
    });

    assert.equal(result.score, 0);
    assert.deepEqual(result.notes, []);
  });

  it("does not boost unrelated work", () => {
    const result = boost(
      [{ title: "Billing export sync", startAt: inHours(1) }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, 0);
  });

  it("ignores a meeting that already started", () => {
    const result = boost(
      [{ title: "UATL-367 walkthrough", startAt: inHours(-1) }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, 0);
  });

  it("ignores a meeting beyond today's horizon", () => {
    const result = boost(
      [{ title: "UATL-367 walkthrough", startAt: inHours(30) }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, 0);
  });

  it("ignores all-day informational entries", () => {
    const result = boost(
      [{ title: "UATL-367 focus day", startAt: "2026-08-11" }],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, 0);
  });

  it("ignores entries with no start time at all", () => {
    const result = boost(
      [
        { title: "UATL-367 walkthrough", startAt: null },
        { title: "UATL-367 walkthrough" },
      ],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, 0);
  });

  it("counts the nearest matching meeting only once", () => {
    const result = boost(
      [
        { title: "UATL-367 sign-off", startAt: inHours(6) },
        { title: "UATL-367 walkthrough", startAt: inHours(1) },
        { title: "Content File Manager - Review", startAt: inHours(4) },
      ],
      FILE_MANAGER_TASK
    );

    assert.equal(result.score, MEETING_IMMINENT_BOOST);
    assert.equal(result.notes.length, 1);
    assert.match(result.notes[0], /walkthrough/);
  });
});

function source(overrides: Partial<SourceItem> & Pick<SourceItem, "id">): SourceItem {
  return {
    projectId: null,
    sourceType: "jira",
    sourceExternalId: null,
    title: "Untitled source",
    body: "",
    author: null,
    sourceDate: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    url: null,
    metadata: null,
    contentHash: null,
    createdAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: null,
    ...overrides,
  };
}

function task(
  overrides: Partial<WorkTaskForRanking> & Pick<WorkTaskForRanking, "id" | "title">
): WorkTaskForRanking {
  return {
    projectId: null,
    status: "later",
    reason: "Open work in the queue.",
    nextAction: "Take the next concrete step.",
    doneCriteria: ["Recorded outcome."],
    priorityScore: null,
    dueDate: null,
    owner: "Milos Dostanic",
    waitingOn: null,
    statusManuallySet: false,
    evidence: [],
    ...overrides,
  };
}

describe("rankWorkTasks with today's calendar", () => {
  const sourceById = new Map<number, SourceItem>([
    [1, source({ id: 1, sourceExternalId: "UATL-367", title: "UATL-367: File manager" })],
    [2, source({ id: 2, sourceExternalId: "UATL-500", title: "UATL-500: Billing export" })],
  ]);

  const reviewedTask = task({
    id: 10,
    title: "UATL-367 · Convert file manager to Canvas",
    evidence: [{ sourceItemId: 1, quote: null, summary: "File manager conversion" }],
  });
  const otherTask = task({
    id: 20,
    title: "UATL-500 · Fix billing export",
    evidence: [{ sourceItemId: 2, quote: null, summary: "Billing export fix" }],
  });

  it("puts the task an imminent meeting covers ahead of an equal task", () => {
    const withoutMeetings = rankWorkTasks(
      [reviewedTask, otherTask],
      "2026-08-11",
      sourceById,
      [],
      undefined,
      NOW
    );
    const withMeetings = rankWorkTasks(
      [reviewedTask, otherTask],
      "2026-08-11",
      sourceById,
      [],
      undefined,
      NOW,
      { meetings: [{ title: "UATL-367 walkthrough", startAt: inHours(1) }] }
    );

    const scoreOf = (ranked: ReturnType<typeof rankWorkTasks>, id: number) =>
      ranked.find((entry) => entry.taskId === id)?.score ?? 0;

    assert.equal(
      scoreOf(withMeetings, reviewedTask.id) - scoreOf(withoutMeetings, reviewedTask.id),
      MEETING_IMMINENT_BOOST
    );
    assert.equal(scoreOf(withMeetings, otherTask.id), scoreOf(withoutMeetings, otherTask.id));
    assert.equal(withMeetings[0]?.taskId, reviewedTask.id);
  });

  it("leaves ranking untouched when no calendar is supplied", () => {
    const baseline = rankWorkTasks(
      [reviewedTask, otherTask],
      "2026-08-11",
      sourceById,
      [],
      undefined,
      NOW
    );
    const empty = rankWorkTasks(
      [reviewedTask, otherTask],
      "2026-08-11",
      sourceById,
      [],
      undefined,
      NOW,
      { meetings: [] }
    );

    assert.deepEqual(
      empty.map((entry) => [entry.taskId, entry.score]),
      baseline.map((entry) => [entry.taskId, entry.score])
    );
  });

  it("never promotes a task whose only signal is the calendar", () => {
    // No Jira key, no due date, no evidence — the meeting match is all it has.
    const staleTask = task({
      id: 30,
      title: "Polish file manager spacing",
      reason: "Spacing looks off in the file manager.",
      nextAction: "Adjust the file manager spacing.",
      evidence: [],
    });
    const ranked = rankWorkTasks(
      [staleTask],
      "2026-08-11",
      new Map(),
      [],
      undefined,
      NOW,
      { meetings: [{ title: "Content File Manager - Review", startAt: inHours(1) }] }
    );

    assert.ok(ranked[0].score > 0, "the boost still applies to ordering");
    assert.equal(
      ranked[0].clearsPromotionFloor,
      false,
      "a calendar match alone must not earn the focus slot"
    );
  });

  it("explains the calendar reason in user-facing copy", () => {
    const ranked = rankWorkTasks(
      [reviewedTask],
      "2026-08-11",
      sourceById,
      [],
      undefined,
      NOW,
      { meetings: [{ title: "UATL-367 walkthrough", startAt: inHours(1) }] }
    );

    const display = priorityExplanationForDisplay(ranked[0].explanation.join(" · "));
    assert.match(display, /meeting later today covers it/);
  });
});
