"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import type { SourceType } from "@/domain/sourceItem";
import type { EvidenceItem } from "@/domain/evidenceItem";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SourceBadge } from "./SourceBadge";

export type { EvidenceItem } from "@/domain/evidenceItem";

interface EvidencePanelProps {
  items: EvidenceItem[];
  defaultOpen?: boolean;
}

function formatSourceDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hasConflictingSources(items: EvidenceItem[]): boolean {
  const dates = items
    .map((item) => item.sourceDate)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (dates.length < 2) return false;
  const unique = new Set(dates);
  return unique.size > 1;
}

export function EvidencePanel({ items, defaultOpen = false }: EvidencePanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sortedItems = [...items].sort((a, b) => {
    const aTime = a.sourceDate ? new Date(a.sourceDate).getTime() : 0;
    const bTime = b.sourceDate ? new Date(b.sourceDate).getTime() : 0;
    return bTime - aTime;
  });
  const showConflictNote = hasConflictingSources(sortedItems);

  if (items.length === 0) {
    return (
      <p className="text-sm font-medium text-danger">
        No evidence recorded — this task should not have been created.
      </p>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="text-sm">
      <CollapsibleTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="-ml-2" />
        }
        aria-label={`Toggle evidence (${items.length} items)`}
      >
        <ChevronDownIcon
          className={cn(
            "size-3 transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
        Sources ({items.length})
      </CollapsibleTrigger>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="evidence-list"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {showConflictNote ? (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Sources disagree — the latest dated source below is treated as current.
              </p>
            ) : null}
            <ul className="mt-3 space-y-2.5">
              {sortedItems.map((item, index) => {
                const formattedDate = formatSourceDate(item.sourceDate);
                const isLatest = index === 0 && sortedItems.length > 1;

                return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-border/70 bg-surface-soft/70 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
                      {isLatest ? (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-accent">
                          Latest
                        </span>
                      ) : null}
                      {formattedDate ? (
                        <span className="text-[11px] text-muted-soft">{formattedDate}</span>
                      ) : null}
                    </div>
                    {item.quote ? (
                      <blockquote className="mt-3 border-l-2 border-warm/50 pl-4 text-sm italic leading-relaxed text-foreground/85">
                        &ldquo;{item.quote}&rdquo;
                      </blockquote>
                    ) : null}
                    <p
                      className={cn(
                        "leading-relaxed",
                        item.quote ? "mt-2 text-muted" : "mt-3 text-foreground/80"
                      )}
                    >
                      {item.summary}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {item.sourceTitle ? (
                        <span className="text-xs text-muted-soft">{item.sourceTitle}</span>
                      ) : null}
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          Open source
                          <ExternalLinkIcon className="size-3" aria-hidden />
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Collapsible>
  );
}
