import { Skeleton } from "@heroui/react/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-6 py-4" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-4 w-72 max-w-full rounded-full" />
      </div>
      <div className="rounded-[var(--radius)] border border-border bg-surface p-6">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="mt-4 h-24 w-full rounded-xl" />
        <Skeleton className="mt-3 h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
