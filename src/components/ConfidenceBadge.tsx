"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={cn("gap-1 font-medium cursor-default", className)}>
            {label} · {Math.round(level * 100)}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          How confident the AI is that this task was correctly extracted from the source. Low = needs your review.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
