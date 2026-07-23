import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSourceRelevantToTask,
  planEvidenceRelevancePrune,
  taskDomainText,
  type PruneSourceInfo,
} from "./evidenceRelevance";

const NEWEST = new Date("2026-07-22T14:22:00.000Z").getTime();
const domain = taskDomainText({
  title: "UATL-380 · Design Part Search Banner",
  reason: "Design a unified search banner shown across every module.",
  nextAction: "Create 2-3 banner mockups for the unified search page.",
});

describe("isSourceRelevantToTask", () => {
  it("keeps the Jira anchor regardless of freshness or overlap", () => {
    const decision = isSourceRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      group: {
        sourceItemId: 250,
        sourceType: "jira",
        sourceExternalId: "UATL-380",
        sourceDate: "2026-01-01T00:00:00.000Z",
        quotesText: "anything",
      },
    });
    assert.equal(decision.relevant, true);
  });

  it("keeps a fresh source whose quotes overlap the task domain", () => {
    const decision = isSourceRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      group: {
        sourceItemId: 254,
        sourceType: "granola",
        sourceExternalId: null,
        sourceDate: "2026-07-22T14:22:00.000Z",
        quotesText: "Create 2-3 more banner mockups for unified search page",
      },
    });
    assert.equal(decision.relevant, true);
  });

  it("drops a fresh source whose quotes are off-topic", () => {
    const decision = isSourceRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      group: {
        sourceItemId: 248,
        sourceType: "granola",
        sourceExternalId: null,
        sourceDate: "2026-07-22T09:00:00.000Z",
        quotesText: "I think that when I first saw the high 92% confidence score",
      },
    });
    assert.equal(decision.relevant, false);
  });

  it("drops a source older than the freshness window", () => {
    const decision = isSourceRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      group: {
        sourceItemId: 54,
        sourceType: "gmail",
        sourceExternalId: null,
        sourceDate: "2026-06-09T09:00:00.000Z",
        quotesText: "banner mockups unified search", // overlaps, but stale
      },
    });
    assert.equal(decision.relevant, false);
  });

  it("keeps a source that cites the ticket key even when off-topic", () => {
    const decision = isSourceRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      group: {
        sourceItemId: 300,
        sourceType: "gmail",
        sourceExternalId: null,
        sourceDate: "2026-07-22T09:00:00.000Z",
        quotesText: "Following up on UATL-380 with the team",
      },
    });
    assert.equal(decision.relevant, true);
  });
});

describe("planEvidenceRelevancePrune", () => {
  const sourceById = new Map<number, PruneSourceInfo>([
    [250, { sourceType: "jira", sourceExternalId: "UATL-380", sourceDate: "2026-07-22T11:03:00.000Z" }],
    [254, { sourceType: "granola", sourceExternalId: null, sourceDate: "2026-07-22T14:22:00.000Z" }],
    [248, { sourceType: "granola", sourceExternalId: null, sourceDate: "2026-07-22T09:00:00.000Z" }],
    [54, { sourceType: "gmail", sourceExternalId: null, sourceDate: "2026-06-09T09:00:00.000Z" }],
  ]);

  it("prunes stale and off-topic evidence but keeps the anchor and relevant fresh sources", () => {
    const pruned = planEvidenceRelevancePrune({
      tasks: [
        {
          id: 487,
          title: "UATL-380 · Design Part Search Banner",
          reason: "Design a unified search banner shown across every module.",
          nextAction: "Create 2-3 banner mockups for the unified search page.",
          evidence: [
            { id: 1, sourceItemId: 250, quote: "Banner for all modules", summary: "", sourceDate: "2026-07-22T11:03:00.000Z" },
            { id: 2, sourceItemId: 254, quote: "Create 2-3 more banner mockups for unified search page", summary: "", sourceDate: "2026-07-22T14:22:00.000Z" },
            { id: 3, sourceItemId: 248, quote: "the high 92% confidence score", summary: "", sourceDate: "2026-07-22T09:00:00.000Z" },
            { id: 4, sourceItemId: 54, quote: "map the file columns", summary: "", sourceDate: "2026-06-09T09:00:00.000Z" },
          ],
        },
      ],
      sourceById,
    });

    assert.deepEqual(
      pruned.map((p) => p.evidenceId).sort((a, b) => a - b),
      [3, 4]
    );
  });

  it("never touches non-anchored (meeting-only) tasks", () => {
    const pruned = planEvidenceRelevancePrune({
      tasks: [
        {
          id: 900,
          title: "Prepare AI/SDLC company presentation",
          reason: "Ivan asked for a company presentation.",
          nextAction: "Draft the slides.",
          evidence: [
            { id: 10, sourceItemId: 54, quote: "totally unrelated column mapping", summary: "", sourceDate: "2026-06-09T09:00:00.000Z" },
          ],
        },
      ],
      sourceById,
    });
    assert.equal(pruned.length, 0);
  });
});
