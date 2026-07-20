"use client";

import { ChevronDownIcon } from "lucide-react";
import { Button } from "@heroui/react/button";

const DECISION_FLOW: { title: string; description: string }[] = [
  {
    title: "Meeting transcript",
    description:
      "Newest Gemini/Granola/Drive transcript wins by date. If Matt or Lucas explicitly said it, that instruction still wins.",
  },
  {
    title: "Jira task state",
    description: "Assigned or mentioned tickets provide status, assignee, and operational history.",
  },
  {
    title: "PRD requirements",
    description: "Linked PRD pages define acceptance criteria and the intended outcome.",
  },
  {
    title: "Confluence baseline",
    description: "Selected project spaces supply the product context everything else sits on.",
  },
];

/**
 * "Why the AI decided this way" section: a quiet decision-flow summary next
 * to real source conflicts (only rendered when structured conflicts exist).
 */
export function DecisionTrail({
  conflicts,
  onOpenExplanation,
}: {
  conflicts: string[];
  onOpenExplanation: () => void;
}) {
  return (
    <section aria-labelledby="decision-trail-title" className="heading-host">
      <div>
        <h2 id="decision-trail-title" className="heading-accent font-display text-[26px] font-semibold tracking-[-0.035em]">
          Why the AI decided this way
        </h2>
        <p className="mt-2.5 text-sm text-muted">
          The reasoning matters, but it stays visually secondary to the work.
        </p>
      </div>

      <div className="mt-5 grid items-start gap-[2.375rem] lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]">
        <article className="focus-soft-gradient rounded-[22px] border border-border-strong p-7">
          <h3 className="font-display text-[22px] font-semibold tracking-tight">Decision trail</h3>
          <p className="mt-2 mb-5 text-sm text-muted">
            The AI weighs directness, authority, recency, and source relevance.
          </p>

          <div className="grid gap-3.5">
            {DECISION_FLOW.map((row, index) => (
              <div key={row.title} className="group grid grid-cols-[2.375rem_minmax(0,1fr)] items-start gap-3">
                <span className="chip-spring flex size-9 items-center justify-center rounded-xl border border-border-strong bg-surface-raised text-sm font-bold text-accent-strong">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <strong className="block text-[15px] font-semibold text-foreground">{row.title}</strong>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{row.description}</p>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            className="accent-soft-gradient mt-5 w-full border border-border-strong text-accent-strong"
            onClick={onOpenExplanation}
          >
            Open full AI explanation
          </Button>
        </article>

        <div className="space-y-2.5">
          {conflicts.length > 0 ? (
            conflicts.map((conflict, index) => (
              <details
                key={conflict}
                open={index === 0}
                className="group rounded-[14px] border border-border bg-surface/76 px-4"
              >
                <summary className="flex cursor-pointer list-none items-center gap-4 py-5 transition-[background-color,padding-left,color] duration-[280ms] hover:pl-2 hover:text-accent-strong">
                  <strong className="mr-auto text-[15px] font-semibold">
                    Source conflict {conflicts.length > 1 ? index + 1 : ""}
                  </strong>
                  <ChevronDownIcon
                    className="size-4 text-accent transition-transform duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="border-t border-border/60 pb-5 pt-4">
                  <p className="text-sm leading-relaxed text-muted">{conflict}</p>
                </div>
              </details>
            ))
          ) : (
            <div className="rounded-[14px] border border-border bg-surface/76 px-5 py-5">
              <strong className="text-[15px] font-semibold text-foreground">No known conflicts</strong>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                All synced sources currently agree about this task. New conflicts will appear here after a sync.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
