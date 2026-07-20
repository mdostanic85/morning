import type { JiraPendingSnapshot } from "@/lib/connectors/jiraPending";

interface JiraIssueListProps {
  issues: JiraPendingSnapshot[];
  emptyTitle?: string;
}

export function JiraIssueList({
  issues,
  emptyTitle = "No open Jira issues assigned to you in this project.",
}: JiraIssueListProps) {
  if (issues.length === 0) {
    return <p className="text-[14px] leading-relaxed text-muted">{emptyTitle}</p>;
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue) => (
        <li key={issue.key} className="app-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-2">
              {issue.url ? (
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[14px] text-accent hover:underline"
                >
                  {issue.key}
                </a>
              ) : (
                <span className="font-mono text-[14px] text-muted">{issue.key}</span>
              )}
              <span className="tag border-border bg-surface-soft text-muted">{issue.status}</span>
              {issue.priority ? (
                <span className="text-[14px] text-muted-soft">{issue.priority}</span>
              ) : null}
            </div>
            <span className="text-[14px] text-muted-soft">
              {new Date(issue.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-medium leading-snug">{issue.title}</h3>
          {issue.excerpt ? (
            <p className="mt-3 border-t border-border/60 pt-3 text-[14px] leading-relaxed text-muted">
              {issue.excerpt}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
