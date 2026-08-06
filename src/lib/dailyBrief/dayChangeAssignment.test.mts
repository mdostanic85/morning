/**
 * Regression: "newly assigned" must be backed by assignment evidence.
 *
 * Jira's `updated` moves for any edit, so a comment on a ticket assigned
 * months ago used to produce a "newly assigned" dayChange banner — an
 * unevidenced claim on the one line of the brief the user reads first.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JiraPendingSnapshot } from "../connectors/jiraPending.ts";
import type { SourceItem } from "../../domain/sourceItem.ts";
import { isNewJiraAssignment } from "../tasks/claimAwareRanking.ts";
import { composeDailyBriefV2, type ComposerTask } from "./composer.ts";
import {
  assignmentEvidenceFromJiraChangelog,
  assignmentEvidenceFromObservedAssignees,
} from "../connectors/jiraAssignmentEvidence.ts";

const MY_NAME = "Milos Dostanic";
const TODAY = "2026-07-20";
const NOW_MS = Date.parse("2026-07-20T13:05:00.000Z");

/** Assigned to me back in May; commented on this morning. */
const OLD_ASSIGNMENT_CREATED_AT = "2026-05-04T09:30:00.000Z";
const COMMENTED_THIS_MORNING = "2026-07-20T12:40:00.000Z";

function jiraSource(overrides: Partial<SourceItem> = {}): SourceItem {
  return {
    id: 601,
    projectId: null,
    sourceType: "jira",
    sourceExternalId: "UATL-500",
    title: "UATL-500: Long-running design debt",
    body: [
      "Status: In Progress",
      "Priority: Medium",
      `Assignee: ${MY_NAME}`,
      "",
      "Comments:",
      `- Sofija (${COMMENTED_THIS_MORNING}): Bumping this, any update?`,
    ].join("\n"),
    author: null,
    sourceDate: COMMENTED_THIS_MORNING,
    url: "https://example.atlassian.net/browse/UATL-500",
    metadata: {
      key: "UATL-500",
      status: "In Progress",
      priority: "Medium",
      assignee: MY_NAME,
      statusCategoryKey: "indeterminate",
      created: OLD_ASSIGNMENT_CREATED_AT,
      updated: COMMENTED_THIS_MORNING,
    },
    contentHash: null,
    createdAt: OLD_ASSIGNMENT_CREATED_AT,
    updatedAt: null,
    ...overrides,
  };
}

function jiraPending(overrides: Partial<JiraPendingSnapshot> = {}): JiraPendingSnapshot {
  return {
    key: "UATL-500",
    title: "Long-running design debt",
    status: "In Progress",
    priority: "Medium",
    assignee: MY_NAME,
    dueDate: null,
    url: "https://example.atlassian.net/browse/UATL-500",
    updatedAt: COMMENTED_THIS_MORNING,
    createdAt: OLD_ASSIGNMENT_CREATED_AT,
    excerpt: `Assignee: ${MY_NAME}\nStatus: In Progress`,
    ...overrides,
  };
}

function task(overrides: Partial<ComposerTask> = {}): ComposerTask {
  return {
    id: 900,
    projectId: null,
    title: "UATL-500 · Long-running design debt",
    status: "later",
    reason: "Open Jira work assigned to me.",
    nextAction: "Pick the next debt item and size it.",
    doneCriteria: ["Next debt item is sized and linked from UATL-500."],
    priorityScore: null,
    confidence: 0.5,
    dueDate: null,
    owner: MY_NAME,
    waitingOn: null,
    statusManuallySet: false,
    evidence: [{ sourceItemId: 601, quote: "Bumping this", summary: "UATL-500 comment" }],
    ...overrides,
  };
}

describe("isNewJiraAssignment — requires assignment evidence", () => {
  it("a comment-only update on work I already owned is not a new assignment", () => {
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: COMMENTED_THIS_MORNING,
        today: TODAY,
        assignee: MY_NAME,
        myName: MY_NAME,
        issueCreatedAt: OLD_ASSIGNMENT_CREATED_AT,
        nowMs: NOW_MS,
      }),
      false
    );
  });

  it("freshness alone, with no evidence of any kind, is not a new assignment", () => {
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: COMMENTED_THIS_MORNING,
        today: TODAY,
        assignee: MY_NAME,
        myName: MY_NAME,
        nowMs: NOW_MS,
      }),
      false
    );
  });

  it("an issue filed and assigned to me inside the window is a new assignment", () => {
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: "2026-07-20T13:05:00.000Z",
        today: TODAY,
        assignee: MY_NAME,
        myName: MY_NAME,
        issueCreatedAt: "2026-07-20T12:55:00.000Z",
        nowMs: NOW_MS,
      }),
      true
    );
  });

  it("a recorded assignment time settles it either way", () => {
    const base = {
      jiraUpdatedAt: COMMENTED_THIS_MORNING,
      today: TODAY,
      assignee: MY_NAME,
      myName: MY_NAME,
      issueCreatedAt: OLD_ASSIGNMENT_CREATED_AT,
      nowMs: NOW_MS,
    };
    assert.equal(
      isNewJiraAssignment({ ...base, assignmentChangedAt: "2026-07-20T11:00:00.000Z" }),
      true,
      "reassigned to me this morning on an old ticket"
    );
    assert.equal(
      isNewJiraAssignment({ ...base, assignmentChangedAt: "2026-05-04T09:30:00.000Z" }),
      false,
      "assignment is months old however recently the ticket was touched"
    );
  });

  it("known assignee history distinguishes a handover from a bump", () => {
    const base = {
      jiraUpdatedAt: COMMENTED_THIS_MORNING,
      today: TODAY,
      assignee: MY_NAME,
      myName: MY_NAME,
      issueCreatedAt: OLD_ASSIGNMENT_CREATED_AT,
      nowMs: NOW_MS,
    };
    assert.equal(
      isNewJiraAssignment({ ...base, previousAssignee: "Sofija" }),
      true,
      "handed over to me"
    );
    assert.equal(
      isNewJiraAssignment({ ...base, previousAssignee: MY_NAME }),
      false,
      "already mine before this update"
    );
  });

  it("someone else's newly filed ticket is never my assignment", () => {
    assert.equal(
      isNewJiraAssignment({
        jiraUpdatedAt: "2026-07-20T13:05:00.000Z",
        today: TODAY,
        assignee: "Sofija",
        myName: MY_NAME,
        issueCreatedAt: "2026-07-20T12:55:00.000Z",
        nowMs: NOW_MS,
      }),
      false
    );
  });
});

describe("Jira assignment evidence producers", () => {
  it("extracts the latest changelog handover to the current assignee", () => {
    assert.deepEqual(
      assignmentEvidenceFromJiraChangelog(
        {
          histories: [
            {
              created: "2026-05-04T09:30:00.000Z",
              items: [{ field: "assignee", fromString: null, toString: "Sofija" }],
            },
            {
              created: "2026-07-20T11:00:00.000Z",
              items: [
                { field: "assignee", fromString: "Sofija", toString: MY_NAME },
                { field: "status", fromString: "To Do", toString: "In Progress" },
              ],
            },
          ],
        },
        MY_NAME
      ),
      {
        assignmentChangedAt: "2026-07-20T11:00:00.000Z",
        previousAssignee: "Sofija",
      }
    );
  });

  it("first-seen fallback records only an observed assignee change", () => {
    assert.deepEqual(
      assignmentEvidenceFromObservedAssignees({
        previousAssignee: "Sofija",
        currentAssignee: MY_NAME,
        observedAt: "2026-07-20T11:05:00.000Z",
      }),
      {
        assignmentChangedAt: "2026-07-20T11:05:00.000Z",
        previousAssignee: "Sofija",
      }
    );
    assert.equal(
      assignmentEvidenceFromObservedAssignees({
        previousAssignee: MY_NAME,
        currentAssignee: MY_NAME,
        observedAt: COMMENTED_THIS_MORNING,
      }),
      null
    );
  });
});

describe("composer dayChange — no unevidenced assignment banner", () => {
  it("does not announce a new assignment for a comment-only update", () => {
    const brief = composeDailyBriefV2({
      today: TODAY,
      tasks: [task()],
      sources: [jiraSource()],
      jiraPending: [jiraPending()],
      meetings: [],
      attendance: { myName: MY_NAME },
      myName: MY_NAME,
      nowMs: NOW_MS,
    });

    assert.equal(brief.dayChange, null);
  });

  it("still announces a ticket filed and assigned to me today", () => {
    const assignedToday = "2026-07-20T12:55:00.000Z";
    const brief = composeDailyBriefV2({
      today: TODAY,
      tasks: [task()],
      sources: [
        jiraSource({
          metadata: {
            key: "UATL-500",
            status: "To Do",
            assignee: MY_NAME,
            created: assignedToday,
            updated: "2026-07-20T13:00:00.000Z",
          },
        }),
      ],
      jiraPending: [
        jiraPending({
          status: "To Do",
          createdAt: assignedToday,
          updatedAt: "2026-07-20T13:00:00.000Z",
        }),
      ],
      meetings: [],
      attendance: { myName: MY_NAME },
      myName: MY_NAME,
      nowMs: NOW_MS,
    });

    assert.match(brief.dayChange?.text ?? "", /UATL-500 newly assigned/);
    assert.ok(
      (brief.dayChange?.evidenceIds.length ?? 0) > 0,
      "the banner must cite the Jira source it is claiming from"
    );
  });

  it("announces a fresh handover of an existing ticket", () => {
    const assignmentChangedAt = "2026-07-20T11:00:00.000Z";
    const brief = composeDailyBriefV2({
      today: TODAY,
      tasks: [task()],
      sources: [
        jiraSource({
          metadata: {
            key: "UATL-500",
            status: "In Progress",
            assignee: MY_NAME,
            created: OLD_ASSIGNMENT_CREATED_AT,
            updated: COMMENTED_THIS_MORNING,
            assignmentChangedAt,
            previousAssignee: "Sofija",
          },
        }),
      ],
      jiraPending: [
        jiraPending({
          assignmentChangedAt,
          previousAssignee: "Sofija",
        }),
      ],
      meetings: [],
      attendance: { myName: MY_NAME },
      myName: MY_NAME,
      nowMs: NOW_MS,
    });

    assert.match(brief.dayChange?.text ?? "", /UATL-500 newly assigned/);
    assert.deepEqual(brief.dayChange?.evidenceIds, [601]);
  });
});
