import Link from "next/link";
import { getProjects } from "@/services/projects";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/EmptyState";
import { ProjectsFilterSelect, type ProjectsFilter } from "@/components/ProjectsFilterSelect";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { countIssuesForProjectKeys, countJiraIssuesByProjectKey } from "@/lib/projects/jiraIssues";
import { getConnectionByProvider } from "@/services/connections";
import { isMcpTransport } from "@/lib/connectors/transport";

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
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Projects</h1>
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
              ? "No work contexts yet"
              : activeFilter === "all"
                ? "No work contexts"
                : activeFilter === "active"
                  ? "No active work contexts"
                  : "No inactive work contexts"
          }
          description={
            projects.length === 0
              ? "Sync Jira or another source to find the projects that should shape your brief."
              : activeFilter === "inactive"
                ? "Turn off a project with the switch to hide it from your active work."
                : "Sync my day to refresh work contexts from connected sources."
          }
          action={
            projects.length === 0 ? (
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/" className="link-btn-primary motion-btn">
                  Sync my day
                </Link>
                <Link href="/settings" className="link-btn-outline motion-btn">
                  Connect a source
                </Link>
              </div>
            ) : undefined
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
