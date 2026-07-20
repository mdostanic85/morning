"use client";

import { Chip } from "@heroui/react/chip";
import { Tooltip } from "@heroui/react/tooltip";
import { cn } from "@/lib/utils";

function bucket(value: number): { label: string; className: string } {
  if (value >= 0.7)
    return {
      label: "High",
      className: "border-good/40 bg-good/10 text-good hover:bg-good/10",
    };
  if (value >= 0.4)
    return {
      label: "Med",
      className: "border-warm/40 bg-warm/10 text-warm hover:bg-warm/10",
    };
  return {
    label: "Low",
    className: "border-danger/40 bg-danger/10 text-danger hover:bg-danger/10",
  };
}

/** `level` is a 0..1 confidence score, as produced by extraction/classification jobs. */
export function ConfidenceBadge({ level }: { level: number }) {
  const { label, className } = bucket(level);
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger>
        <Chip
          variant="tertiary"
          color="default"
          className={cn(
            "tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border text-foreground transition-colors gap-1 font-medium cursor-default",
            className
          )}
        >
          {label} · {Math.round(level * 100)}%
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
        <Tooltip.Arrow />
        How confident the AI is that this task was correctly extracted from the source. Low = needs your review.
      </Tooltip.Content>
    </Tooltip>
  );
}
