"use client";

import { Tooltip } from "@heroui/react/tooltip";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";

function bucket(value: number): { label: string; tone: AppBadgeTone } {
  if (value >= 0.7) return { label: "High", tone: "good" };
  if (value >= 0.4) return { label: "Med", tone: "warning" };
  return { label: "Low", tone: "danger" };
}

/** `level` is a 0..1 confidence score, as produced by extraction/classification jobs. */
export function ConfidenceBadge({ level }: { level: number }) {
  const { label, tone } = bucket(level);
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger>
        <AppBadge tone={tone} className="px-2.5">
          {label} · {Math.round(level * 100)}%
        </AppBadge>
      </Tooltip.Trigger>
      <Tooltip.Content
        placement="top"
        showArrow
        className="max-w-xs bg-foreground px-3 py-1.5 text-sm text-background"
      >
        <Tooltip.Arrow />
        How confident the AI is that this task was correctly extracted from the source. Low = needs
        your review.
      </Tooltip.Content>
    </Tooltip>
  );
}
