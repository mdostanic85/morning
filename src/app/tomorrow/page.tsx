import Link from "next/link";
import { getLatestDailyMemory } from "@/services/dailyMemories";
import { getTodayQueue } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

export default async function TomorrowPage() {
  const [memory, queue, sourceItems] = await Promise.all([
    getLatestDailyMemory(),
    getTodayQueue(),
    getSourceItems(),
  ]);
  const sourceById = new Map(sourceItems.map((source) => [source.id, source]));
  const planned = queue.tomorrow[0] ?? queue.next[0] ?? null;
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const savedPlanMatchesQueue =
    Boolean(memory?.firstTomorrow && planned) &&
    (normalize(memory!.firstTomorrow!).includes(normalize(planned!.title)) ||
      normalize(planned!.title).includes(normalize(memory!.firstTomorrow!)));
  const showSavedPlan =
    Boolean(memory?.firstTomorrow && planned) && savedPlanMatchesQueue;
  const savedPlanIsOutdated = Boolean(memory?.firstTomorrow) && !showSavedPlan;

  return (
    <div className="space-y-8">
      <div>
        <Heading level={1} visualLevel={2}>Tomorrow</Heading>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Your next planned task, based on the current queue.
        </p>
      </div>

      {showSavedPlan && memory?.firstTomorrow ? (
        <section className="app-card p-6 sm:p-7">
          <Heading level={2} visualLevel={6} className="eyebrow">Saved plan</Heading>
          <p className="mt-3 text-[15px] leading-relaxed">{memory.firstTomorrow}</p>
          <p className="mt-3 text-metadata text-muted-soft">
            Saved {new Date(memory.createdAt).toLocaleString()}
          </p>
        </section>
      ) : null}

      {savedPlanIsOutdated ? (
        <p className="rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm text-muted">
          The saved end-of-day plan is out of date. Worklight is showing the current queue.
        </p>
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
          title="No tomorrow task yet."
          description="Use End day on Today to generate a first task for tomorrow."
        />
      )}

      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← Back to Today
      </Link>
    </div>
  );
}
