"use client";

import Link from "next/link";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import {
  CONFIDENCE_EXPLANATION,
  confidenceBand,
  confidenceNeedsReview,
  formatConfidenceLabel,
} from "@/lib/tasks/confidencePresentation";

function toneForBand(band: ReturnType<typeof confidenceBand>): AppBadgeTone {
  switch (band) {
    case "high":
      return "good";
    case "medium":
      return "warning";
    case "low":
      return "danger";
    case "not_scored":
      return "neutral";
  }
}

/**
 * `level` is a 0..1 confidence score, as produced by extraction/classification jobs.
 *
 * `showExplanation` renders `CONFIDENCE_EXPLANATION` as visible caption text
 * instead of relying on the `title` attribute alone (task-detail-ux-audit
 * F10 — hover-only text is invisible on touch and unreachable by keyboard
 * focus). Off by default so existing compact usages (Today list, task
 * cards) are unaffected.
 */
export function ConfidenceBadge({
  level,
  reviewHref,
  showExplanation = false,
}: {
  level: number | null | undefined;
  reviewHref?: string | null;
  showExplanation?: boolean;
}) {
  const band = confidenceBand(level);
  const label = formatConfidenceLabel(level);
  const needsReview = confidenceNeedsReview(level);

  const badgeRow = (
    <div className="inline-flex flex-wrap items-center gap-2" title={CONFIDENCE_EXPLANATION}>
      <AppBadge tone={toneForBand(band)} className="px-2.5">
        {label}
      </AppBadge>
      {needsReview && reviewHref ? (
        <Link href={reviewHref} className="text-xs font-semibold text-accent-strong hover:underline">
          Review evidence
        </Link>
      ) : null}
      {showExplanation ? null : <span className="sr-only">{CONFIDENCE_EXPLANATION}</span>}
    </div>
  );

  if (!showExplanation) return badgeRow;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      {badgeRow}
      <p className="ft-task-caption text-muted-soft">{CONFIDENCE_EXPLANATION}</p>
    </div>
  );
}
