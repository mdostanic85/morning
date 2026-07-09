"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import type { WorkTaskStatus } from "@/domain/workTask";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";
import { TaskActionButtons } from "./TaskActionButtons";
import { TaskWorkContext } from "./TaskWorkContext";
import {
  LinkifiedText,
  referenceLinksNotInText,
  resolveJiraUrl,
} from "./LinkifiedText";

export interface DailyFocusData {
  title: string;
  reason: string;
  nextAction: string;
  actionSteps?: string[];
  referenceLinks?: { label: string; url: string }[];
  doneCriteria: string[];
  evidence: EvidenceItem[];
  linkedTaskId?: number | null;
  linkedJiraKey?: string | null;
  linkedJiraUrl?: string | null;
  priorityExplanation?: string;
  latestVerificationReport?: VerificationReport | null;
  latestSyncReviewReport?: SyncReviewReport | null;
  figmaFrameUrl?: string | null;
  localRepoPath?: string | null;
  githubRepo?: string | null;
  status?: WorkTaskStatus;
  projectName?: string | null;
  waitingOn?: string | null;
}

function buildActionBullets(item: DailyFocusData): string[] {
  if (item.actionSteps && item.actionSteps.length > 0) {
    return item.actionSteps;
  }
  const bullets = [item.nextAction.trim()].filter(Boolean);
  for (const criterion of item.doneCriteria) {
    const trimmed = criterion.trim();
    if (trimmed && !bullets.includes(trimmed)) {
      bullets.push(trimmed);
    }
  }
  return bullets;
}

function linkifyOptions(item: DailyFocusData) {
  return {
    referenceLinks: item.referenceLinks,
    jiraKey: item.linkedJiraKey,
    jiraUrl: resolveJiraUrl(item),
  };
}

function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <p className="eyebrow text-foreground/70">{title}</p>
      {children}
    </section>
  );
}

function OptionalDetailSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2.5 text-left transition-colors hover:bg-background/50"
          />
        }
      >
        <span className="eyebrow text-foreground/70">{title}</span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 text-muted-soft transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden pt-3 text-[14px] leading-relaxed text-muted">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExtraLinksList({ links }: { links: { label: string; url: string }[] }) {
  if (links.length === 0) return null;

  return (
    <ul className="space-y-2">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[14px] text-accent hover:underline"
          >
            {link.label}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

function FocusMetaLine({ item }: { item: DailyFocusData }) {
  const jiraUrl = resolveJiraUrl(item);
  const parts: (string | ReactNode)[] = [];

  if (item.status) parts.push(`Status: ${item.status}`);
  if (item.projectName) parts.push(`Project: ${item.projectName}`);
  if (item.linkedJiraKey) {
    parts.push(
      jiraUrl ? (
        <a
          key="jira"
          href={jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-accent hover:underline"
        >
          {item.linkedJiraKey}
        </a>
      ) : (
        <span key="jira" className="font-mono text-foreground">
          {item.linkedJiraKey}
        </span>
      )
    );
  }

  if (parts.length === 0) return null;

  return (
    <footer className="border-t border-border/60 pt-4 text-[13px] leading-relaxed text-muted">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <span className="text-muted-soft"> · </span> : null}
          {part}
        </span>
      ))}
    </footer>
  );
}

function FocusDetails({ item }: { item: DailyFocusData }) {
  const options = linkifyOptions(item);
  const bullets = buildActionBullets(item);
  const extraReferenceLinks = referenceLinksNotInText(bullets, item.referenceLinks);

  return (
    <div className="space-y-5">
      {item.waitingOn ? (
        <p className="rounded-xl border border-waiting/25 bg-waiting/8 px-4 py-3 text-[14px] font-medium text-waiting">
          Waiting on {item.waitingOn}
        </p>
      ) : null}

      <DetailSection title="Why today">
        <p className="text-[15px] leading-relaxed text-muted">
          <LinkifiedText text={item.reason} {...options} />
        </p>
      </DetailSection>

      {item.priorityExplanation ? (
        <OptionalDetailSection title="Why this order">
          <p>{item.priorityExplanation}</p>
        </OptionalDetailSection>
      ) : null}

      <DetailSection title="Sources">
        {item.evidence.length > 0 ? (
          <EvidencePanel items={item.evidence} defaultOpen={item.evidence.length <= 2} />
        ) : (
          <p className="text-[14px] leading-relaxed text-muted">
            Inferred from your open task queue and today&apos;s synced sources.
          </p>
        )}
      </DetailSection>

      {extraReferenceLinks.length > 0 ? (
        <DetailSection title="Links">
          <ExtraLinksList links={extraReferenceLinks} />
        </DetailSection>
      ) : null}

      <FocusMetaLine item={item} />
    </div>
  );
}

export function DailyFocusCard({ item }: { item: DailyFocusData }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bullets = buildActionBullets(item);
  const options = linkifyOptions(item);
  const jiraUrl = resolveJiraUrl(item);
  const extraReferenceLinks = referenceLinksNotInText(bullets, item.referenceLinks);

  return (
    <>
      <article className="rounded-surface border border-warm/30 bg-warm/5 p-5 sm:p-6">
        <p className="eyebrow text-warm">Start here</p>
        {item.linkedJiraKey ? (
          <p className="mt-2 font-mono text-sm">
            {jiraUrl ? (
              <a
                href={jiraUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {item.linkedJiraKey}
              </a>
            ) : (
              <span className="text-muted">{item.linkedJiraKey}</span>
            )}
          </p>
        ) : null}
        <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {item.title}
        </h3>

        <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="eyebrow text-accent">Next</p>
          <p className="mt-1.5 text-[15px] font-medium leading-relaxed">
            <LinkifiedText text={item.nextAction} {...options} />
          </p>
        </div>

        {item.doneCriteria.length > 0 ? (
          <div className="mt-5">
            <p className="eyebrow text-foreground/70">Done when</p>
            <ul className="mt-2 space-y-2">
              {item.doneCriteria.map((criterion) => (
                <li key={criterion} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted">
                  <span
                    className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-soft"
                    aria-hidden
                  />
                  <LinkifiedText text={criterion} {...options} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {item.actionSteps && item.actionSteps.length > 0 ? (
          <div className="mt-5">
            <p className="eyebrow text-foreground/70">Steps for today</p>
            <ol className="mt-2 space-y-2">
              {item.actionSteps.map((step, index) => (
                <li key={step} className="flex gap-3 text-[14px] leading-relaxed text-muted">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-soft">{index + 1}.</span>
                  <LinkifiedText text={step} {...options} />
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {extraReferenceLinks.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {extraReferenceLinks.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[14px] text-accent underline-offset-2 hover:underline"
                >
                  {link.label}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {item.linkedTaskId != null || item.linkedJiraKey ? (
          <div className="mt-6 border-t border-border/60 pt-5">
            <TaskActionButtons
              taskId={item.linkedTaskId}
              linkedJiraKey={item.linkedJiraKey}
              referenceLinks={item.referenceLinks}
              latestVerificationReport={item.latestVerificationReport ?? null}
              latestSyncReviewReport={item.latestSyncReviewReport ?? null}
              layout="focus"
              focusTaskSeed={{
                title: item.title,
                reason: item.reason,
                nextAction: item.nextAction,
                doneCriteria: item.doneCriteria,
              }}
              focusExtras={
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="h-11 w-full"
                  onClick={() => setDetailsOpen(true)}
                >
                  Why &amp; sources
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 border-t border-border/60 pt-5">
            <Button
              type="button"
              variant="outline"
              size="default"
              className="w-full"
              onClick={() => setDetailsOpen(true)}
            >
              Why &amp; sources
            </Button>
          </div>
        )}

        {item.linkedTaskId != null ? (
          <div className="mt-5">
            <TaskWorkContext
              taskId={item.linkedTaskId}
              figmaFrameUrl={item.figmaFrameUrl}
              localRepoPath={item.localRepoPath}
              githubRepo={item.githubRepo}
              latestSyncReviewReport={item.latestSyncReviewReport}
              referenceLinks={item.referenceLinks}
            />
          </div>
        ) : item.linkedJiraKey ? (
          <div className="mt-5">
            <TaskWorkContext
              taskId={null}
              linkedJiraKey={item.linkedJiraKey}
              figmaFrameUrl={item.figmaFrameUrl}
              referenceLinks={item.referenceLinks}
              latestSyncReviewReport={item.latestSyncReviewReport}
            />
          </div>
        ) : null}
      </article>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-display text-xl leading-snug">{item.title}</SheetTitle>
            <SheetDescription className="text-muted">
              {[item.linkedJiraKey, item.projectName, item.status]
                .filter(Boolean)
                .join(" · ") || "Background and sources"}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <FocusDetails item={item} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
