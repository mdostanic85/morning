import { notFound } from "next/navigation";
import Link from "next/link";
import { getProjectById } from "@/services/projects";
import { getOpenTasksForProject } from "@/services/workTasks";
import { getSourceItems, getSourceItemsForProject } from "@/services/sourceItems";
import { getKnowledgeItemsForProjectWithContext } from "@/services/knowledgeItems";
import { getVerificationReportsForProject } from "@/services/verificationReports";
import { TaskCard } from "@/components/TaskCard";
import { EmptyState } from "@/components/EmptyState";
import { SourceBadge } from "@/components/SourceBadge";
import { ProjectRepoPathsForm } from "@/components/ProjectRepoPathsForm";
import { ProjectIntegrationSettingsForm } from "@/components/ProjectIntegrationSettingsForm";
import type { KnowledgeItemType } from "@/domain/knowledgeItem";
import { KnowledgeItemCardList } from "@/components/KnowledgeItemCard";
import type { SourceItem } from "@/domain/sourceItem";
import type { VerificationReport } from "@/domain/verificationReport";
import { OPEN_QUEUE_STATUSES } from "@/domain/workTask";
import { fetchJiraIssuesForProject } from "@/lib/projects/jiraIssues";
import { JiraIssueList } from "@/components/JiraIssueList";
import type { WorkTaskWithEvidence } from "@/services/workTasks";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

const TABS = ["overview", "tasks", "sources", "knowledge", "verification"] as const;
type ProjectTab = (typeof TABS)[number];

const TAB_LABEL: Record<ProjectTab, string> = {
  overview: "Overview",
  tasks: "Tasks",
  sources: "Sources",
  knowledge: "Knowledge",
  verification: "Verification",
};

const KNOWLEDGE_GROUPS: { type: KnowledgeItemType; title: string }[] = [
  { type: "requirement", title: "Requirements" },
  { type: "decision", title: "Decisions" },
  { type: "open_question", title: "Open questions" },
  { type: "acceptance_criteria", title: "Acceptance criteria" },
  { type: "risk", title: "Risks" },
  { type: "stakeholder_preference", title: "Stakeholder preferences" },
];

function coerceTab(value: string | undefined): ProjectTab {
  return TABS.includes(value as ProjectTab) ? (value as ProjectTab) : "overview";
}

function preview(text: string, max = 220): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

function sourcePreview(source: SourceItem): string {
  if (source.sourceType !== "jira") return preview(source.body);
  const description = source.body.match(
    /\bDescription:\s*([\s\S]*?)(?:\bComments:\s*|$)/i
  )?.[1]?.trim();
  if (description && description !== "(empty)") return preview(description);
  return "Open the Jira issue for its latest details.";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function renderSourceList(items: SourceItem[], emptyTitle: string) {
  if (items.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="space-y-3">
      {items.map((source) => (
        <article key={source.id} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <Heading level={3} visualLevel={6} className="min-w-0 [overflow-wrap:anywhere]">
              {source.title}
            </Heading>
            {/* The badge keeps its intrinsic width; the title takes the rest. */}
            <div className="shrink-0">
              <SourceBadge sourceType={source.sourceType} />
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">{sourcePreview(source)}</p>
          <p className="mt-3 text-metadata text-muted-soft">{formatDate(source.sourceDate)}</p>
        </article>
      ))}
    </div>
  );
}

function renderVerificationList(
  reports: VerificationReport[],
  taskTitleById: Map<number, string>
) {
  if (reports.length === 0) return <EmptyState title="No verification reports yet." />;

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <article key={report.id} className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Heading level={3} visualLevel={6}>
                {taskTitleById.get(report.taskId) ?? `Task ${report.taskId}`}
              </Heading>
              <p className="mt-1 text-metadata capitalize text-muted">{report.verdict}</p>
            </div>
            {report.confidence != null ? (
              <span className="text-metadata tabular-nums text-muted">
                {Math.round(report.confidence * 100)}%
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {report.recommendedNextAction}
          </p>
          <p className="mt-3 text-metadata text-muted-soft">{formatDate(report.createdAt)}</p>
        </article>
      ))}
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const projectId = Number(id);
  const project = await getProjectById(projectId);

  if (!project) notFound();
  const currentProject = project;

  const [tasks, allSourceItems, linkedSourceItems, knowledgeItems, verificationReports, jiraIssues] =
    await Promise.all([
      getOpenTasksForProject(projectId),
      getSourceItems(),
      getSourceItemsForProject(projectId),
      getKnowledgeItemsForProjectWithContext(projectId),
      getVerificationReportsForProject(projectId),
      fetchJiraIssuesForProject(project.jiraKeys),
    ]);

  const activeTab = coerceTab(tab);
  const sourceById = new Map(allSourceItems.map((source) => [source.id, source]));
  const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]));
  const currentPriority = tasks[0]?.title ?? "No open task";
  const waitingCount = tasks.filter((task) => task.status === "waiting").length;
  const unclearCount = tasks.filter((task) => task.status === "unclear").length;

  function renderTask(task: WorkTaskWithEvidence) {
    return (
      <TaskCard
        key={task.id}
        headingLevel={3}
        id={task.id}
        title={task.title}
        reason={task.reason}
        nextAction={task.nextAction}
        doneCriteria={task.doneCriteria}
        status={task.status}
        priorityScore={task.priorityScore}
        confidence={task.confidence}
        waitingOn={task.waitingOn}
        owner={task.owner}
        dueDate={task.dueDate}
        projectName={currentProject.name}
        latestVerificationReport={task.latestVerificationReport}
        figmaFrameUrl={task.figmaFrameUrl}
        localRepoPath={task.localRepoPath}
        githubRepo={task.githubRepo}
        latestSyncReviewReport={task.latestSyncReviewReport}
        evidence={task.evidence.map((e) => {
          const source = sourceById.get(e.sourceItemId);
          return {
            id: e.id,
            quote: e.quote,
            summary: e.summary,
            sourceTitle: source?.title,
            sourceType: source?.sourceType,
            sourceUrl: source?.url ?? null,
            sourceDate: source?.sourceDate ?? null,
          };
        })}
      />
    );
  }

  function renderTasksTab() {
    const hasLocalTasks = tasks.length > 0;
    const hasJiraIssues = jiraIssues.length > 0;

    if (!hasLocalTasks && !hasJiraIssues) {
      return <EmptyState title="No open tasks for this project." />;
    }

    const statusesWithTasks = OPEN_QUEUE_STATUSES.filter((status) =>
      tasks.some((task) => task.status === status)
    );

    return (
      <div className="space-y-10">
        {hasJiraIssues ? (
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">
                Jira issues
                <span className="ml-2 font-normal tabular-nums text-muted-soft">
                  {jiraIssues.length}
                </span>
              </Heading>
              {currentProject.jiraKeys.length > 0 ? (
                <p className="text-metadata text-muted-soft">
                  {currentProject.jiraKeys.join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="mt-3">
              <JiraIssueList issues={jiraIssues} />
            </div>
          </section>
        ) : null}

        {hasLocalTasks ? (
          <section>
            {hasJiraIssues ? (
              <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">Worklight tasks</Heading>
            ) : null}
            <div className={hasJiraIssues ? "mt-3 space-y-8" : "space-y-8"}>
              {statusesWithTasks.map((status) => {
                const items = tasks.filter((task) => task.status === status);
                return (
                  <div
                    key={status}
                    className={
                      status === "unclear"
                        ? "rounded-2xl border border-unclear/30 bg-unclear/[0.04] p-4 sm:p-5"
                        : undefined
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <Heading
                        level={2}
                        visualLevel={6}
                        className={
                          status === "unclear"
                            ? "eyebrow text-unclear"
                            : "eyebrow text-foreground/70"
                        }
                      >
                        {status}
                        <span
                          className={
                            status === "unclear"
                              ? "ml-2 font-normal tabular-nums text-unclear/70"
                              : "ml-2 font-normal tabular-nums text-muted-soft"
                          }
                        >
                          {items.length}
                        </span>
                      </Heading>
                    </div>
                    <div className="mt-3 space-y-4">{items.map((task) => renderTask(task))}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderOverviewTab() {
    const counts = [
      `${tasks.length} open task${tasks.length === 1 ? "" : "s"}`,
      waitingCount > 0 ? `${waitingCount} waiting` : null,
      unclearCount > 0 ? `${unclearCount} unclear` : null,
    ].filter((part): part is string => part !== null);

    return (
      <div className="space-y-8">
        <section className="card p-5">
          <p className="eyebrow text-warm">Current priority</p>
          <p className="mt-2 text-base font-medium leading-snug tracking-tight">
            {currentPriority}
          </p>
          <p className="mt-2 text-sm text-muted">{counts.join(", ")}</p>
        </section>

        <section>
          <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">Latest source items</Heading>
          <div className="mt-3">
            {renderSourceList(linkedSourceItems.slice(0, 3), "No linked sources yet.")}
          </div>
        </section>

        <section>
          <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">Latest learnings from project sources</Heading>
          <div className="mt-3">
            <KnowledgeItemCardList
              items={knowledgeItems.slice(0, 3)}
              emptyTitle="No knowledge items yet."
              previewMax={160}
            />
          </div>
        </section>

        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-semibold tracking-tight">
            Project settings
            <span className="ml-2 text-metadata font-normal text-muted">
              repo paths and import hints
            </span>
          </summary>
          <div className="mt-5 space-y-4">
            <ProjectRepoPathsForm
              projectId={currentProject.id}
              initialRepoPaths={currentProject.repoPaths}
            />

            <ProjectIntegrationSettingsForm
              projectId={currentProject.id}
              initial={{
                jiraKeys: currentProject.jiraKeys,
                githubRepositories: currentProject.githubRepositories,
                confluenceSpaces: currentProject.confluenceSpaces,
                confluencePageUrls: currentProject.confluencePageUrls,
                discordChannels: currentProject.discordChannels,
                figmaFileKeys: currentProject.figmaFileKeys,
              }}
            />
          </div>
        </details>
      </div>
    );
  }

  function renderKnowledgeTab() {
    return (
      <div className="space-y-8">
        <p className="text-sm text-muted">
          Learnings from sources linked to this project. This is a filtered view of your shared
          knowledge, not a separate collection.
        </p>
        {KNOWLEDGE_GROUPS.map((group) => {
          const items = knowledgeItems.filter((item) => item.type === group.type);
          return (
            <section key={group.type}>
              <div className="flex items-baseline gap-2">
                <Heading level={2} visualLevel={6} className="eyebrow text-foreground/70">
                  {group.title}
                  <span className="ml-2 font-normal tabular-nums text-muted-soft">
                    {items.length}
                  </span>
                </Heading>
              </div>
              <div className="mt-3">
                <KnowledgeItemCardList
                  items={items}
                  emptyTitle={`No ${group.title.toLowerCase()} yet.`}
                />
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/projects" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
          ← Projects
        </Link>
        <Heading level={1} visualLevel={2} className="mt-3">
          {currentProject.name}
        </Heading>
        {currentProject.description ? (
          <p className="mt-3 text-base leading-relaxed text-muted">
            {currentProject.description}
          </p>
        ) : null}
        {currentProject.keywords.length > 0 ? (
          <p className="mt-2 text-sm text-muted-soft">
            {currentProject.keywords.join(" · ")}
          </p>
        ) : null}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Project sections">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`/projects/${currentProject.id}?tab=${item}`}
            aria-current={activeTab === item ? "page" : undefined}
            className={
              activeTab === item
                ? "inline-flex min-h-11 items-center rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-semibold text-foreground"
                : "inline-flex min-h-11 items-center rounded-lg border border-transparent px-4 py-2 text-sm text-muted hover:bg-surface-soft hover:text-foreground"
            }
          >
            {TAB_LABEL[item]}
          </Link>
        ))}
      </nav>

      {activeTab === "overview" ? renderOverviewTab() : null}
      {activeTab === "tasks" ? renderTasksTab() : null}
      {activeTab === "sources"
        ? renderSourceList(linkedSourceItems, "No source items linked to this project yet.")
        : null}
      {activeTab === "knowledge" ? renderKnowledgeTab() : null}
      {activeTab === "verification"
        ? renderVerificationList(verificationReports, taskTitleById)
        : null}
    </div>
  );
}
