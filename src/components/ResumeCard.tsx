import type { DailyMemory } from "@/domain/dailyMemory";
import type { WorkTaskWithEvidence } from "@/services/workTasks";

const STILL_OPEN_VISIBLE = 3;

export interface ResumeCardProps {
  memory: DailyMemory;
  focusTask?: WorkTaskWithEvidence | null;
  fallbackTask?: WorkTaskWithEvidence | null;
}

export function ResumeCard({ memory, focusTask, fallbackTask }: ResumeCardProps) {
  const hiddenStillOpen = memory.stillOpen.length - STILL_OPEN_VISIBLE;
  const isBlocked =
    focusTask?.status === "waiting" ||
    Boolean(focusTask?.waitingOn) ||
    (memory.waitingOn.length > 0 &&
      memory.firstTomorrow != null &&
      memory.waitingOn.some((item) =>
        item.toLowerCase().includes(memory.firstTomorrow!.toLowerCase().slice(0, 12))
      ));

  const actionableTask = isBlocked ? fallbackTask : focusTask ?? fallbackTask;

  return (
    <section className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">Resume from yesterday</h2>
        <span className="text-[13px] text-muted-soft">{memory.date}</span>
      </div>

      {isBlocked && memory.firstTomorrow ? (
        <div className="mt-4 rounded-surface border border-waiting/30 bg-waiting/5 p-5">
          <p className="eyebrow text-waiting">Blocked from yesterday</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug tracking-tight">
            {memory.firstTomorrow}
          </p>
          {memory.waitingOn.length > 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-waiting">
              Waiting on {memory.waitingOn.join("; ")}
            </p>
          ) : focusTask?.waitingOn ? (
            <p className="mt-2 text-sm leading-relaxed text-waiting">
              Waiting on {focusTask.waitingOn}
            </p>
          ) : null}
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            You can&apos;t move this forward until that clears. Pick something else below.
          </p>
        </div>
      ) : null}

      {actionableTask ? (
        <div
          className={`mt-4 rounded-surface border border-warm/30 bg-warm/5 p-5 ${
            isBlocked ? "" : ""
          }`}
        >
          <p className="eyebrow text-warm">
            {isBlocked ? "Do this while you wait" : "Start with"}
          </p>
          <p className="mt-2 text-[17px] font-semibold leading-snug tracking-tight">
            {actionableTask.title}
          </p>
          <div className="mt-4 rounded-xl border border-accent/20 bg-accent/8 px-4 py-3">
            <p className="eyebrow text-accent">What to do now</p>
            <p className="mt-2 text-[15px] font-medium leading-snug">{actionableTask.nextAction}</p>
          </div>
          {actionableTask.doneCriteria.length > 0 ? (
            <div className="mt-4">
              <p className="eyebrow">Done when</p>
              <ul className="mt-2 space-y-1.5">
                {actionableTask.doneCriteria.slice(0, 2).map((criterion) => (
                  <li key={criterion} className="text-[13px] leading-relaxed text-foreground/80">
                    {criterion}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : memory.firstTomorrow && !isBlocked ? (
        <div className="mt-4 rounded-surface border border-warm/30 bg-warm/5 p-5">
          <p className="eyebrow text-warm">Start with</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug tracking-tight">
            {memory.firstTomorrow}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Sync my day to refresh this with a concrete next step.
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-[13px] leading-relaxed text-muted-soft">{memory.summary}</p>

      {memory.stillOpen.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-soft">
            Also still open
          </p>
          <ul className="mt-1.5 space-y-1">
            {memory.stillOpen.slice(0, STILL_OPEN_VISIBLE).map((item) => (
              <li key={item} className="text-[13px] leading-relaxed text-foreground/70">
                {item}
              </li>
            ))}
          </ul>
          {hiddenStillOpen > 0 ? (
            <p className="mt-1 text-[13px] text-muted-soft">+{hiddenStillOpen} more</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
