import { notFound } from "next/navigation";
import Link from "next/link";
import { getProjectById } from "@/services/projects";
import { getOpenTasksForProject } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  const project = await getProjectById(projectId);

  if (!project) notFound();

  const [tasks, sourceItems] = await Promise.all([
    getOpenTasksForProject(projectId),
    getSourceItems(),
  ]);
  const sourceTitleById = new Map(sourceItems.map((s) => [s.id, s.title]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-[13px] text-muted hover:text-foreground">
          ← Projects
        </Link>
        <h1 className="text-xl font-semibold tracking-tight mt-2">{project.name}</h1>
        {project.description ? (
          <p className="text-[13px] text-muted mt-1">{project.description}</p>
        ) : null}
        {project.keywords.length > 0 ? (
          <p className="text-[12px] text-muted mt-1">{project.keywords.join(" · ")}</p>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No open tasks for this project." />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
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
              evidence={task.evidence.map((e) => ({
                id: e.id,
                quote: e.quote,
                summary: e.summary,
                sourceTitle: sourceTitleById.get(e.sourceItemId),
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
