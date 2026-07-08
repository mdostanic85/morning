import { getTodayQueue } from "@/services/workTasks";
import { getProjects } from "@/services/projects";
import { getSourceItems } from "@/services/sourceItems";
import { StatusColumn } from "@/components/StatusColumn";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import type { WorkTaskStatus } from "@/domain/workTask";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";

// Reads live from the local SQLite db on every request — this page must
// never be frozen as static build-time output.
export const dynamic = "force-dynamic";

const QUEUE_META: Record<
  Exclude<WorkTaskStatus, "done">,
  { title: string; description: string; emptyLabel: string }
> = {
  now: {
    title: "Now",
    description: "Do this first.",
    emptyLabel: "Nothing urgent right now.",
  },
  next: {
    title: "Next",
    description: "Up after Now.",
    emptyLabel: "Nothing queued up next.",
  },
  later: {
    title: "Later",
    description: "Not urgent, but on the radar.",
    emptyLabel: "Nothing sitting in Later.",
  },
  waiting: {
    title: "Waiting",
    description: "Blocked on someone or something else.",
    emptyLabel: "Nothing is blocked right now.",
  },
  tomorrow: {
    title: "Tomorrow",
    description: "Scheduled to start tomorrow.",
    emptyLabel: "Nothing scheduled for tomorrow.",
  },
  unclear: {
    title: "Unclear",
    description: "Ownership or the requirement itself needs resolving.",
    emptyLabel: "Nothing unresolved. Good.",
  },
};

export default async function TodayPage() {
  const [queue, projects, sourceItems] = await Promise.all([
    getTodayQueue(),
    getProjects(),
    getSourceItems(),
  ]);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const sourceTitleById = new Map(sourceItems.map((s) => [s.id, s.title]));

  const totalOpen = OPEN_QUEUE_STATUSES.reduce((sum, s) => sum + queue[s].length, 0);

  if (totalOpen === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <EmptyState
          title="No tasks yet."
          description="Paste a transcript in Inbox to generate your first queue."
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>
      {OPEN_QUEUE_STATUSES.map((s) => {
        const meta = QUEUE_META[s];
        const items = queue[s];
        return (
          <StatusColumn
            key={s}
            title={meta.title}
            description={meta.description}
            count={items.length}
            emptyLabel={meta.emptyLabel}
          >
            {items.map((task) => (
              <TaskCard
                key={task.id}
                title={task.title}
                reason={task.reason}
                nextAction={task.nextAction}
                doneCriteria={task.doneCriteria}
                status={task.status}
                confidence={task.confidence}
                waitingOn={task.waitingOn}
                owner={task.owner}
                dueDate={task.dueDate}
                projectName={task.projectId ? projectNameById.get(task.projectId) : null}
                evidence={task.evidence.map((e) => ({
                  id: e.id,
                  quote: e.quote,
                  summary: e.summary,
                  sourceTitle: sourceTitleById.get(e.sourceItemId),
                }))}
              />
            ))}
          </StatusColumn>
        );
      })}
    </div>
  );
}
