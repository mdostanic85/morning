"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Tabs } from "@heroui/react/tabs";
import { cn } from "@/lib/utils";

export type TaskOutcomeItem = {
  number: number;
  criterion: string;
  isDone: boolean;
  /** Sync report line when available. */
  detail: string | null;
  /** Where sync looked and which job reported it. */
  meta: string | null;
  evidenceQuote: string | null;
  evidenceUrl: string | null;
};

function stripOutcomePrefix(detail: string, number: number): string {
  return detail.replace(new RegExp(`^\\s*outcome\\s*${number}\\s*[:.\\-)–—]\\s*`, "i"), "");
}

function OutcomeCountBadge({
  tone,
  children,
}: {
  tone: "done" | "pending";
  children: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-metadata font-semibold tabular-nums leading-none",
        tone === "done"
          ? "bg-outcome-done-surface text-good"
          : "bg-outcome-pending-surface text-waiting"
      )}
    >
      {children}
    </span>
  );
}

function OutcomeAccordionCard({
  taskId,
  outcome,
  tone,
}: {
  taskId: number;
  outcome: TaskOutcomeItem;
  tone: "done" | "pending";
}) {
  const [open, setOpen] = useState(false);
  const syncLine = outcome.detail
    ? stripOutcomePrefix(outcome.detail, outcome.number)
    : null;
  const isDone = tone === "done";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border-l-[3px]",
        isDone
          ? "border-l-outcome-done-accent bg-outcome-done-surface"
          : "border-l-outcome-pending-accent bg-outcome-pending-surface"
      )}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-4 px-5 py-4 text-left"
        >
          <span
            className={cn(
              "min-w-0 flex-1 text-[15px] leading-snug [overflow-wrap:anywhere]",
              isDone ? "text-muted" : "font-semibold text-foreground"
            )}
          >
            {outcome.criterion}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-soft transition-transform duration-200",
              open && "rotate-180 text-accent-strong"
            )}
          />
        </button>
      </h3>

      {open ? (
        <div
          className={cn(
            "grid gap-3 border-t px-5 pb-4 pt-3",
            isDone ? "border-t-outcome-done-accent/25" : "border-t-outcome-pending-accent/25"
          )}
        >
          {syncLine ? (
            <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {syncLine}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Sync has not checked this outcome yet.
            </p>
          )}
          {outcome.meta ? (
            <p className="text-sm leading-relaxed text-muted">{outcome.meta}</p>
          ) : null}
          {outcome.evidenceQuote ? (
            <blockquote className="border-l-2 border-border-strong pl-3 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">
              “{outcome.evidenceQuote}”
            </blockquote>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={`/tasks/${taskId}/corrections/${outcome.number}`}
              className="text-sm font-semibold text-accent-strong hover:underline"
            >
              Open full instruction
            </Link>
            {outcome.evidenceUrl ? (
              <a
                href={outcome.evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent-strong hover:underline"
              >
                Open source <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeList({
  taskId,
  items,
  tone,
  emptyLabel,
}: {
  taskId: number;
  items: TaskOutcomeItem[];
  tone: "done" | "pending";
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-relaxed text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-2.5">
      {items.map((outcome) => (
        <OutcomeAccordionCard
          key={outcome.number}
          taskId={taskId}
          outcome={outcome}
          tone={tone}
        />
      ))}
    </div>
  );
}

export function TaskOutcomesPanel({
  taskId,
  outcomes,
}: {
  taskId: number;
  outcomes: TaskOutcomeItem[];
}) {
  const done = outcomes.filter((outcome) => outcome.isDone);
  const pending = outcomes.filter((outcome) => !outcome.isDone);
  const defaultTab = pending.length > 0 ? "pending" : "done";

  return (
    <Tabs defaultSelectedKey={defaultTab} className="mt-6 w-full gap-5">
      <Tabs.ListContainer className="w-full">
        <Tabs.List aria-label="Outcome status" className="grid w-full grid-cols-2 gap-1">
          <Tabs.Tab id="done" className="!h-11 !min-h-11 w-full min-w-0 gap-2">
            Done
            <OutcomeCountBadge tone="done">{done.length}</OutcomeCountBadge>
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="pending" className="!h-11 !min-h-11 w-full min-w-0 gap-2">
            Still to do
            <OutcomeCountBadge tone="pending">{pending.length}</OutcomeCountBadge>
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="done">
        <OutcomeList
          taskId={taskId}
          items={done}
          tone="done"
          emptyLabel="Nothing checked by sync yet."
        />
      </Tabs.Panel>

      <Tabs.Panel id="pending">
        <OutcomeList
          taskId={taskId}
          items={pending}
          tone="pending"
          emptyLabel="All outcomes are done."
        />
      </Tabs.Panel>
    </Tabs>
  );
}
