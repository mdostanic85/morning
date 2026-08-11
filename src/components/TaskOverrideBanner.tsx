import { AlertTriangle } from "lucide-react";
import { AppBadge } from "@/components/AppBadge";
import {
  TASK_OVERRIDE_FIELD_LABELS,
  latestCriticalOverride,
  type TaskOverrideRecord,
} from "@/lib/tasks/taskOverride";

/**
 * Critical override notice — what a newer meeting replaced on this task.
 *
 * A task can be silently rewritten by a meeting that outranks the sources it
 * was built from. This is the surface that makes that visible: which field
 * changed, what it used to say, and the verbatim line from the meeting that
 * caused it, so the user can see what changed and where it came from before
 * continuing from what they remember.
 */

function overrideDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function TaskOverrideBadge({
  overrides,
}: {
  overrides: readonly TaskOverrideRecord[] | null | undefined;
}) {
  const override = latestCriticalOverride(overrides);
  if (!override) return null;

  return (
    <AppBadge tone="danger" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
      Changed in a meeting
    </AppBadge>
  );
}

export function TaskOverrideBanner({
  overrides,
  className,
}: {
  overrides: readonly TaskOverrideRecord[] | null | undefined;
  className?: string;
}) {
  const override = latestCriticalOverride(overrides);
  if (!override) return null;

  const olderCount = (overrides?.length ?? 0) - 1;

  return (
    <section
      className={`rounded-[20px] border border-danger/25 bg-danger-soft-surface p-6 ${className ?? ""}`}
      aria-label="Task information overridden by a newer meeting"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AppBadge tone="danger" icon={<AlertTriangle className="size-3.5" aria-hidden />}>
          Critical
        </AppBadge>
        <strong className="text-sm font-semibold text-foreground">
          {TASK_OVERRIDE_FIELD_LABELS[override.field]} was overridden by a newer meeting
        </strong>
      </div>

      <p className="mt-3 text-metadata font-medium text-muted-soft">
        {override.sourceTitle} · {overrideDate(override.sourceDate)}
      </p>

      <dl className="mt-4 grid gap-3">
        <div>
          <dt className="text-metadata font-semibold uppercase tracking-[0.08em] text-muted-soft">
            Previously
          </dt>
          <dd className="mt-1 text-sm leading-relaxed text-muted line-through decoration-danger/40">
            {override.previousValue}
          </dd>
        </div>
        <div>
          <dt className="text-metadata font-semibold uppercase tracking-[0.08em] text-muted-soft">
            Now
          </dt>
          <dd className="mt-1 text-sm leading-relaxed text-foreground">{override.newValue}</dd>
        </div>
      </dl>

      <figure className="mt-4 border-l-2 border-danger/40 pl-3">
        <blockquote className="text-sm leading-relaxed text-foreground">
          “{override.quote}”
        </blockquote>
        <figcaption className="mt-1.5 text-metadata font-medium text-muted-soft">
          Said in {override.sourceTitle}
        </figcaption>
      </figure>

      {olderCount > 0 ? (
        <p className="mt-4 text-metadata font-medium text-muted-soft">
          {olderCount} earlier override{olderCount === 1 ? "" : "s"} recorded on this task.
        </p>
      ) : null}
    </section>
  );
}
