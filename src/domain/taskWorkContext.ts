import type { FigmaFrameEvidence } from "@/lib/connectors/figma";
import type { GitHubRepoActivity } from "@/lib/connectors/github";
import type { LocalGitEvidence } from "@/lib/connectors/localGit";

export interface TaskWorkContextSnapshot {
  lastSyncedAt: string | null;
  summary: string | null;
  figma: {
    frameUrl: string | null;
    evidence: FigmaFrameEvidence | null;
    error: string | null;
  } | null;
  git: {
    repoPath: string | null;
    evidence: LocalGitEvidence | null;
    error: string | null;
  } | null;
  github: {
    repository: string | null;
    evidence: GitHubRepoActivity | null;
    error: string | null;
  } | null;
  syncErrors: string[];
}

export function emptyTaskWorkContextSnapshot(): TaskWorkContextSnapshot {
  return {
    lastSyncedAt: null,
    summary: null,
    figma: null,
    git: null,
    github: null,
    syncErrors: [],
  };
}
