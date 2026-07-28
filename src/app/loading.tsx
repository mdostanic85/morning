import { Skeleton } from "@heroui/react/skeleton";

export default function AppLoading() {
 return (
 <div className="space-y-10" role="status" aria-live="polite" aria-label="Loading page">
 <span className="sr-only">Loading page</span>
 <div className="flex items-center justify-between border-b border-border pb-6">
 <div className="space-y-2">
 <Skeleton className="h-5 w-52 rounded-full" />
 <Skeleton className="h-3 w-32 rounded-full" />
 </div>
 <Skeleton className="h-11 w-32 rounded-full" />
 </div>

 <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
 <div className="rounded-[1.75rem] border border-border bg-surface p-7 sm:p-10">
 <Skeleton className="h-6 w-36 rounded-full" />
 <Skeleton className="mt-6 h-14 w-4/5 rounded-xl" />
 <Skeleton className="mt-3 h-14 w-3/5 rounded-xl" />
 <Skeleton className="mt-8 h-28 w-full rounded-2xl" />
 <Skeleton className="mt-5 h-28 w-full rounded-2xl" />
 <div className="mt-6 flex gap-3">
 <Skeleton className="h-12 w-44 rounded-full" />
 <Skeleton className="h-12 w-36 rounded-full" />
 </div>
 </div>
 <div className="rounded-[1.4rem] border border-border bg-surface p-7">
 <Skeleton className="h-4 w-28 rounded-full" />
 <Skeleton className="mt-5 h-20 w-full rounded-xl" />
 <Skeleton className="mt-3 h-20 w-full rounded-xl" />
 <Skeleton className="mt-6 h-32 w-full rounded-xl" />
 </div>
 </div>

 <div className="rounded-[1.4rem] border border-border bg-surface p-7">
 <Skeleton className="h-6 w-48 rounded-full" />
 <div className="mt-6 grid gap-4 lg:grid-cols-2">
 <Skeleton className="h-52 w-full rounded-2xl" />
 <Skeleton className="h-52 w-full rounded-2xl" />
 </div>
 </div>
 </div>
 );
}
