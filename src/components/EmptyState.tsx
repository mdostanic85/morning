import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-surface border border-dashed border-border bg-surface-soft/30 text-sm",
        compact ? "px-4 py-3" : "px-6 py-10 text-center"
      )}
    >
      <p className={cn("text-foreground/80", compact ? "" : "font-medium")}>{title}</p>
      {description ? (
        <p className={cn("mt-1.5 text-[14px] leading-relaxed text-muted", !compact && "mx-auto max-w-sm")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
