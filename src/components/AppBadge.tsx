"use client";

import type { ReactNode } from "react";
import { Chip } from "@heroui/react/chip";
import { cn } from "@/lib/utils";

/**
 * Single app-wide badge primitive — always HeroUI Chip + `.tag` tokens.
 * Do not invent parallel badge/chip markup elsewhere.
 */
export type AppBadgeTone =
  | "default"
  | "accent"
  | "good"
  | "warning"
  | "danger"
  | "neutral"
  | "sky"
  | "mint"
  | "sun"
  | "pink";

const TONE_CLASS: Record<AppBadgeTone, string> = {
  default: "border-border bg-surface-soft text-muted",
  accent: "border-transparent bg-accent-soft-surface text-accent-strong",
  good: "border-good/40 bg-good/10 text-good",
  warning: "border-transparent bg-waiting-soft-surface text-waiting",
  danger: "border-transparent bg-danger-soft-surface text-danger",
  neutral: "border-border bg-surface-soft text-muted",
  sky: "border-sky/50 bg-sky-soft text-sky-foreground",
  mint: "border-mint/50 bg-mint-soft text-mint-foreground",
  sun: "border-sun/55 bg-sun-soft text-sun-foreground",
  pink: "border-pink/50 bg-pink-soft text-pink-foreground",
};

export function AppBadge({
  children,
  tone = "default",
  icon,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  tone?: AppBadgeTone;
  icon?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Chip
      variant="tertiary"
      color="default"
      aria-label={ariaLabel}
      className={cn(
        "tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border text-foreground transition-colors gap-1 font-medium cursor-default",
        TONE_CLASS[tone],
        className
      )}
    >
      {icon}
      {children}
    </Chip>
  );
}
