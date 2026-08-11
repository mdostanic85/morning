/**
 * Pull-request review state, derived deterministically from GitHub's review
 * submissions.
 *
 * The connector previously imported only issue comments and inline review
 * comments, so the review *decision* — CHANGES_REQUESTED / APPROVED /
 * COMMENTED — never reached Worklight at all. A PR whose reviewer had blocked
 * it read exactly like a PR nobody had looked at, which is the difference
 * between "waiting on review" and "you have to fix this before it can land".
 *
 * This module is intentionally pure and dependency-free: the connector fetches,
 * this decides, and the existing generic evidence/task pipeline consumes the
 * result through the source body and metadata. There is no GitHub-specific task
 * engine.
 */

export type PrReviewState =
  | "approved"
  | "changes_requested"
  | "commented"
  | "dismissed"
  | "pending";

/** Raw `GET /repos/{owner}/{repo}/pulls/{number}/reviews` entry (subset). */
export interface GitHubReviewSubmission {
  user?: { login?: string | null } | null;
  state?: string | null;
  body?: string | null;
  submitted_at?: string | null;
  html_url?: string | null;
}

export interface PrReviewByReviewer {
  reviewer: string;
  state: PrReviewState;
  submittedAt: string | null;
  /** The reviewer's own words on their newest decisive review — the actionable part. */
  body: string | null;
}

/**
 * Who currently holds the work. Ordered by what the user must do first, and
 * only ever derived from facts GitHub reported — never inferred from tone.
 */
export type PrActionState =
  | "address_review_feedback"
  | "fix_failing_checks"
  | "review_requested_from_me"
  | "re_review_after_changes"
  | "ready_to_land"
  | "awaiting_review"
  | "no_action_needed";

export interface PrReviewSummary {
  /** Newest review per reviewer (a reviewer who commented then approved counts as approved). */
  latestByReviewer: PrReviewByReviewer[];
  changesRequestedBy: string[];
  approvedBy: string[];
  commentedBy: string[];
  /** GitHub still lists the user as a requested reviewer. */
  myReviewPending: boolean;
  myLatestReviewState: PrReviewState | null;
  latestReviewAt: string | null;
  latestCommitAt: string | null;
  /** Commits pushed after the newest decisive review — the author already responded. */
  commitsAfterLatestReview: number;
  /** True when the newest CHANGES_REQUESTED review has had no commits since. */
  changesRequestedOutstanding: boolean;
  actionState: PrActionState;
  /** One factual sentence naming why this state was chosen. */
  actionReason: string;
  /** Whether the PR is waiting on the user right now. */
  needsMyAction: boolean;
}

/** Review bodies carry the actionable feedback; keep them bounded per review. */
export const MAX_REVIEW_BODY_CHARS = 600;
/** Newest reviews only — an old approval on a since-rewritten PR is noise. */
export const MAX_REVIEWS_REPORTED = 10;

function normalizeState(state: string | null | undefined): PrReviewState | null {
  switch ((state ?? "").trim().toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "COMMENTED":
      return "commented";
    case "DISMISSED":
      return "dismissed";
    case "PENDING":
      return "pending";
    default:
      return null;
  }
}

function submittedMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function clampBody(body: string | null | undefined): string | null {
  const trimmed = body?.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_REVIEW_BODY_CHARS
    ? `${trimmed.slice(0, MAX_REVIEW_BODY_CHARS)}…`
    : trimmed;
}

/**
 * A PENDING review has not been submitted, so it says nothing about the PR yet.
 * DISMISSED reviews are kept: they explain why an earlier block disappeared.
 */
function decisiveStates(state: PrReviewState): boolean {
  return state === "approved" || state === "changes_requested";
}

export function summarizePrReviewState(input: {
  reviews: GitHubReviewSubmission[];
  /** Login of the connected user. */
  me: string;
  prAuthor: string;
  /** Logins GitHub still lists under `requested_reviewers`. */
  requestedReviewers: string[];
  /** ISO timestamps of the PR's commits, in any order. */
  commitDates: (string | null | undefined)[];
  failingCheckCount: number;
}): PrReviewSummary {
  const authoredByMe = sameLogin(input.prAuthor, input.me);

  const newestByReviewer = new Map<string, PrReviewByReviewer>();
  for (const review of input.reviews) {
    const reviewer = review.user?.login?.trim();
    const state = normalizeState(review.state);
    if (!reviewer || !state || state === "pending") continue;

    const candidate: PrReviewByReviewer = {
      reviewer,
      state,
      submittedAt: review.submitted_at ?? null,
      body: clampBody(review.body),
    };
    const existing = newestByReviewer.get(reviewer.toLowerCase());
    // A plain COMMENTED review never overrides a decisive one from the same
    // reviewer at the same or earlier time — approval/block is the real state.
    if (existing) {
      const newer = submittedMs(candidate.submittedAt) >= submittedMs(existing.submittedAt);
      const upgrade = decisiveStates(candidate.state) || !decisiveStates(existing.state);
      if (!newer || !upgrade) continue;
    }
    newestByReviewer.set(reviewer.toLowerCase(), candidate);
  }

  const latestByReviewer = Array.from(newestByReviewer.values()).sort(
    (a, b) => submittedMs(b.submittedAt) - submittedMs(a.submittedAt)
  );

  const changesRequested = latestByReviewer.filter(
    (entry) => entry.state === "changes_requested"
  );
  const approved = latestByReviewer.filter((entry) => entry.state === "approved");
  const commented = latestByReviewer.filter((entry) => entry.state === "commented");

  const myReview = latestByReviewer.find((entry) => sameLogin(entry.reviewer, input.me)) ?? null;
  const myReviewPending = input.requestedReviewers.some((reviewer) =>
    sameLogin(reviewer, input.me)
  );

  const decisiveReviewAt = Math.max(
    0,
    ...latestByReviewer
      .filter((entry) => decisiveStates(entry.state))
      .map((entry) => submittedMs(entry.submittedAt))
  );
  const latestReviewMs = Math.max(
    0,
    ...latestByReviewer.map((entry) => submittedMs(entry.submittedAt))
  );
  const commitTimes = input.commitDates.map(submittedMs).filter((ms) => ms > 0);
  const latestCommitMs = commitTimes.length > 0 ? Math.max(...commitTimes) : 0;
  const commitsAfterLatestReview =
    decisiveReviewAt > 0
      ? commitTimes.filter((ms) => ms > decisiveReviewAt).length
      : 0;

  const newestChangesRequestedMs = Math.max(
    0,
    ...changesRequested.map((entry) => submittedMs(entry.submittedAt))
  );
  // Unaddressed only while no commit landed after the block. A missing
  // submitted_at date is treated as unaddressed rather than silently resolved.
  const changesRequestedOutstanding =
    changesRequested.length > 0 &&
    (newestChangesRequestedMs === 0 || latestCommitMs <= newestChangesRequestedMs);

  const reviewerList = (entries: PrReviewByReviewer[]) =>
    entries.map((entry) => entry.reviewer).join(", ");

  let actionState: PrActionState = "no_action_needed";
  let actionReason = "Nothing on this PR is waiting on you.";

  if (authoredByMe) {
    if (changesRequestedOutstanding) {
      actionState = "address_review_feedback";
      actionReason = `${reviewerList(changesRequested)} requested changes and no commit has landed since.`;
    } else if (input.failingCheckCount > 0) {
      actionState = "fix_failing_checks";
      actionReason = `${input.failingCheckCount} check(s) are failing on your PR.`;
    } else if (approved.length > 0 && changesRequested.length === 0) {
      actionState = "ready_to_land";
      actionReason = `${reviewerList(approved)} approved it and no check is failing.`;
    } else if (changesRequested.length > 0) {
      actionState = "awaiting_review";
      actionReason = `You pushed ${commitsAfterLatestReview} commit(s) after ${reviewerList(changesRequested)} requested changes; the re-review is outstanding.`;
    } else {
      actionState = "awaiting_review";
      actionReason =
        latestByReviewer.length === 0
          ? "No review has been submitted yet."
          : `Reviewed without a decision so far (${reviewerList(commented)}).`;
    }
  } else if (myReviewPending) {
    actionState = "review_requested_from_me";
    actionReason = myReview
      ? `A re-review is requested from you after your earlier ${myReview.state.replace("_", " ")} review.`
      : "A review is requested from you and you have not submitted one.";
  } else if (
    myReview?.state === "changes_requested" &&
    commitsAfterLatestReview > 0
  ) {
    actionState = "re_review_after_changes";
    actionReason = `${commitsAfterLatestReview} commit(s) landed after you requested changes.`;
  }

  const needsMyAction = actionState !== "no_action_needed" && actionState !== "awaiting_review";

  return {
    latestByReviewer: latestByReviewer.slice(0, MAX_REVIEWS_REPORTED),
    changesRequestedBy: changesRequested.map((entry) => entry.reviewer),
    approvedBy: approved.map((entry) => entry.reviewer),
    commentedBy: commented.map((entry) => entry.reviewer),
    myReviewPending,
    myLatestReviewState: myReview?.state ?? null,
    latestReviewAt:
      latestReviewMs > 0 ? new Date(latestReviewMs).toISOString() : null,
    latestCommitAt: latestCommitMs > 0 ? new Date(latestCommitMs).toISOString() : null,
    commitsAfterLatestReview,
    changesRequestedOutstanding,
    actionState,
    actionReason,
    needsMyAction,
  };
}

/**
 * The review section of the imported source body. Written as plain facts so the
 * generic extractor can quote it: the review decision, who made it, and their
 * own words are all evidence a task can cite.
 */
export function formatPrReviewSection(summary: PrReviewSummary): string[] {
  const lines: string[] = ["Review state:"];

  if (summary.latestByReviewer.length === 0) {
    lines.push("- No review submitted yet.");
  } else {
    for (const entry of summary.latestByReviewer) {
      const state = entry.state.replace(/_/g, " ");
      const when = entry.submittedAt ? ` on ${entry.submittedAt}` : "";
      lines.push(`- ${entry.reviewer}: ${state}${when}`);
      if (entry.body) lines.push(`  Review comment: ${entry.body}`);
    }
  }

  if (summary.commitsAfterLatestReview > 0) {
    lines.push(
      `- ${summary.commitsAfterLatestReview} commit(s) pushed after the newest review decision.`
    );
  }
  lines.push(
    `- Changes requested outstanding: ${summary.changesRequestedOutstanding ? "yes" : "no"}`
  );
  lines.push(`- Review requested from you: ${summary.myReviewPending ? "yes" : "no"}`);
  lines.push(`- Needs your action: ${summary.needsMyAction ? "yes" : "no"}`);
  lines.push(`- Why: ${summary.actionReason}`);

  return lines;
}
