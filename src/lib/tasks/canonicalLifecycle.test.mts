import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  jiraCanonicalKey,
  parseJiraCanonicalKey,
  resolveCanonicalKeyForTask,
  isJiraDoneMetadata,
} from "./canonicalKey.ts";
import {
  planDuplicateJiraTaskMerge,
  planJiraDoneReconciliation,
} from "../imports/jiraDoneReconciliation.ts";
import {
  parseLinkedJiraRefs,
  resolveLinkedJiraEvidence,
} from "./linkedJiraRetrieval.ts";
import {
  claimAwareScoreAdjustment,
  isNewJiraAssignment,
} from "./claimAwareRanking.ts";
import { rankWorkTask, rankWorkTasks } from "./priorityRank.ts";
import type { SourceItem } from "../../domain/sourceItem.ts";

describe("canonicalKey", () => {
  it("builds and parses jira canonical keys", () => {
    const key = jiraCanonicalKey("UATL-376", "example.atlassian.net");
    assert.equal(key, "jira:example.atlassian.net:UATL-376");
    assert.deepEqual(parseJiraCanonicalKey(key), {
      site: "example.atlassian.net",
      issueKey: "UATL-376",
    });
  });

  it("resolves from title", () => {
    assert.equal(
      resolveCanonicalKeyForTask({ title: "UATL-376 · Promote Project Name" }),
      "jira:default:UATL-376"
    );
  });

  it("detects Done metadata", () => {
    assert.equal(isJiraDoneMetadata({ status: "Done", statusCategoryKey: "done" }), true);
    assert.equal(isJiraDoneMetadata({ status: "To Do" }), false);
  });
});

describe("jiraDoneReconciliation", () => {
  it("closes open task when Jira source is Done", () => {
    const actions = planJiraDoneReconciliation({
      tasks: [
        {
          id: 367,
          title: "Finish remaining Content File Manager Canvas screens",
          status: "now",
          statusManuallySet: false,
          canonicalKey: "jira:default:UATL-367",
          evidence: [{ sourceItemId: 502 }],
        },
      ],
      sources: [
        {
          id: 502,
          sourceType: "jira",
          sourceExternalId: "UATL-367",
          title: "UATL-367",
          metadata: { status: "Done", statusCategoryKey: "done" },
        },
      ],
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].taskId, 367);
  });

  it("closes a manually-pinned task when Jira source is Done", () => {
    // Regression: a manual queue pin is about ordering, not a dispute with
    // Jira's mechanical status — Done must still close the canonical item.
    const actions = planJiraDoneReconciliation({
      tasks: [
        {
          id: 367,
          title: "Finish remaining Content File Manager Canvas screens",
          status: "now",
          statusManuallySet: true,
          canonicalKey: "jira:default:UATL-367",
          evidence: [{ sourceItemId: 502 }],
        },
      ],
      sources: [
        {
          id: 502,
          sourceType: "jira",
          sourceExternalId: "UATL-367",
          title: "UATL-367",
          metadata: { status: "Done", statusCategoryKey: "done" },
        },
      ],
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].taskId, 367);
  });

  it("merges duplicate open UATL-376 tasks", () => {
    const plans = planDuplicateJiraTaskMerge({
      tasks: [
        {
          id: 430,
          title: "UATL-376 · Promote Project Name",
          status: "later",
          statusManuallySet: false,
          evidence: [],
        },
        {
          id: 432,
          title: "UATL-376 · Update Header",
          status: "later",
          statusManuallySet: false,
          evidence: [],
        },
      ],
    });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].canonicalTaskId, 430);
    assert.deepEqual(plans[0].duplicateTaskIds, [432]);
  });
});

describe("linkedJiraRetrieval", () => {
  it("parses CON-220 from UATL-376 body and marks missing content", () => {
    const refs = parseLinkedJiraRefs({
      text: "See CON-220 for scope: https://example.atlassian.net/browse/CON-220",
      parentIssueKey: "UATL-376",
    });
    assert.equal(refs[0]?.issueKey, "CON-220");
    const resolved = resolveLinkedJiraEvidence({
      refs,
      sources: [
        {
          id: 507,
          sourceType: "confluence",
          sourceExternalId: "CON-missing",
          body: "",
        },
      ],
    });
    assert.equal(resolved[0]?.status, "missing");
    if (resolved[0]?.status === "missing") {
      assert.match(resolved[0].missingEvidence, /CON-220/);
    }
  });
});

describe("claimAwareRanking", () => {
  it("boosts new assignment and demotes Done forceInclude", () => {
    const nowMs = Date.parse("2026-07-20T18:00:00.000Z");
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: "2026-07-20T13:05:00.000Z",
        today: "2026-07-20",
        assignee: "Milos Dostanic",
        myName: "Milos Dostanic",
        issueCreatedAt: "2026-07-20T12:55:00.000Z",
        nowMs,
      }),
      true
    );
    // Still "new" the next morning within the 72h window.
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: "2026-07-20T13:05:00.000Z",
        today: "2026-07-21",
        assignee: "Milos Dostanic",
        myName: "Milos Dostanic",
        issueCreatedAt: "2026-07-20T12:55:00.000Z",
        nowMs: Date.parse("2026-07-21T08:00:00.000Z"),
      }),
      true
    );
    const done = claimAwareScoreAdjustment({
      forceInclude: true,
      jiraStatus: "Done",
      newAssignment: false,
    });
    assert.equal(done.forceInclude, false);
    assert.ok(done.scoreDelta < 0);

    const assigned = claimAwareScoreAdjustment({
      forceInclude: false,
      jiraStatus: "To Do",
      newAssignment: true,
    });
    assert.ok(assigned.scoreDelta > 0);

    const freshOpen = claimAwareScoreAdjustment({
      forceInclude: false,
      jiraStatus: "To Do",
      newAssignment: false,
      freshOpenUpdate: true,
    });
    assert.ok(freshOpen.scoreDelta > 0);
    assert.ok(freshOpen.notes.some((note) => note.includes("Recently updated open Jira")));
  });
});

describe("priorityRank", () => {
  it("does not let a manual pin outrank a confirmed Jira Done task", () => {
    // Regression: statusManuallySet used to add +1000 unconditionally, which
    // beat the -900 Jira Done penalty and kept a completed task pinned at
    // the top ("Content File Manager" bug).
    const doneSource: SourceItem = {
      id: 502,
      projectId: null,
      sourceType: "jira",
      sourceExternalId: "UATL-367",
      title: "UATL-367",
      body: "",
      author: null,
      sourceDate: "2026-07-18T09:00:00.000Z",
      url: null,
      metadata: { status: "Done", statusCategoryKey: "done" },
      createdAt: "2026-07-18T09:00:00.000Z",
    };
    const sourceById = new Map<number, SourceItem>([[502, doneSource]]);

    const ranked = rankWorkTask(
      {
        id: 367,
        projectId: null,
        title: "Finish remaining Content File Manager Canvas screens",
        status: "now",
        reason: "Committed to finishing Canvas screens in the design sync.",
        nextAction: "Finish Canvas screens",
        doneCriteria: ["Canvas screens shipped"],
        priorityScore: null,
        dueDate: null,
        owner: null,
        waitingOn: null,
        statusManuallySet: true,
        evidence: [{ sourceItemId: 502, quote: null, summary: "UATL-367 Jira Done" }],
      },
      "2026-07-20",
      sourceById,
      new Map()
    );

    assert.ok(
      !ranked.explanation.some((line) => line.includes("You explicitly set its queue position"))
    );
    assert.ok(ranked.score < 100, `expected a demoted score, got ${ranked.score}`);
  });

  it("ranks freshly updated open Jira work above stale In Progress leftovers", () => {
    const freshAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const freshSource: SourceItem = {
      id: 801,
      projectId: 18,
      sourceType: "jira",
      sourceExternalId: "UATL-380",
      title: "UATL-380: DESIGN - Banner for Part Search",
      body: "Assignee: Milos Dostanic\nStatus: To Do",
      author: null,
      sourceDate: freshAt,
      url: null,
      metadata: {
        status: "To Do",
        assignee: "Milos Dostanic",
        updated: freshAt,
      },
      createdAt: freshAt,
    };
    const staleSource: SourceItem = {
      id: 802,
      projectId: 18,
      sourceType: "jira",
      sourceExternalId: "UATL-233",
      title: "UATL-233: Design Debt",
      body: "Assignee: Milos Dostanic\nStatus: In Progress",
      author: null,
      sourceDate: "2026-07-10T11:46:45.647Z",
      url: null,
      metadata: { status: "In Progress", assignee: "Milos Dostanic" },
      createdAt: "2026-07-10T11:46:45.647Z",
    };
    const sourceById = new Map<number, SourceItem>([
      [801, freshSource],
      [802, staleSource],
    ]);

    const ranked = rankWorkTasks(
      [
        {
          id: 468,
          projectId: 18,
          title: "Design Part Search Banner",
          status: "later",
          reason: "Draft concept images for each module.",
          nextAction: "Draft concept images",
          doneCriteria: ["Banner concepts ready"],
          priorityScore: null,
          dueDate: null,
          owner: "Milos Dostanic",
          waitingOn: null,
          statusManuallySet: false,
          evidence: [{ sourceItemId: 801, quote: null, summary: "UATL-380" }],
        },
        {
          id: 200,
          projectId: 18,
          title: "Chip away at design debt",
          status: "later",
          reason: "Long-running design debt ticket.",
          nextAction: "Pick next debt item",
          doneCriteria: ["Debt reduced"],
          priorityScore: null,
          dueDate: null,
          owner: "Milos Dostanic",
          waitingOn: null,
          statusManuallySet: false,
          evidence: [{ sourceItemId: 802, quote: null, summary: "UATL-233" }],
        },
      ],
      new Date().toISOString().slice(0, 10),
      sourceById,
      [
        {
          key: "UATL-380",
          title: "DESIGN - Banner for Part Search",
          status: "To Do",
          priority: "Medium",
          assignee: "Milos Dostanic",
          updatedAt: freshAt,
          createdAt: freshAt,
          dueDate: null,
          excerpt: "",
          url: null,
        },
        {
          key: "UATL-233",
          title: "Design Debt",
          status: "In Progress",
          priority: "Medium",
          assignee: "Milos Dostanic",
          updatedAt: staleSource.sourceDate,
          createdAt: "2026-05-02T09:00:00.000Z",
          dueDate: null,
          excerpt: "",
          url: null,
        },
      ],
      { myName: "Milos Dostanic" }
    );

    assert.equal(ranked[0]?.taskId, 468);
    assert.ok(
      ranked[0]?.explanation.some(
        (line) =>
          line.includes("New formal Jira assignment") ||
          line.includes("Recently updated open Jira") ||
          line.includes("Fresh signal")
      )
    );
    assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  });
});
