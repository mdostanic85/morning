"use client";

import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";

function bucket(value: number): { tone: AppBadgeTone } {
  if (value >= 0.7) return { tone: "good" };
  if (value >= 0.4) return { tone: "warning" };
  return { tone: "danger" };
}

/**
 * Extraction/source confidence. Keep the label about trust
 * ("Source confidence"), not importance — never repurpose this badge to
 * signal priority.
 */
export function ConfidenceBadge({
  level,
  withTooltip = true,
}: {
  level: number;
  /** Set false in compact rows (e.g. Next up) that skip the trust explainer. */
  withTooltip?: boolean;
}) {
  const { tone } = bucket(level);
  const percent = Math.round(level * 100);
  const badge = (
    <AppBadge tone={tone} className="px-2.5">
      Source confidence {percent}%
    </AppBadge>
  );

  if (!withTooltip) return badge;

  return (
    <AppTooltip content="How well the sources back this task, not how important it is. Below 40%, read the evidence before acting.">
      {badge}
    </AppTooltip>
  );
}
