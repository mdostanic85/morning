"use client";

import { useState } from "react";

export interface EvidenceItem {
  id: number;
  quote: string | null;
  summary: string;
  sourceTitle?: string;
}

interface EvidencePanelProps {
  items: EvidenceItem[];
}

/**
 * Evidence is never fully hidden — collapsed by default to keep task cards
 * scannable, but always present and one click away.
 */
export function EvidencePanel({ items }: EvidencePanelProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return <p className="text-[13px] text-[#9c2b2b]">No evidence recorded.</p>;
  }

  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
      >
        {open ? "Hide evidence" : `Evidence (${items.length})`}
      </button>
      {open ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="border-l-2 border-border pl-3">
              {item.quote ? (
                <p className="italic text-foreground/80">&ldquo;{item.quote}&rdquo;</p>
              ) : null}
              <p className={item.quote ? "text-muted mt-0.5" : "text-foreground/80"}>
                {item.summary}
              </p>
              {item.sourceTitle ? (
                <p className="text-muted mt-0.5">— {item.sourceTitle}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
