import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

interface StatusColumnProps {
  title: string;
  description?: string;
  count: number;
  emptyLabel: string;
  children: ReactNode;
}

/**
 * A single queue section (Now/Next/Later/Waiting/Tomorrow/Unclear). Renders
 * as a plain vertical section rather than a kanban column — this is a daily
 * briefing, not a board.
 */
export function StatusColumn({
  title,
  description,
  count,
  emptyLabel,
  children,
}: StatusColumnProps) {
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="text-[12px] text-muted">{count}</span>
      </div>
      {description ? (
        <p className="text-[12px] text-muted mt-0.5">{description}</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {count === 0 ? <EmptyState title={emptyLabel} /> : children}
      </div>
    </section>
  );
}
