import Link from "next/link";
import { getLatestDailyMemory } from "@/services/dailyMemories";
import { getTodayQueue } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { SyncMyDayButton } from "@/components/SyncMyDayButton";

export const dynamic = "force-dynamic";

export default async function TomorrowPage() {
  const [memory, queue, sourceItems] = await Promise.all([
    getLatestDailyMemory(),
    getTodayQueue(),
    getSourceItems(),
  ]);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const planned = queue.tomorrow[0] ?? queue.next[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Tomorrow</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            The first planned task from the latest end-of-day memory and current queue.
          </p>
        </div>
        <SyncMyDayButton sources={[]} lastSyncAt={null} />
      </div>

      {memory?.firstTomorrow ? (
        <section className="app-card p-6 sm:p-7">
          <h2 className="eyebrow">Planned first task</h2>
          <p className="mt-3 text-[15px] leading-relaxed">{memory.firstTomorrow}</p>
          <p className="mt-3 text-xs text-muted-soft">
            Saved {new Date(memory.createdAt).toLocaleString()}
          </p>
        </section>
      ) : null}

      {planned ? (
        <TaskCard
          id={planned.id}
          title={planned.title}
          reason={planned.reason}
          nextAction={planned.nextAction}
          doneCriteria={planned.doneCriteria}
          status={planned.status}
          priorityScore={planned.priorityScore}
          confidence={planned.confidence}
          waitingOn={planned.waitingOn}
          owner={planned.owner}
          dueDate={planned.dueDate}
          projectName={null}
          latestVerificationReport={planned.latestVerificationReport}
          figmaFrameUrl={planned.figmaFrameUrl}
          localRepoPath={planned.localRepoPath}
          githubRepo={planned.githubRepo}
          latestSyncReviewReport={planned.latestSyncReviewReport}
          evidence={planned.evidence.map((item) => {
            const source = sourceById.get(item.sourceItemId);
            return {
              id: item.id,
              quote: item.quote,
              summary: item.summary,
              sourceTitle: source?.title,
              sourceType: source?.sourceType,
              sourceUrl: source?.url ?? null,
              sourceDate: source?.sourceDate ?? null,
            };
          })}
        />
      ) : (
        <EmptyState
          title="Nothing planned for tomorrow"
          description="Move a task to Tomorrow from any task, or sync after your last update."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/" className="link-btn-outline motion-btn">
                Back to Today
              </Link>
            </div>
          }
        />
      )}

      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Back to Today
      </Link>
    </div>
  );
}
