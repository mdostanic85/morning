"use client";

import { useMemo, useState } from "react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { Button } from "@heroui/react/button";
import { Modal } from "@heroui/react/modal";
import { Tabs } from "@heroui/react/tabs";
import type { SourceType } from "@/domain/sourceItem";
import { SourceBadge } from "@/components/SourceBadge";
import { Heading } from "@/components/Heading";
import { priorityExplanationForDisplay } from "@/lib/tasks/priorityExplanation";
import { cn } from "@/lib/utils";
import styles from "./WhyThisButton.module.css";

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
  /** Visible label on the trigger. Defaults to “Why now”. */
  label?: string;
  className?: string;
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
  const recency = Number.isNaN(time) ? 0 : time / 1e12;
  return typeWeight + quoteBonus + recency;
}

/** Split a conclusion into a strong lead sentence + supporting remainder. */
function conclusionParts(raw: string): { lead: string; rest: string | null } {
  const cleaned = priorityExplanationForDisplay(raw).trim();
  if (!cleaned) {
    return {
      lead: "No priority explanation was recorded for this task. Open the Sources tab and confirm the requirement before acting.",
      rest: null,
    };
  }

  const sentences =
    cleaned.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ??
    [cleaned];

  if (sentences.length === 1) {
    return { lead: sentences[0], rest: null };
  }

  return {
    lead: sentences[0],
    rest: sentences.slice(1).join(" "),
  };
}

function sourceLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || "Open source";
  } catch {
    return "Open source";
  }
}

function SourceCard({
  item,
  rank,
}: {
  item: WhyThisEvidenceItem;
  rank: number;
}) {
  const quote = item.quote?.trim() || null;
  const summary = item.summary?.trim() || null;
  const url = item.url?.trim() || null;

  return (
    <li className={styles.sourceCard}>
      <span className={styles.sourceRank} aria-hidden>
        {rank}
      </span>

      <div className={styles.sourceBody}>
        <div className={styles.sourceMeta}>
          {item.sourceType ? <SourceBadge sourceType={item.sourceType} /> : null}
          <p className={styles.sourceTitle}>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={styles.sourceTitleLink}
              >
                {item.sourceTitle}
              </a>
            ) : (
              item.sourceTitle
            )}
          </p>
          <p className={styles.sourceDate}>{formatDate(item.sourceDate)}</p>
        </div>

        {quote ? (
          <blockquote className={styles.sourceQuote}>&ldquo;{quote}&rdquo;</blockquote>
        ) : summary ? (
          <p className={styles.sourceSummary}>{summary}</p>
        ) : (
          <p className={styles.sourceSummary}>This source is linked, but no excerpt was captured.</p>
        )}

        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
            {sourceLinkLabel(url)}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        ) : (
          <p className={styles.sourceMissingLink}>No link available for this source.</p>
        )}
      </div>
    </li>
  );
}

export function WhyThisButton({
  whyFirst,
  evidence,
  label = "Why now",
  className,
}: WhyThisButtonProps) {
  const [open, setOpen] = useState(false);

  const rankedSources = useMemo(
    () => [...evidence].sort((a, b) => evidenceScore(b) - evidenceScore(a)),
    [evidence]
  );

  const sourceCount = rankedSources.length;
  const { lead, rest } = useMemo(() => conclusionParts(whyFirst), [whyFirst]);
  const sourcesTabLabel = sourceCount === 1 ? "Sources (1)" : `Sources (${sourceCount})`;

  return (
    <>
      <Button
        type="button"
        size="md"
        variant="secondary"
        className={cn("shrink-0", className)}
        onPress={() => setOpen(true)}
      >
        {label}
      </Button>

      <Modal isOpen={open} onOpenChange={setOpen}>
        <Modal.Backdrop variant="blur" className="bg-background/75">
          <Modal.Container placement="center" size="lg" className="w-full max-w-none px-4">
            <Modal.Dialog
              aria-label="Why this is the current focus"
              className={styles.dialog}
            >
              <Modal.Header className={styles.header}>
                <div className={styles.headerCopy}>
                  <Modal.Heading className="sr-only">Why now</Modal.Heading>
                  <Heading level={2} visualLevel={4}>
                    Why now
                  </Heading>
                  <p slot="description" className={styles.headerIntro}>
                    Why this is today’s focus, and which source confirms it.
                  </p>
                </div>

                <Modal.CloseTrigger className={styles.close}>
                  <XIcon aria-hidden />
                  <span className="sr-only">Close</span>
                </Modal.CloseTrigger>
              </Modal.Header>

              <div className={styles.tabs}>
                <Tabs
                  defaultSelectedKey="priority"
                  variant="secondary"
                  className="flex min-h-0 w-full flex-1 flex-col gap-0"
                >
                  <Tabs.ListContainer className="w-full">
                    <Tabs.List
                      aria-label="Why now sections"
                      className={styles.tabList}
                    >
                      <Tabs.Tab id="priority" className={styles.tab}>
                        Priority
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="sources" className={styles.tab}>
                        {sourcesTabLabel}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>

                  <Tabs.Panel id="priority" className={styles.tabPanel}>
                    <div className={styles.panelStack}>
                      <p className={styles.sectionLead}>
                        Why the system chose this task as today’s focus.
                      </p>
                      <div className={styles.conclusion}>
                        <p className={styles.conclusionLabel}>Conclusion</p>
                        <p className={styles.conclusionLead}>{lead}</p>
                        {rest ? <p className={styles.conclusionRest}>{rest}</p> : null}
                      </div>
                    </div>
                  </Tabs.Panel>

                  <Tabs.Panel id="sources" className={styles.tabPanel}>
                    <div className={styles.panelStack}>
                      <p className={styles.sectionLead}>
                        Sources that establish this work exists — strongest first.
                      </p>

                      {sourceCount > 0 ? (
                        <ul className={styles.sourceList}>
                          {rankedSources.map((item, index) => (
                            <SourceCard
                              key={`${item.sourceTitle}-${item.sourceDate}-${index}`}
                              item={item}
                              rank={index + 1}
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.emptySources}>
                          No sources are attached yet. Sync again or open the task and confirm the
                          requirement before acting.
                        </p>
                      )}
                    </div>
                  </Tabs.Panel>
                </Tabs>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
