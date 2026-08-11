import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OVERRIDE_PRESSURE_WINDOW_MS,
  detectTaskFieldOverrides,
  freshCriticalOverride,
  latestCriticalOverride,
  mergeTaskOverrides,
  overrideHeadline,
  type TaskOverrideRecord,
} from "./taskOverride.ts";

const NOW_MS = Date.parse("2026-08-11T09:00:00.000Z");
const DETECTED_AT = new Date(NOW_MS).toISOString();

function hoursAgoIso(hours: number): string {
  return new Date(NOW_MS - hours * 60 * 60 * 1000).toISOString();
}

const TRANSCRIPT = {
  id: 91,
  title: "Notes: Canvas design sync",
  sourceType: "granola",
  sourceDate: hoursAgoIso(2),
  isTranscript: true,
};

function values(
  overrides: Partial<Parameters<typeof detectTaskFieldOverrides>[0]["existing"]> = {}
) {
  return {
    reason: "The header must stay at 64px per the original spec.",
    nextAction: "Ship the header at 64px.",
    doneCriteria: ["Header is 64px", "Spacing matches Figma"],
    dueDate: "2026-08-14",
    ...overrides,
  };
}

function detect(
  input: Partial<Parameters<typeof detectTaskFieldOverrides>[0]> = {}
): TaskOverrideRecord[] {
  return detectTaskFieldOverrides({
    existing: values(),
    incoming: values(),
    source: TRANSCRIPT,
    quotes: ["Lucas Saeed: the header goes to 48px, ignore the old spec."],
    detectedAt: DETECTED_AT,
    ...input,
  });
}

describe("detectTaskFieldOverrides", () => {
  it("records a critical override with the transcript quote as proof", () => {
    const records = detect({
      incoming: values({ nextAction: "Ship the header at 48px." }),
    });

    assert.equal(records.length, 1);
    const [record] = records;
    assert.equal(record.field, "nextAction");
    assert.equal(record.severity, "critical");
    assert.equal(record.previousValue, "Ship the header at 64px.");
    assert.equal(record.newValue, "Ship the header at 48px.");
    assert.equal(
      record.quote,
      "Lucas Saeed: the header goes to 48px, ignore the old spec."
    );
    assert.equal(record.sourceItemId, 91);
    assert.equal(record.sourceTitle, "Notes: Canvas design sync");
    assert.equal(record.sourceDate, TRANSCRIPT.sourceDate);
  });

  it("reports every contradicted field independently", () => {
    const records = detect({
      incoming: values({
        reason: "The header must drop to 48px after today's review.",
        nextAction: "Ship the header at 48px.",
        doneCriteria: ["Header is 48px", "Spacing matches Figma"],
        dueDate: "2026-08-12",
      }),
    });

    assert.deepEqual(
      records.map((record) => record.field).sort(),
      ["doneCriteria", "dueDate", "nextAction", "reason"]
    );
  });

  it("ignores a non-transcript source — Jira field churn is mechanical state", () => {
    const records = detect({
      source: { ...TRANSCRIPT, sourceType: "jira", isTranscript: false },
      incoming: values({ nextAction: "Ship the header at 48px." }),
    });

    assert.deepEqual(records, []);
  });

  it("refuses to record an override with no verbatim quote", () => {
    assert.deepEqual(
      detect({ quotes: [], incoming: values({ nextAction: "Ship at 48px." }) }),
      []
    );
    assert.deepEqual(
      detect({ quotes: ["   ", null], incoming: values({ nextAction: "Ship at 48px." }) }),
      []
    );
  });

  it("treats elaboration of the same instruction as no override", () => {
    const records = detect({
      incoming: values({
        nextAction: "Ship the header at 64px. Coordinate with Lucas first.",
      }),
    });

    assert.deepEqual(records, []);
  });

  it("ignores whitespace, casing and trailing punctuation differences", () => {
    const records = detect({
      incoming: values({
        reason: "  the header must stay at 64px per the original spec  ",
        nextAction: "Ship the header at 64px",
      }),
    });

    assert.deepEqual(records, []);
  });

  it("treats added criteria and a first due date as additions, not overrides", () => {
    const records = detect({
      existing: values({ dueDate: null }),
      incoming: values({
        doneCriteria: ["Header is 64px", "Spacing matches Figma", "QA signed off"],
        dueDate: "2026-08-20",
      }),
    });

    assert.deepEqual(records, []);
  });

  it("records dropped done criteria as an override of the whole list", () => {
    const records = detect({
      incoming: values({ doneCriteria: ["Header is 48px"] }),
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].field, "doneCriteria");
    assert.equal(records[0].previousValue, "Header is 64px · Spacing matches Figma");
    assert.equal(records[0].newValue, "Header is 48px");
  });

  it("does not fire when the incoming field is empty", () => {
    assert.deepEqual(detect({ incoming: values({ nextAction: "" }) }), []);
  });
});

describe("mergeTaskOverrides", () => {
  function record(overrides: Partial<TaskOverrideRecord> = {}): TaskOverrideRecord {
    return {
      field: "nextAction",
      previousValue: "old",
      newValue: "new",
      quote: "quote",
      sourceItemId: 1,
      sourceTitle: "Meeting",
      sourceType: "granola",
      sourceDate: hoursAgoIso(2),
      severity: "critical",
      detectedAt: DETECTED_AT,
      ...overrides,
    };
  }

  it("puts the newest override first", () => {
    const older = record({ sourceItemId: 1, detectedAt: hoursAgoIso(48) });
    const newer = record({ sourceItemId: 2, detectedAt: DETECTED_AT });

    assert.deepEqual(
      mergeTaskOverrides([older], [newer]).map((entry) => entry.sourceItemId),
      [2, 1]
    );
  });

  it("replaces the same field from the same source instead of stacking duplicates", () => {
    const first = record({ newValue: "48px" });
    const rerun = record({ newValue: "48px, confirmed" });

    const merged = mergeTaskOverrides([first], [rerun]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].newValue, "48px, confirmed");
  });

  it("keeps different fields from the same meeting", () => {
    const merged = mergeTaskOverrides(
      [record({ field: "reason" })],
      [record({ field: "dueDate" })]
    );
    assert.equal(merged.length, 2);
  });

  it("caps history at the retention limit", () => {
    const existing = Array.from({ length: 12 }, (_, index) =>
      record({ sourceItemId: index + 10, detectedAt: hoursAgoIso(index + 5) })
    );
    const merged = mergeTaskOverrides(existing, [record({ sourceItemId: 99 })]);
    assert.equal(merged.length, 10);
    assert.equal(merged[0].sourceItemId, 99);
  });

  it("returns the existing history unchanged when nothing new was detected", () => {
    const existing = [record()];
    assert.deepEqual(mergeTaskOverrides(existing, []), existing);
  });
});

describe("freshCriticalOverride", () => {
  function record(hoursAgo: number): TaskOverrideRecord {
    return {
      field: "reason",
      previousValue: "old",
      newValue: "new",
      quote: "quote",
      sourceItemId: 5,
      sourceTitle: "Notes: Canvas design sync",
      sourceType: "granola",
      sourceDate: hoursAgoIso(hoursAgo),
      severity: "critical",
      detectedAt: hoursAgoIso(hoursAgo),
    };
  }

  it("returns an override inside the pressure window", () => {
    assert.notEqual(freshCriticalOverride([record(10)], NOW_MS), null);
  });

  it("ignores an override older than the pressure window", () => {
    const stale = OVERRIDE_PRESSURE_WINDOW_MS / (60 * 60 * 1000) + 1;
    assert.equal(freshCriticalOverride([record(stale)], NOW_MS), null);
  });

  it("handles an empty or missing history", () => {
    assert.equal(freshCriticalOverride([], NOW_MS), null);
    assert.equal(freshCriticalOverride(null, NOW_MS), null);
    assert.equal(latestCriticalOverride(undefined), null);
  });

  it("builds a readable headline", () => {
    assert.equal(
      overrideHeadline(record(1)),
      "Why this matters overridden by Notes: Canvas design sync"
    );
  });
});
