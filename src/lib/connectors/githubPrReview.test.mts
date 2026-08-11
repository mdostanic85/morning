import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPrReviewSection,
  summarizePrReviewState,
  type GitHubReviewSubmission,
} from "./githubPrReview";

const ME = "milos";
const REVIEWER = "lucas";

function review(overrides: Partial<GitHubReviewSubmission> = {}): GitHubReviewSubmission {
  return {
    user: { login: REVIEWER },
    state: "COMMENTED",
    body: null,
    submitted_at: "2026-08-10T09:00:00.000Z",
    ...overrides,
  };
}

function summarize(overrides: Partial<Parameters<typeof summarizePrReviewState>[0]> = {}) {
  return summarizePrReviewState({
    reviews: [],
    me: ME,
    prAuthor: ME,
    requestedReviewers: [],
    commitDates: ["2026-08-10T08:00:00.000Z"],
    failingCheckCount: 0,
    ...overrides,
  });
}

describe("GitHub PR review state", () => {
  it("reads CHANGES_REQUESTED as unaddressed work on my own PR", () => {
    const summary = summarize({
      reviews: [
        review({
          state: "CHANGES_REQUESTED",
          body: "Please split the migration out of this PR.",
        }),
      ],
    });

    assert.deepEqual(summary.changesRequestedBy, [REVIEWER]);
    assert.equal(summary.changesRequestedOutstanding, true);
    assert.equal(summary.actionState, "address_review_feedback");
    assert.equal(summary.needsMyAction, true);
    assert.match(summary.actionReason, /requested changes/);
    assert.equal(
      summary.latestByReviewer[0]?.body,
      "Please split the migration out of this PR."
    );
  });

  it("treats a commit after the block as addressed and back with the reviewer", () => {
    const summary = summarize({
      reviews: [review({ state: "CHANGES_REQUESTED" })],
      commitDates: ["2026-08-10T10:00:00.000Z"],
    });

    assert.equal(summary.changesRequestedOutstanding, false);
    assert.equal(summary.commitsAfterLatestReview, 1);
    assert.equal(summary.actionState, "awaiting_review");
    assert.equal(summary.needsMyAction, false);
  });

  it("keeps the newest decision per reviewer when they reviewed twice", () => {
    const summary = summarize({
      reviews: [
        review({ state: "CHANGES_REQUESTED", submitted_at: "2026-08-09T09:00:00.000Z" }),
        review({ state: "APPROVED", submitted_at: "2026-08-10T09:00:00.000Z" }),
      ],
    });

    assert.deepEqual(summary.approvedBy, [REVIEWER]);
    assert.deepEqual(summary.changesRequestedBy, []);
    assert.equal(summary.actionState, "ready_to_land");
    assert.equal(summary.needsMyAction, true);
  });

  it("never lets a later plain comment erase an approval", () => {
    const summary = summarize({
      reviews: [
        review({ state: "APPROVED", submitted_at: "2026-08-10T09:00:00.000Z" }),
        review({ state: "COMMENTED", submitted_at: "2026-08-10T11:00:00.000Z" }),
      ],
    });

    assert.deepEqual(summary.approvedBy, [REVIEWER]);
    assert.equal(summary.actionState, "ready_to_land");
  });

  it("puts failing checks ahead of an approval on my own PR", () => {
    const summary = summarize({
      reviews: [review({ state: "APPROVED" })],
      failingCheckCount: 2,
    });

    assert.equal(summary.actionState, "fix_failing_checks");
    assert.equal(summary.needsMyAction, true);
    assert.match(summary.actionReason, /2 check\(s\) are failing/);
  });

  it("puts review feedback ahead of failing checks", () => {
    const summary = summarize({
      reviews: [review({ state: "CHANGES_REQUESTED" })],
      failingCheckCount: 3,
    });

    assert.equal(summary.actionState, "address_review_feedback");
  });

  it("flags a review requested from me on someone else's PR", () => {
    const summary = summarize({
      prAuthor: REVIEWER,
      requestedReviewers: [ME],
      reviews: [],
    });

    assert.equal(summary.actionState, "review_requested_from_me");
    assert.equal(summary.myReviewPending, true);
    assert.equal(summary.needsMyAction, true);
  });

  it("flags new commits landing after I requested changes", () => {
    const summary = summarize({
      prAuthor: REVIEWER,
      requestedReviewers: [],
      reviews: [
        review({
          user: { login: ME },
          state: "CHANGES_REQUESTED",
          submitted_at: "2026-08-10T09:00:00.000Z",
        }),
      ],
      commitDates: ["2026-08-10T12:00:00.000Z"],
    });

    assert.equal(summary.myLatestReviewState, "changes_requested");
    assert.equal(summary.actionState, "re_review_after_changes");
    assert.equal(summary.needsMyAction, true);
  });

  it("asks for nothing when my review is already submitted and nothing changed", () => {
    const summary = summarize({
      prAuthor: REVIEWER,
      requestedReviewers: [],
      reviews: [review({ user: { login: ME }, state: "APPROVED" })],
      commitDates: ["2026-08-09T08:00:00.000Z"],
    });

    assert.equal(summary.actionState, "no_action_needed");
    assert.equal(summary.needsMyAction, false);
  });

  it("reports an unreviewed PR as awaiting review rather than needing action", () => {
    const summary = summarize();

    assert.equal(summary.actionState, "awaiting_review");
    assert.equal(summary.needsMyAction, false);
    assert.equal(summary.latestReviewAt, null);
  });

  it("ignores PENDING drafts and unknown states", () => {
    const summary = summarize({
      reviews: [
        review({ state: "PENDING" }),
        review({ user: { login: "bot" }, state: "SOMETHING_NEW" }),
      ],
    });

    assert.deepEqual(summary.latestByReviewer, []);
    assert.equal(summary.actionState, "awaiting_review");
  });

  it("treats a block with no timestamp as unaddressed", () => {
    const summary = summarize({
      reviews: [review({ state: "CHANGES_REQUESTED", submitted_at: null })],
      commitDates: ["2026-08-11T08:00:00.000Z"],
    });

    assert.equal(summary.changesRequestedOutstanding, true);
    assert.equal(summary.actionState, "address_review_feedback");
  });

  it("clamps a long review body instead of pasting the whole essay", () => {
    const summary = summarize({
      reviews: [review({ state: "CHANGES_REQUESTED", body: "x".repeat(2_000) })],
    });

    const body = summary.latestByReviewer[0]?.body ?? "";
    assert.ok(body.length < 2_000, "review body must be clamped");
    assert.ok(body.endsWith("…"), "clamped body must be marked as truncated");
  });

  it("matches logins case-insensitively", () => {
    const summary = summarize({
      prAuthor: "MiLoS",
      reviews: [review({ state: "CHANGES_REQUESTED" })],
    });

    assert.equal(summary.actionState, "address_review_feedback");
  });

  it("writes the review decision into quotable body lines", () => {
    const lines = formatPrReviewSection(
      summarize({
        reviews: [
          review({ state: "CHANGES_REQUESTED", body: "Rename the column first." }),
        ],
      })
    );
    const text = lines.join("\n");

    assert.match(text, /lucas: changes requested on 2026-08-10T09:00:00\.000Z/);
    assert.match(text, /Review comment: Rename the column first\./);
    assert.match(text, /Changes requested outstanding: yes/);
    assert.match(text, /Needs your action: yes/);
  });

  it("says so plainly when no review exists yet", () => {
    const text = formatPrReviewSection(summarize()).join("\n");

    assert.match(text, /No review submitted yet\./);
    assert.match(text, /Needs your action: no/);
  });
});
