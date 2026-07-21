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
import { rankWorkTask } from "./priorityRank.ts";
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
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: "2026-07-20T13:05:00.000Z",
        today: "2026-07-20",
        assignee: "Milos Dostanic",
        myName: "Milos Dostanic",
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
});
