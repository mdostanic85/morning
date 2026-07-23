import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NEEDS_INPUT_MAX_AGE_DAYS,
  daysBetween,
  latestSignalDate,
  mentionsMe,
  needsInputItemIsRelevant,
} from "./needsInputRelevance.ts";

const TODAY = "2026-07-23";
const fresh = "2026-07-22T09:00:00.000Z"; // 1 day ago
const stale = "2026-07-13T09:00:00.000Z"; // 10 days ago

describe("daysBetween / latestSignalDate", () => {
  it("returns Infinity for unparseable input", () => {
    assert.equal(daysBetween("nope", TODAY), Number.POSITIVE_INFINITY);
  });

  it("picks the most recent parseable date", () => {
    assert.equal(latestSignalDate([stale, null, fresh, "bad"]), fresh);
  });

  it("returns null when nothing parses", () => {
    assert.equal(latestSignalDate([null, undefined, "bad"]), null);
  });
});

describe("mentionsMe", () => {
  it("matches the user's first name on a word boundary", () => {
    assert.equal(mentionsMe("Milos should review the badge", "Milos"), true);
    assert.equal(mentionsMe("assigned to Milos Dostanic", "Milos Dostanic"), true);
  });

  it("does not match when the name is absent", () => {
    assert.equal(mentionsMe("Update the left-nav badge", "Milos"), false);
  });

  it("is false without a usable name", () => {
    assert.equal(mentionsMe("anything", null), false);
    assert.equal(mentionsMe("", "Milos"), false);
  });
});

describe("needsInputItemIsRelevant", () => {
  const base = {
    text: "Investigate tooling options for the team",
    latestSignalDate: fresh,
    myName: "Milos",
    today: TODAY,
  };

  it("drops work owned by someone else", () => {
    assert.equal(
      needsInputItemIsRelevant({ ...base, ownership: "other" }),
      false
    );
  });

  it("drops stale items even when they are mine", () => {
    assert.equal(
      needsInputItemIsRelevant({ ...base, ownership: "mine", latestSignalDate: stale }),
      false
    );
  });

  it("drops items with no known date", () => {
    assert.equal(
      needsInputItemIsRelevant({ ...base, ownership: "mine", latestSignalDate: null }),
      false
    );
  });

  it("keeps a fresh item that is explicitly mine", () => {
    assert.equal(needsInputItemIsRelevant({ ...base, ownership: "mine" }), true);
  });

  it("drops a fresh unclear item that never names me", () => {
    assert.equal(needsInputItemIsRelevant({ ...base, ownership: "unclear" }), false);
  });

  it("keeps a fresh unclear item that names me", () => {
    assert.equal(
      needsInputItemIsRelevant({
        ...base,
        ownership: "unclear",
        text: "Clarify whether Milos owns the tooling decision",
      }),
      true
    );
  });

  it("respects the freshness window constant", () => {
    const edgeStale = new Date(
      Date.parse(`${TODAY}T00:00:00.000Z`) - (NEEDS_INPUT_MAX_AGE_DAYS + 1) * 86_400_000
    ).toISOString();
    assert.equal(
      needsInputItemIsRelevant({ ...base, ownership: "mine", latestSignalDate: edgeStale }),
      false
    );
  });
});
