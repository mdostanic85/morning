import { getProjects } from "@/services/projects";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Projects</h1>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet."
          description="Projects group tasks by context — they're created as tasks come in."
        />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              description={project.description}
              keywords={project.keywords}
              openTaskCount={project.openTaskCount}
            />
          ))}
        </div>
      )}
    </div>
  );
}
