"use client";

import { useMemo, useState } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { Button } from "@heroui/react/button";
import { Drawer } from "@heroui/react/drawer";
import type { SourceType } from "@/domain/sourceItem";
import { SourceBadge } from "@/components/SourceBadge";

export interface WhyThisEvidenceItem {
  summary: string;
  quote: string | null;
  sourceDate: string;
  url: string | null;
  sourceTitle: string;
  sourceType: SourceType | null;
}

interface WhyThisButtonProps {
  whyFirst: string;
  evidence: WhyThisEvidenceItem[];
}

/** Higher = more decisive for “why this task is valid”. */
const SOURCE_WEIGHT: Partial<Record<SourceType, number>> = {
  jira: 100,
  granola: 90,
  gmail: 85,
  drive: 80,
  calendar: 75,
  manual_transcript: 70,
  confluence: 55,
  figma: 45,
  github: 35,
  git: 30,
  discord: 25,
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function evidenceScore(item: WhyThisEvidenceItem): number {
  const typeWeight = item.sourceType ? (SOURCE_WEIGHT[item.sourceType] ?? 10) : 10;
  const quoteBonus = item.quote?.trim() ? 40 : 0;
  const time = new Date(item.sourceDate).getTime();
  const recency = Number.isNaN(time) ? 0 : time / 1e12; // tiny tie-breaker, newest wins
  return typeWeight + quoteBonus + recency;
}

function EvidenceCard({
  item,
  rank,
}: {
  item: WhyThisEvidenceItem;
  rank?: number;
}) {
  const body = (item.quote?.trim() || item.summary).trim();
  const isQuote = Boolean(item.quote?.trim());

  return (
    <li className="rounded-[var(--radius)] border border-border bg-surface/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {rank != null ? (
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[11px] font-medium tabular-nums text-accent-strong">
            {rank}
          </span>
        ) : null}
        {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {item.sourceTitle}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-soft">{formatDate(item.sourceDate)}</p>

      {body ? (
        isQuote ? (
          <blockquote className="mt-3 border-l-2 border-accent/45 pl-3 text-sm leading-relaxed text-foreground/90">
            &ldquo;{body}&rdquo;
          </blockquote>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
        )
      ) : null}

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent underline-offset-2 hover:underline"
        >
          Open source
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

export function WhyThisButton({ whyFirst, evidence }: WhyThisButtonProps) {
  const [open, setOpen] = useState(false);

  const { primary, supporting } = useMemo(() => {
    const ranked = [...evidence].sort((a, b) => evidenceScore(b) - evidenceScore(a));
    if (ranked.length === 0) return { primary: [] as WhyThisEvidenceItem[], supporting: [] as WhyThisEvidenceItem[] };
    // Lead with the strongest 1–2; everything else is supporting.
    const splitAt = Math.min(2, ranked.length);
    return {
      primary: ranked.slice(0, splitAt),
      supporting: ranked.slice(splitAt),
    };
  }, [evidence]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="shrink-0 text-accent hover:bg-accent/10"
        onPress={() => setOpen(true)}
      >
        Why this
      </Button>

      <Drawer isOpen={open} onOpenChange={setOpen}>
        <Drawer.Backdrop variant="blur" className="bg-background/75">
          <Drawer.Content placement="right" className="w-full">
            <Drawer.Dialog
              aria-label="Why this task"
              className="relative flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-overlay pt-[env(safe-area-inset-top)] text-foreground outline-none sm:max-w-md"
            >
              <Drawer.Header className="sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border/70 bg-overlay/95 px-5 py-4 pr-14 backdrop-blur-xl">
                <Drawer.Heading className="text-lg font-medium tracking-tight">
                  Why this
                </Drawer.Heading>
                <p slot="description" className="text-sm text-muted">
                  Sources AI used — strongest first.
                </p>
              </Drawer.Header>

              <Drawer.Body className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {whyFirst ? (
                  <section>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                      AI conclusion
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">{whyFirst}</p>
                  </section>
                ) : null}

                {primary.length > 0 ? (
                  <section>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                      Most decisive
                    </p>
                    <ul className="mt-3 space-y-3">
                      {primary.map((item, index) => (
                        <EvidenceCard
                          key={`primary-${item.sourceTitle}-${item.sourceDate}-${index}`}
                          item={item}
                          rank={index + 1}
                        />
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="text-sm text-muted">No source quotes are attached to this task.</p>
                )}

                {supporting.length > 0 ? (
                  <section>
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-soft">
                      Also supporting
                    </p>
                    <ul className="mt-3 space-y-3">
                      {supporting.map((item, index) => (
                        <EvidenceCard
                          key={`support-${item.sourceTitle}-${item.sourceDate}-${index}`}
                          item={item}
                        />
                      ))}
                    </ul>
                  </section>
                ) : null}
              </Drawer.Body>

              <Drawer.CloseTrigger className="absolute top-3 right-3 size-9 rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground">
                <XIcon className="size-4" />
                <span className="sr-only">Close</span>
              </Drawer.CloseTrigger>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </>
  );
}
