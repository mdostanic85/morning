import { getProjects } from "@/services/projects";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/EmptyState";
import { ProjectsFilterSelect, type ProjectsFilter } from "@/components/ProjectsFilterSelect";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { countIssuesForProjectKeys, countJiraIssuesByProjectKey } from "@/lib/projects/jiraIssues";
import { getConnectionByProvider } from "@/services/connections";
import { isMcpTransport } from "@/lib/connectors/transport";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "active", "inactive"] as const;

function coerceFilter(value: string | undefined): ProjectsFilter {
  return FILTERS.includes(value as ProjectsFilter) ? (value as ProjectsFilter) : "all";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const activeFilter = coerceFilter(filter);

  const projects = await getProjects();
  const jiraConnection = await getConnectionByProvider("jira");
  const jiraMcp =
    jiraConnection?.status === "connected" && isMcpTransport(jiraConnection);

  const jiraCountsByKey = jiraMcp ? await countJiraIssuesByProjectKey() : new Map();

  const activeCount = projects.filter((project) => project.status === "active").length;
  const inactiveCount = projects.filter((project) => project.status === "inactive").length;

  const shownProjects = projects.filter((project) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "active") return project.status === "active";
    return project.status === "inactive";
  });

  return (
    <div className="space-y-8">
      <div>
        <SettingsBackLink section="Work contexts" />
        <Heading level={1} visualLevel={2} className="mt-2">Projects</Heading>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Jira boards and work contexts from your connected sources. Sync my day keeps these up to
          date.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectsFilterSelect
          activeFilter={activeFilter}
          counts={{
            all: projects.length,
            active: activeCount,
            inactive: inactiveCount,
          }}
        />
      </div>

      {shownProjects.length === 0 ? (
        <EmptyState
          title={
            projects.length === 0
              ? "No projects yet."
              : activeFilter === "all"
                ? "No projects."
                : activeFilter === "active"
                  ? "No active projects."
                  : "No inactive projects."
          }
          description={
            projects.length === 0
              ? "Run Sync my day. Projects come from Jira and your other connected sources."
              : activeFilter === "inactive"
                ? "Turn off a project with the switch to hide it from your active work."
                : "Sync my day to refresh projects from connected sources."
          }
        />
      ) : (
        <div className="space-y-3">
          {shownProjects.map((project) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              name={project.name}
              description={project.description}
              keywords={project.keywords}
              jiraKeys={project.jiraKeys}
              openTaskCount={project.openTaskCount}
              jiraIssueCount={countIssuesForProjectKeys(project.jiraKeys, jiraCountsByKey)}
              status={project.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
