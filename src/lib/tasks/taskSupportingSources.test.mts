import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Evidence } from "@/domain/evidence";
import type { SourceItem } from "@/domain/sourceItem";
import { buildTaskSupportingSources, pickActionSnippet } from "./taskSupportingSources";

function source(overrides: Partial<SourceItem> & Pick<SourceItem, "id" | "sourceType">): SourceItem {
  return {
    projectId: 18,
    sourceExternalId: null,
    title: "Source",
    body: "",
    author: null,
    sourceDate: "2026-07-20T10:00:00.000Z",
    url: null,
    metadata: null,
    contentHash: null,
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
  } as SourceItem;
}

function evidence(overrides: Partial<Evidence> & Pick<Evidence, "id" | "sourceItemId">): Evidence {
  return {
    taskId: 487,
    quote: null,
    summary: "summary",
    sourceDate: "2026-07-20T10:00:00.000Z",
    url: null,
    ...overrides,
  } as Evidence;
}

describe("buildTaskSupportingSources", () => {
  it("anchors the Jira ticket, surfaces its status, and marks the newest source", () => {
    const jira = source({
      id: 250,
      sourceType: "jira",
      sourceExternalId: "UATL-380",
      title: "UATL-380: DESIGN - Banner for Part Search",
      sourceDate: "2026-07-22T11:03:00.000Z",
      metadata: { status: "In Progress", statusCategoryKey: "indeterminate" },
      url: "https://ooden.atlassian.net/browse/UATL-380",
    });
    const daily = source({
      id: 254,
      sourceType: "granola",
      title: "Hydra Daily",
      sourceDate: "2026-07-22T14:22:00.000Z",
      url: "https://notes.granola.ai/d/abc",
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "UATL-380 · Design Part Search Banner",
        status: "now",
        reason: "Design a unified search banner shown across every module.",
        nextAction: "Create 2-3 banner mockups for the unified search page.",
        evidence: [
          evidence({ id: 1, sourceItemId: 250, quote: "Banner for all modules" }),
          evidence({
            id: 2,
            sourceItemId: 254,
            quote: "Create 2-3 more banner mockups for unified search page",
            sourceDate: "2026-07-22T14:22:00.000Z",
          }),
        ],
      },
      sourceById: new Map([
        [250, jira],
        [254, daily],
      ]),
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.groups[0].sourceItemId, 250, "Jira anchor comes first");
    assert.equal(result.groups[0].isAnchor, true);
    assert.equal(result.groups[0].jiraStatus, "In Progress");
    assert.equal(result.groups[0].isLatest, false);
    const dailyGroup = result.groups.find((g) => g.sourceItemId === 254)!;
    assert.equal(dailyGroup.isLatest, true, "newest-dated source is the latest");
    assert.equal(dailyGroup.label, "Meeting note");
  });

  it("flags a conflict when Jira is Done but the task is still open", () => {
    const jira = source({
      id: 10,
      sourceType: "jira",
      sourceExternalId: "UATL-367",
      title: "UATL-367",
      metadata: { statusCategoryKey: "done", status: "Done" },
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "UATL-367 · Convert file manager to Canvas",
        status: "next",
        reason: "Convert the file manager screen to the Canvas layout.",
        nextAction: "Finish the remaining canvas screens.",
        evidence: [evidence({ id: 1, sourceItemId: 10, quote: "still finishing canvas" })],
      },
      sourceById: new Map([[10, jira]]),
    });

    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0].summary, /UATL-367/);
    assert.equal(result.groups[0].inConflict, true);
    assert.equal(result.groups[0].isJiraDone, true);
  });

  it("collapses multiple evidence rows from one source into a single group with distinct quotes", () => {
    const jira = source({
      id: 250,
      sourceType: "jira",
      sourceExternalId: "UATL-380",
      title: "UATL-380: DESIGN - Banner",
      metadata: { status: "In Progress" },
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "UATL-380 · Design Part Search Banner",
        status: "now",
        reason: "Design the part search banner.",
        nextAction: "Draft the banner concept.",
        evidence: [
          evidence({ id: 1, sourceItemId: 250, quote: "Quote one" }),
          evidence({ id: 2, sourceItemId: 250, quote: "Quote two" }),
          evidence({ id: 3, sourceItemId: 250, quote: "Quote one" }),
        ],
      },
      sourceById: new Map([[250, jira]]),
    });

    assert.equal(result.groups.length, 1);
    assert.deepEqual(
      result.groups[0].quotes.map((q) => q.text),
      ["Quote one", "Quote two"]
    );
  });

  it("hides stale and off-topic sources from a Jira-anchored task", () => {
    const jira = source({
      id: 250,
      sourceType: "jira",
      sourceExternalId: "UATL-380",
      title: "UATL-380: DESIGN - Banner for Part Search",
      sourceDate: "2026-07-22T11:03:00.000Z",
      metadata: { status: "In Progress" },
    });
    const banner = source({
      id: 254,
      sourceType: "granola",
      title: "Hydra Daily",
      sourceDate: "2026-07-22T14:22:00.000Z",
    });
    // Same day, but the cited line is about the confidence score, not the banner.
    const offTopic = source({
      id: 248,
      sourceType: "granola",
      title: "Milos & Lucas sync",
      sourceDate: "2026-07-22T09:00:00.000Z",
    });
    // Weeks old, unrelated column-mapping email.
    const stale = source({
      id: 54,
      sourceType: "gmail",
      title: "Mapping: column mapping notes",
      sourceDate: "2026-06-09T09:00:00.000Z",
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "UATL-380 · Design Part Search Banner",
        status: "now",
        reason: "Design a unified search banner shown across every module.",
        nextAction: "Create 2-3 banner mockups for the unified search page.",
        evidence: [
          evidence({ id: 1, sourceItemId: 250, quote: "Banner for all modules" }),
          evidence({
            id: 2,
            sourceItemId: 254,
            quote: "Create 2-3 more banner mockups for unified search page",
            sourceDate: "2026-07-22T14:22:00.000Z",
          }),
          evidence({
            id: 3,
            sourceItemId: 248,
            quote: "I think that when I first saw the high 92% confidence score",
            sourceDate: "2026-07-22T09:00:00.000Z",
          }),
          evidence({
            id: 4,
            sourceItemId: 54,
            quote: "If the file already has most of these columns we should map them",
            sourceDate: "2026-06-09T09:00:00.000Z",
          }),
        ],
      },
      sourceById: new Map([
        [250, jira],
        [254, banner],
        [248, offTopic],
        [54, stale],
      ]),
    });

    const ids = result.groups.map((g) => g.sourceItemId).sort((a, b) => a - b);
    assert.deepEqual(ids, [250, 254], "only the Jira anchor and the banner daily remain");
  });

  it("keeps only the on-topic quote when one source mixes topics", () => {
    const jira = source({
      id: 250,
      sourceType: "jira",
      sourceExternalId: "UATL-380",
      title: "UATL-380: DESIGN - Banner for Part Search",
      sourceDate: "2026-07-22T11:03:00.000Z",
      metadata: { status: "In Progress" },
    });
    // One meeting that discussed both the banner AND the confidence score.
    const meeting = source({
      id: 248,
      sourceType: "granola",
      title: "Milos & Lucas sync",
      sourceDate: "2026-07-22T14:22:00.000Z",
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "UATL-380 · Design Part Search Banner",
        status: "now",
        reason: "Design a unified search banner shown across every module.",
        nextAction: "Create 2-3 banner mockups for the unified search page.",
        evidence: [
          evidence({ id: 1, sourceItemId: 250, quote: "Banner for all modules" }),
          evidence({
            id: 2,
            sourceItemId: 248,
            quote: "Create 2-3 more banner mockups for the unified search page",
            sourceDate: "2026-07-22T14:22:00.000Z",
          }),
          evidence({
            id: 3,
            sourceItemId: 248,
            quote: "when I first saw the high 92% confidence score I thought it meant priority",
            sourceDate: "2026-07-22T14:22:00.000Z",
          }),
        ],
      },
      sourceById: new Map([
        [250, jira],
        [248, meeting],
      ]),
    });

    const meetingGroup = result.groups.find((g) => g.sourceItemId === 248)!;
    assert.deepEqual(
      meetingGroup.quotes.map((q) => q.text),
      ["Create 2-3 more banner mockups for the unified search page"],
      "the confidence-score line is dropped, the banner line stays"
    );
  });

  it("attaches the most action-relevant sentence per source as actionSnippet", () => {
    const daily = source({
      id: 254,
      sourceType: "granola",
      title: "Hydra Daily",
      sourceDate: "2026-07-22T14:22:00.000Z",
    });

    const result = buildTaskSupportingSources({
      task: {
        id: 487,
        title: "Design Part Search Banner",
        status: "now",
        reason: "The banner is needed across modules.",
        nextAction: "Create 2-3 banner mockups for the unified search page.",
        evidence: [
          evidence({
            id: 1,
            sourceItemId: 254,
            quote:
              "We chatted about the weather for a while. Create 2-3 more banner mockups for the unified search page. Lunch is at noon.",
            sourceDate: "2026-07-22T14:22:00.000Z",
          }),
        ],
      },
      sourceById: new Map([[254, daily]]),
    });

    const group = result.groups.find((g) => g.sourceItemId === 254)!;
    assert.equal(
      group.actionSnippet,
      "Create 2-3 more banner mockups for the unified search page.",
      "picks the sentence that describes the concrete work"
    );
  });
});

describe("pickActionSnippet", () => {
  const action = "Create 2-3 banner mockups for the unified search page.";

  it("returns null when there are no quotes", () => {
    assert.equal(pickActionSnippet([], action), null);
    assert.equal(pickActionSnippet(["   "], action), null);
  });

  it("selects the sentence with the highest task-domain overlap", () => {
    const snippet = pickActionSnippet(
      [
        "Nice to meet everyone today.",
        "We should create the banner mockups for the search page.",
        "See you next week.",
      ],
      action
    );
    assert.match(snippet ?? "", /banner mockups for the search page/i);
  });

  it("prefers imperative wording when domain overlap ties", () => {
    const snippet = pickActionSnippet(
      ["Some general background about the project.", "Please update the badge counter."],
      "Badge counter work"
    );
    assert.match(snippet ?? "", /update the badge counter/i);
  });

  it("clamps overly long sentences with an ellipsis", () => {
    const long = `Update ${"the navigation module ".repeat(20)}badge`;
    const snippet = pickActionSnippet([long], "Update navigation module badge");
    assert.ok((snippet?.length ?? 0) <= 181, "snippet is clamped");
    assert.match(snippet ?? "", /…$/);
  });

  it("falls back to the first sentence when nothing overlaps", () => {
    const snippet = pickActionSnippet(["A completely unrelated remark."], "xyzzy plugh");
    assert.equal(snippet, "A completely unrelated remark.");
  });
});
