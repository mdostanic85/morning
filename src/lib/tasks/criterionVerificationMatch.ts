/**
 * task-detail-ux-audit F3: "how do I know it's done" must be answerable on
 * the task detail page without opening the corrections page.
 *
 * A `VerificationReport` does not store a structural link from `matches` /
 * `missing` back to a specific done-criterion index — those arrays are
 * free-text lines written by the verify job, not per-criterion ids. Rather
 * than inventing a new stored link (a schema change out of scope here) or
 * claiming a verdict we can't ground, this is a conservative, purely
 * client-side word-overlap heuristic in the same spirit as
 * `evidenceVerification.ts`'s lenient substring check: it only ever reports
 * "met" or "missing" when a report line shares most of the criterion's
 * significant words, and defaults to "not_checked" otherwise. Treat the
 * result as a hint, not as ground truth — the linked corrections page
 * always has the full report text.
 */

import { normalizeForMatch } from "./evidenceVerification";
import type { VerificationReport } from "@/domain/verificationReport";

export const CRITERION_VERDICTS = ["met", "missing", "not_checked"] as const;
export type CriterionVerdict = (typeof CRITERION_VERDICTS)[number];

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

function bestOverlap(criterionWords: Set<string>, candidateLines: string[]): number {
  let best = 0;
  for (const line of candidateLines) {
    const score = overlapRatio(criterionWords, significantWords(line));
    if (score > best) best = score;
  }
  return best;
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
  if (!report) return doneCriteria.map(() => "not_checked");

  return doneCriteria.map((criterion) => {
    const criterionWords = significantWords(criterion);
    const metScore = bestOverlap(criterionWords, report.matches);
    const missingScore = bestOverlap(criterionWords, report.missing);

    if (metScore >= MATCH_THRESHOLD && metScore >= missingScore) return "met";
    if (missingScore >= MATCH_THRESHOLD) return "missing";
    return "not_checked";
  });
}

export const CRITERION_VERDICT_LABEL: Record<CriterionVerdict, string> = {
  met: "Met",
  missing: "Missing",
  not_checked: "Not checked",
};
