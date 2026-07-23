import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isQuoteRelevantToTask,
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

describe("isQuoteRelevantToTask", () => {
  it("keeps the Jira anchor regardless of freshness or overlap", () => {
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "jira",
        sourceExternalId: "UATL-380",
        sourceDate: "2026-01-01T00:00:00.000Z",
      },
      quoteText: "anything",
    });
    assert.equal(decision.relevant, true);
  });

  it("keeps a fresh quote that overlaps the task domain", () => {
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "granola",
        sourceExternalId: null,
        sourceDate: "2026-07-22T14:22:00.000Z",
      },
      quoteText: "Create 2-3 more banner mockups for unified search page",
    });
    assert.equal(decision.relevant, true);
  });

  it("drops a fresh quote that is off-topic", () => {
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "granola",
        sourceExternalId: null,
        sourceDate: "2026-07-22T09:00:00.000Z",
      },
      quoteText: "I think that when I first saw the high 92% confidence score",
    });
    assert.equal(decision.relevant, false);
  });

  it("drops a quote older than the freshness window", () => {
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "gmail",
        sourceExternalId: null,
        sourceDate: "2026-06-09T09:00:00.000Z",
      },
      quoteText: "banner mockups unified search", // overlaps, but stale
    });
    assert.equal(decision.relevant, false);
  });

  it("keeps a quote that itself cites the ticket key even when off-topic", () => {
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "gmail",
        sourceExternalId: null,
        sourceDate: "2026-07-22T09:00:00.000Z",
      },
      quoteText: "Following up on UATL-380 with the team",
    });
    assert.equal(decision.relevant, true);
  });

  it("drops an off-topic sibling quote even when it shares the source with a key-citing line", () => {
    // The key-citing sibling ("Following up on UATL-380") does NOT rescue this
    // line — each quote is judged on its own.
    const decision = isQuoteRelevantToTask({
      taskKey: "UATL-380",
      domain,
      newestSourceTime: NEWEST,
      source: {
        sourceType: "granola",
        sourceExternalId: null,
        sourceDate: "2026-07-22T09:00:00.000Z",
      },
      quoteText: "The confidence percentage sits in the wrong spot on the card",
    });
    assert.equal(decision.relevant, false);
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

  it("prunes an off-topic row but keeps an on-topic row from the SAME source", () => {
    const pruned = planEvidenceRelevancePrune({
      tasks: [
        {
          id: 487,
          title: "UATL-380 · Design Part Search Banner",
          reason: "Design a unified search banner shown across every module.",
          nextAction: "Create 2-3 banner mockups for the unified search page.",
          evidence: [
            { id: 1, sourceItemId: 250, quote: "Banner for all modules", summary: "", sourceDate: "2026-07-22T11:03:00.000Z" },
            // Both lines come from the one "Milos & Lucas sync" meeting (254).
            { id: 2, sourceItemId: 254, quote: "Create 2-3 more banner mockups for the unified search page", summary: "", sourceDate: "2026-07-22T14:22:00.000Z" },
            { id: 3, sourceItemId: 254, quote: "when I first saw the high 92% confidence score placement", summary: "", sourceDate: "2026-07-22T14:22:00.000Z" },
          ],
        },
      ],
      sourceById,
    });

    // Only the confidence line (row 3) is dropped; the banner line (row 2) and
    // the Jira anchor (row 1) survive — per-quote, not per-source.
    assert.deepEqual(
      pruned.map((p) => p.evidenceId),
      [3]
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
