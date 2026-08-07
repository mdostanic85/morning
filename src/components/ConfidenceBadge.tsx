"use client";

import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";

function bucket(value: number): { tone: AppBadgeTone; strength: string } {
  if (value >= 0.7) return { tone: "good", strength: "Strong" };
  if (value >= 0.4) return { tone: "warning", strength: "Moderate" };
  return { tone: "danger", strength: "Weak" };
}

/**
 * Extraction/source confidence. Visible label is the bare percent; meaning
 * lives in the tooltip so the badge stays compact. Never repurpose this for
 * priority or importance.
 */
export function ConfidenceBadge({
  level,
  withTooltip = true,
}: {
  level: number;
  /** Prefer true when the badge shows only a bare percent. */
  withTooltip?: boolean;
}) {
  const { tone, strength } = bucket(level);
  const percent = Math.round(level * 100);
  const badge = (
    <AppBadge
      tone={tone}
      className="px-2.5 tabular-nums"
      aria-label={`Source confidence ${percent}%`}
    >
      {percent}%
    </AppBadge>
  );

  if (!withTooltip) return badge;

  return (
    <AppTooltip
      content={`${strength} source confidence. Based on how well the linked sources support this task — not how important it is. Below 40%, read the evidence before acting.`}
    >
      {badge}
    </AppTooltip>
  );
}
