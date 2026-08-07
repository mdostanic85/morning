import { Skeleton } from "@heroui/react/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-10" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading page</span>
      <div className="flex items-center justify-between pb-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-52 rounded-full" />
          <Skeleton className="h-3 w-72 max-w-full rounded-full" />
        </div>
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="space-y-5">
          {/* Focus Card skeleton — mirrors the redesigned hierarchy */}
          <div className="rounded-[1.75rem] border border-border/60 bg-surface-raised p-7 sm:p-10">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="mt-4 h-10 w-4/5 max-w-xl rounded-xl" />
            <Skeleton className="mt-4 h-5 w-full max-w-lg rounded-lg" />
            <Skeleton className="mt-2 h-5 w-3/5 max-w-md rounded-lg" />
            <Skeleton className="mt-6 h-4 w-40 rounded-full" />
            <Skeleton className="mt-8 h-11 w-44 rounded-full" />
          </div>

          {/* Next up — same column width as focus */}
          <div className="space-y-3">
            <Skeleton className="h-3 w-16 rounded-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1rem] border border-border/60 bg-surface p-4">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="mt-3 h-5 w-4/5 rounded-lg" />
                <Skeleton className="mt-2 h-4 w-full rounded-lg" />
              </div>
              <div className="rounded-[1rem] border border-border/60 bg-surface p-4">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="mt-3 h-5 w-3/4 rounded-lg" />
                <Skeleton className="mt-2 h-4 w-5/6 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        {/* Meetings side column */}
        <div className="rounded-[1.4rem] border border-border/60 bg-surface p-7">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="mt-5 h-20 w-full rounded-xl" />
          <Skeleton className="mt-3 h-20 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
