import { cn } from "@/lib/utils";

const TERMINAL_LABELS: Record<string, string> = {
  completed: "Complete",
  partial: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const HYDRA_RUN_STEPS = [
  "queued",
  "fetching_sources",
  "normalizing",
  "ranking",
  "generating",
  "validating",
  "delivering",
] as const;

export function HydraRunStatus({ status, compact = false }: { status: string; compact?: boolean }) {
  const done = status === "completed";
  const partial = status === "partial";
  const failed = status === "failed";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[14px] font-semibold uppercase tracking-[0.08em]",
        done && "border-good/30 bg-good/10 text-good",
        partial && "border-waiting/30 bg-waiting/10 text-waiting",
        failed && "border-danger/30 bg-danger/10 text-danger",
        !done && !partial && !failed && "border-accent/25 bg-accent/8 text-accent"
      )}
    >
      <span className="relative flex size-1.5">
        {!TERMINAL_LABELS[status] ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" /> : null}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {compact ? TERMINAL_LABELS[status] ?? status.replaceAll("_", " ") : status.replaceAll("_", " ")}
    </span>
  );
}

export function HydraRunRail({ status }: { status: string }) {
  const activeIndex = HYDRA_RUN_STEPS.indexOf(status as (typeof HYDRA_RUN_STEPS)[number]);
  const terminal = ["completed", "partial"].includes(status);
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label={`Run status: ${status.replaceAll("_", " ")}`}>
      {HYDRA_RUN_STEPS.map((step, index) => {
        const reached = terminal || index <= activeIndex;
        return (
          <li key={step} className="min-w-0">
            <div className={cn("h-1 rounded-full", reached ? "bg-accent" : "bg-border")} />
            <span className={cn("mt-2 hidden truncate font-mono text-[14px] uppercase tracking-wide md:block", reached ? "text-foreground" : "text-muted-soft")}>
              {step.replaceAll("_", " ")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
