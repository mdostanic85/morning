/**
 * task-detail-ux-audit F3: "how do I know it's done" must be answerable on
 * the task detail page without opening the corrections page.
 *
 * A `VerificationReport` / `SyncReviewReport` does not store a structural
 * link from matches/missing (or ok/notOk) back to a specific done-criterion
 * index — those arrays are free-text lines written by the verify/sync jobs,
 * not per-criterion ids. Rather than inventing a new stored link (a schema
 * change out of scope here) or claiming a verdict we can't ground, this is a
 * conservative word-overlap heuristic in the same spirit as
 * `evidenceVerification.ts`'s lenient substring check: it only ever reports
 * "met" or "missing" when a report line shares most of the criterion's
 * significant words, and defaults to "not_checked" otherwise. Treat the
 * result as a hint, not as ground truth — the linked corrections page
 * always has the full report text.
 */

import { normalizeForMatch } from "./evidenceVerification";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";

export const CRITERION_VERDICTS = ["met", "missing", "not_checked"] as const;
export type CriterionVerdict = (typeof CRITERION_VERDICTS)[number];

export type CriterionCheckSource = "verification" | "sync_review" | null;

export interface CriterionCheckResult {
  verdict: CriterionVerdict;
  /** Free-text report line that drove the verdict, when any. */
  detail: string | null;
  source: CriterionCheckSource;
}

/** Below this many shared significant words, don't bother scoring — avoids matching on one common word. */
const MIN_SHARED_WORDS = 2;
/** Fraction of the criterion's significant words that must appear in a report line to call it a match. */
const MATCH_THRESHOLD = 0.6;

/** Common words filtered out so two lines don't "match" purely on function words like "the"/"and"/"with". */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "with", "in", "on", "at",
  "is", "are", "was", "were", "be", "been", "this", "that", "it", "its",
  "from", "as", "by", "into", "your", "our", "will", "should", "must", "not",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    normalizeForMatch(text)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
  );
}

function overlapRatio(criterionWords: Set<string>, candidateWords: Set<string>): number {
  if (criterionWords.size === 0) return 0;
  let shared = 0;
  for (const word of criterionWords) {
    if (candidateWords.has(word)) shared += 1;
  }
  if (shared < MIN_SHARED_WORDS) return 0;
  return shared / criterionWords.size;
}

function bestOverlapLine(
  criterionWords: Set<string>,
  candidateLines: string[]
): { score: number; line: string | null } {
  let bestScore = 0;
  let bestLine: string | null = null;
  for (const line of candidateLines) {
    const score = overlapRatio(criterionWords, significantWords(line));
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }
  return { score: bestScore, line: bestLine };
}

/** Explicit "Outcome N:" / "Outcome N -" prefix from sync/verify report lines. */
function lineForOutcomeIndex(lines: string[], index: number): string | null {
  const n = index + 1;
  const prefix = new RegExp(`^\\s*outcome\\s*${n}\\s*[:.\\-)–—]\\s*`, "i");
  return lines.find((line) => prefix.test(line)) ?? null;
}

function matchAgainstLines(
  doneCriteria: string[],
  metLines: string[],
  missingLines: string[],
  source: Exclude<CriterionCheckSource, null>
): CriterionCheckResult[] {
  return doneCriteria.map((criterion, index) => {
    const numberedMet = lineForOutcomeIndex(metLines, index);
    const numberedMissing = lineForOutcomeIndex(missingLines, index);
    if (numberedMet) {
      return { verdict: "met", detail: numberedMet, source };
    }
    if (numberedMissing) {
      return { verdict: "missing", detail: numberedMissing, source };
    }

    const criterionWords = significantWords(criterion);
    const met = bestOverlapLine(criterionWords, metLines);
    const missing = bestOverlapLine(criterionWords, missingLines);

    if (met.score >= MATCH_THRESHOLD && met.score >= missing.score) {
      return { verdict: "met", detail: met.line, source };
    }
    if (missing.score >= MATCH_THRESHOLD) {
      return { verdict: "missing", detail: missing.line, source };
    }
    return { verdict: "not_checked", detail: null, source: null };
  });
}

/**
 * Best-effort correlation between a task's done criteria and the latest
 * verification report's free-text `matches` / `missing` lines. Returns one
 * verdict per criterion, in the same order as `doneCriteria`.
 */
export function matchCriteriaToVerificationReport(
  doneCriteria: string[],
  report: Pick<VerificationReport, "matches" | "missing"> | null | undefined
): CriterionVerdict[] {
  return matchCriteriaToDeliveryChecks(doneCriteria, { verification: report }).map(
    (result) => result.verdict
  );
}

/**
 * Prefer the delivery verification report; fall back to sync-review ok/notOk
 * when verification has not classified a criterion. Returns one rich result
 * per done criterion (verdict + the report line that grounded it).
 */
export function matchCriteriaToDeliveryChecks(
  doneCriteria: string[],
  reports: {
    verification?: Pick<VerificationReport, "matches" | "missing"> | null;
    syncReview?: Pick<SyncReviewReport, "ok" | "notOk"> | null;
  }
): CriterionCheckResult[] {
  if (doneCriteria.length === 0) return [];

  const fromVerification = reports.verification
    ? matchAgainstLines(
        doneCriteria,
        reports.verification.matches,
        reports.verification.missing,
        "verification"
      )
    : doneCriteria.map(
        (): CriterionCheckResult => ({
          verdict: "not_checked",
          detail: null,
          source: null,
        })
      );

  if (!reports.syncReview) return fromVerification;

  const fromSync = matchAgainstLines(
    doneCriteria,
    reports.syncReview.ok,
    reports.syncReview.notOk,
    "sync_review"
  );

  return fromVerification.map((result, index) => {
    if (result.verdict !== "not_checked") return result;
    return fromSync[index] ?? result;
  });
}

export const CRITERION_VERDICT_LABEL: Record<CriterionVerdict, string> = {
  met: "Checked by sync",
  missing: "Still missing",
  not_checked: "Not checked yet",
};
