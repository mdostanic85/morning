"use client";

import { cn } from "@/lib/utils";

interface ProjectStatusToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function ProjectStatusToggle({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: ProjectStatusToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-checked={checked ? "" : undefined}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border bg-surface-soft p-0.5 transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-checked:border-accent/40 data-checked:bg-accent/20"
      )}
    >
      <span
        aria-hidden
        className="block size-4 rounded-full bg-foreground shadow-sm transition-transform duration-200 ease-in-out translate-x-0 group-data-checked:translate-x-5"
      />
    </button>
  );
}
