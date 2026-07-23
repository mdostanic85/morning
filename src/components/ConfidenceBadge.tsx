"use client";

import { Tooltip } from "@heroui/react/tooltip";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";

function bucket(value: number): { tone: AppBadgeTone } {
  if (value >= 0.7) return { tone: "good" };
  if (value >= 0.4) return { tone: "warning" };
  return { tone: "danger" };
}

/**
 * Extraction/source confidence — never place next to priority/status badges.
 * Keep the label about trust (“Source confidence”), not importance.
 */
export function ConfidenceBadge({ level }: { level: number }) {
  const { tone } = bucket(level);
  const percent = Math.round(level * 100);
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger>
        <AppBadge tone={tone} className="px-2.5">
          Source confidence {percent}%
        </AppBadge>
      </Tooltip.Trigger>
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
