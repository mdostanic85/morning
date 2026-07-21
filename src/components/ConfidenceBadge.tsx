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

/** `level` is a 0..1 confidence score, as produced by extraction/classification jobs. */
export function ConfidenceBadge({
  level,
  reviewHref,
}: {
  level: number | null | undefined;
  reviewHref?: string | null;
}) {
  const band = confidenceBand(level);
  const label = formatConfidenceLabel(level);
  const needsReview = confidenceNeedsReview(level);

  return (
    <div className="inline-flex flex-wrap items-center gap-2" title={CONFIDENCE_EXPLANATION}>
      <AppBadge tone={toneForBand(band)} className="px-2.5">
        {label}
      </AppBadge>
      {needsReview && reviewHref ? (
        <Link href={reviewHref} className="text-xs font-semibold text-accent-strong hover:underline">
          Review evidence
        </Link>
      ) : null}
      <span className="sr-only">{CONFIDENCE_EXPLANATION}</span>
    </div>
  );
}
