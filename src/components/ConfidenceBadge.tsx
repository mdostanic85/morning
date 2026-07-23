"use client";

import { Tooltip } from "@heroui/react/tooltip";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";

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
    <Tooltip delay={400}>
      <Tooltip.Trigger>{badge}</Tooltip.Trigger>
      <Tooltip.Content
        placement="top"
        showArrow
        className="max-w-xs bg-foreground px-3 py-1.5 text-sm text-background"
      >
        <Tooltip.Arrow />
        How sure the system is that this task was read correctly from the source — not how
        important it is. Low means review the evidence before acting.
      </Tooltip.Content>
    </Tooltip>
  );
}
