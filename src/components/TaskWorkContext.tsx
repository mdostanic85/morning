"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { parseFigmaUrl } from "@/lib/connectors/figmaUrl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHOW_WORK_CONTEXT = false;

interface BrowseEntry {
  name: string;
  path: string;
  kind: "directory";
  isGitRepo: boolean;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  isGitRepo: boolean;
  entries: BrowseEntry[];
}

interface TaskWorkContextProps {
  taskId?: number | null;
  linkedJiraKey?: string | null;
  figmaFrameUrl?: string | null;
  localRepoPath?: string | null;
  githubRepo?: string | null;
  latestSyncReviewReport?: SyncReviewReport | null;
  referenceLinks?: { label: string; url: string }[];
}

function figmaUrlFromLinks(
  figmaFrameUrl: string | null | undefined,
  referenceLinks: { label: string; url: string }[]
): string {
  if (figmaFrameUrl?.trim()) return figmaFrameUrl.trim();
  const fromLinks = referenceLinks.find(
    (link) => link.url.includes("figma.com") && parseFigmaUrl(link.url)?.nodeId
  );
  return fromLinks?.url ?? "";
}

export function TaskWorkContext({
  taskId = null,
  linkedJiraKey = null,
  figmaFrameUrl = null,
  localRepoPath = null,
  githubRepo = null,
  latestSyncReviewReport = null,
  referenceLinks = [],
}: TaskWorkContextProps) {
  const router = useRouter();
  const [figmaUrl, setFigmaUrl] = useState(() => figmaUrlFromLinks(figmaFrameUrl, referenceLinks));
  const [repoPath, setRepoPath] = useState(localRepoPath ?? "");
  const [github, setGithub] = useState(githubRepo ?? "");
  const [syncReviewReport, setSyncReviewReport] = useState<SyncReviewReport | null>(
    latestSyncReviewReport
  );
  const [pending, setPending] = useState<"save" | "sync" | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => {
    setFigmaUrl(figmaUrlFromLinks(figmaFrameUrl, referenceLinks));
    setRepoPath(localRepoPath ?? "");
    setGithub(githubRepo ?? "");
    setSyncReviewReport(latestSyncReviewReport);
  }, [figmaFrameUrl, localRepoPath, githubRepo, latestSyncReviewReport, referenceLinks]);

  const hasTask = taskId != null;
  const jiraKey = linkedJiraKey?.trim().toUpperCase() ?? null;

  async function saveContext() {
    if (!hasTask) return;
    setPending("save");
    try {
      const res = await fetch(`/api/work-tasks/${taskId}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaFrameUrl: figmaUrl,
          localRepoPath: repoPath,
          githubRepo: github,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save work context.");
      toast.success("Work links saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save work context.");
    } finally {
      setPending(null);
    }
  }

  async function syncContext() {
    setPending("sync");
    try {
      if (hasTask) {
        const saveRes = await fetch(`/api/work-tasks/${taskId}/context`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            figmaFrameUrl: figmaUrl,
            localRepoPath: repoPath,
            githubRepo: github,
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error ?? "Could not save work context.");
      }

      const syncUrl = hasTask
        ? `/api/work-tasks/${taskId}/sync-review`
        : jiraKey
          ? `/api/jira/${encodeURIComponent(jiraKey)}/sync-review`
          : null;
      if (!syncUrl) {
        throw new Error("Link a Jira issue or local task before syncing.");
      }

      const res = await fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaFrameUrl: figmaUrl.trim() || undefined,
          referenceLinks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not sync work context.");
      setSyncReviewReport(data.report ?? null);
      toast.success("Latest updates synced.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sync work context.");
    } finally {
      setPending(null);
    }
  }

  async function openBrowse(startPath?: string) {
    setBrowseOpen(true);
    setBrowseLoading(true);
    try {
      const query = startPath ? `?path=${encodeURIComponent(startPath)}` : "";
      const res = await fetch(`/api/local-path/browse${query}`);
      const data = (await res.json()) as BrowseResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not browse folders.");
      setBrowseData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not browse folders.");
      setBrowseOpen(false);
    } finally {
      setBrowseLoading(false);
    }
  }

  function selectBrowsePath(selectedPath: string) {
    setRepoPath(selectedPath);
    setBrowseOpen(false);
  }

  const hasLinks = Boolean(figmaUrl.trim() || repoPath.trim() || github.trim());
  const isLoading = pending !== null;

  // Temporarily hidden — flip to re-enable work-context UI.
  if (!SHOW_WORK_CONTEXT) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-surface-soft/40 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Where you are working</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Figma frame via MCP, local git folder, and/or GitHub repo. Review Status compares design
            and code against this task.
            {!hasTask && jiraKey ? " Sync my day to persist links on a local task." : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasTask ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => saveContext()}
              disabled={isLoading || !hasLinks}
            >
              {pending === "save" ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
              Save links
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => syncContext()} disabled={isLoading || !hasLinks}>
            {pending === "sync" ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
            Review Status
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-foreground">Figma frame link</span>
          <Input
            value={figmaUrl}
            onChange={(event) => setFigmaUrl(event.target.value)}
            placeholder="https://www.figma.com/design/...?node-id=..."
            className="mt-1.5 text-sm"
          />
        </label>

        {!hasTask ? (
          <p className="text-xs text-muted">
            Jira-only focus — add repo/GitHub links here for Review Status, or run Sync my day to
            attach a local task.
          </p>
        ) : null}

        <div>
          <span className="text-xs font-medium text-foreground">Local git repo</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Input
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="/Users/you/path/to/repo"
              className="min-w-[240px] flex-1 text-sm"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => openBrowse(repoPath || undefined)}>
              Browse
            </Button>
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-foreground">GitHub repository</span>
          <Input
            value={github}
            onChange={(event) => setGithub(event.target.value)}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="mt-1.5 text-sm"
          />
        </label>
      </div>

      {syncReviewReport ? <SyncReviewSummary report={syncReviewReport} /> : null}

      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose local repo folder</DialogTitle>
            <DialogDescription>
              Pick a folder on this machine. Git repos are marked below.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {browseLoading ? (
              <p className="px-4 py-6 text-sm text-muted">Loading folders…</p>
            ) : browseData ? (
              <div className="divide-y divide-border">
                {browseData.parent ? (
                  <button
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm text-muted hover:bg-surface-soft"
                    onClick={() => openBrowse(browseData.parent ?? undefined)}
                  >
                    .. {browseData.parent}
                  </button>
                ) : null}
                <div className="px-4 py-2 text-xs text-muted-soft">{browseData.path}</div>
                {browseData.entries.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">No subfolders here.</p>
                ) : (
                  browseData.entries.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-surface-soft"
                      onClick={() => {
                        if (entry.isGitRepo) {
                          selectBrowsePath(entry.path);
                        } else {
                          openBrowse(entry.path);
                        }
                      }}
                    >
                      <span>{entry.name}</span>
                      <span className="text-xs text-muted-soft">
                        {entry.isGitRepo ? "Use repo" : "Open"}
                      </span>
                    </button>
                  ))
                )}
                {browseData.isGitRepo ? (
                  <div className="border-t border-border px-4 py-3">
                    <Button type="button" size="sm" onClick={() => selectBrowsePath(browseData.path)}>
                      Use this folder
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setBrowseOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SyncReviewSummary({ report }: { report: SyncReviewReport }) {
  return (
    <section className="mt-4 space-y-4 rounded-xl border border-border/70 bg-background/40 p-4 text-sm">
      <div>
        <p className="eyebrow text-foreground/70">Latest sync</p>
        <p className="mt-2 leading-relaxed text-foreground">{report.summary}</p>
        {report.githubBranch || report.figmaUrl ? (
          <p className="mt-2 text-xs text-muted">
            {report.githubBranch ? `Branch: ${report.githubBranch}` : null}
            {report.githubBranch && report.figmaUrl ? " · " : null}
            {report.figmaUrl ? "Figma frame checked via MCP" : null}
          </p>
        ) : null}
      </div>
      {report.ok.length > 0 ? <ReportList title="OK" items={report.ok} /> : null}
      {report.notOk.length > 0 ? <ReportList title="Not OK" items={report.notOk} /> : null}
      {report.conflicts.length > 0 ? <ReportList title="Conflicts" items={report.conflicts} /> : null}
      {report.recommendedNextAction ? (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Recommended next action
          </p>
          <p className="leading-relaxed text-foreground">{report.recommendedNextAction}</p>
        </div>
      ) : null}
    </section>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 leading-relaxed">
            <span className="mt-0.5 select-none text-muted-soft">–</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
