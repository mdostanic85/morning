import "server-only";
import { getConnectionSecret } from "@/services/connectionSecrets";
import { getConnectionByProvider } from "@/services/connections";
import type { ConnectorSourceCandidate } from "./types";
import { fetchWithTimeout } from "@/lib/http";
import {
  formatPrReviewSection,
  summarizePrReviewState,
  type GitHubReviewSubmission,
} from "./githubPrReview";

interface GitHubUser {
  login: string;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  user: { login: string };
  head: { sha: string; ref: string };
  base: { ref: string };
  requested_reviewers?: { login: string }[];
}

interface GitHubComment {
  user?: { login: string };
  body?: string;
  created_at?: string;
  html_url?: string;
}

interface GitHubCommit {
  sha: string;
  commit?: { message?: string; author?: { date?: string; name?: string } };
  html_url?: string;
}

interface GitHubCheckRunsResponse {
  check_runs?: { name?: string; conclusion?: string | null; status?: string }[];
}

async function getToken(): Promise<string> {
  const secret = await getConnectionSecret("github");
  const token = secret?.accessToken ?? secret?.pat;
  if (!token) throw new Error("GitHub is not connected. Sign in under Settings → Connections.");
  return token;
}

async function githubFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const response = await fetchWithTimeout(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? `GitHub request failed for ${path}.`);
  return body;
}

export async function testGitHubConnection(): Promise<string> {
  const user = await githubFetch<GitHubUser>("/user");
  return user.login;
}

interface GitHubRepo {
  full_name: string;
  private: boolean;
  updated_at: string;
}

export interface GitHubRepositoryOption {
  fullName: string;
  private: boolean;
  updatedAt: string;
}

export async function listGitHubRepositories(): Promise<GitHubRepositoryOption[]> {
  const byName = new Map<string, GitHubRepositoryOption>();

  function addRepo(repo: GitHubRepo) {
    byName.set(repo.full_name, {
      fullName: repo.full_name,
      private: repo.private,
      updatedAt: repo.updated_at,
    });
  }

  async function fetchPages<T>(buildPath: (page: number) => string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await githubFetch<T[]>(buildPath(page));
      if (batch.length === 0) break;
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }

  for (const affiliation of ["owner", "collaborator", "organization_member"] as const) {
    const batch = await fetchPages<GitHubRepo>(
      (page) =>
        `/user/repos?per_page=100&sort=updated&affiliation=${affiliation}&page=${page}`
    );
    batch.forEach(addRepo);
  }

  const orgs = await fetchPages<{ login: string }>(
    (page) => `/user/orgs?per_page=100&page=${page}`
  );
  for (const org of orgs) {
    const orgRepos = await fetchPages<GitHubRepo>(
      (page) => `/orgs/${org.login}/repos?per_page=100&sort=updated&page=${page}`
    );
    orgRepos.forEach(addRepo);
  }

  return Array.from(byName.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

interface GitHubBranch {
  name: string;
}

export interface GitHubBranchOption {
  name: string;
  default: boolean;
}

export async function listGitHubBranches(repository: string): Promise<GitHubBranchOption[]> {
  const repo = parseGitHubRepo(repository);
  if (!repo) throw new Error("GitHub repository must look like owner/repo.");

  const [meta, branches] = await Promise.all([
    githubFetch<{ default_branch?: string }>(`/repos/${repo}`),
    githubFetch<GitHubBranch[]>(`/repos/${repo}/branches?per_page=100`),
  ]);
  const defaultBranch = meta.default_branch ?? null;
  return branches
    .map((branch) => ({
      name: branch.name,
      default: branch.name === defaultBranch,
    }))
    .sort((a, b) => {
      if (a.default) return -1;
      if (b.default) return 1;
      return a.name.localeCompare(b.name);
    });
}

export interface GitHubWorkContext {
  repository: string | null;
  branch: string | null;
}

export function parseGitHubWorkContext(
  metadata: Record<string, unknown> | null | undefined
): GitHubWorkContext {
  return {
    repository:
      typeof metadata?.workRepository === "string" ? metadata.workRepository.trim() || null : null,
    branch: typeof metadata?.workBranch === "string" ? metadata.workBranch.trim() || null : null,
  };
}

export async function githubRepositoriesForSync(projects: { githubRepositories: string[] }[]) {
  const fromProjects = projects.flatMap((project) => project.githubRepositories);
  const connection = await getConnectionByProvider("github");
  const { repository } = parseGitHubWorkContext(connection?.metadata);
  const values = repository ? [...fromProjects, repository] : fromProjects;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function parseGitHubRepo(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes("github.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export interface GitHubRepoActivity {
  repository: string;
  defaultBranch: string | null;
  openPullRequests: {
    number: number;
    title: string;
    url: string;
    author: string;
    updatedAt: string;
    headRef: string;
    baseRef: string;
  }[];
  recentCommits: {
    sha: string;
    message: string;
    date: string | null;
    url: string | null;
  }[];
}

export async function fetchGitHubRepoActivity(repository: string): Promise<GitHubRepoActivity> {
  const repo = parseGitHubRepo(repository);
  if (!repo) throw new Error("GitHub repository must look like owner/repo or a github.com URL.");

  const [meta, prs, commits] = await Promise.all([
    githubFetch<{ default_branch?: string }>(`/repos/${repo}`),
    githubFetch<GitHubPullRequest[]>(`/repos/${repo}/pulls?state=open&per_page=10`),
    githubFetch<GitHubCommit[]>(`/repos/${repo}/commits?per_page=8`),
  ]);

  return {
    repository: repo,
    defaultBranch: meta.default_branch ?? null,
    openPullRequests: prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user.login,
      updatedAt: pr.updated_at,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
    })),
    recentCommits: commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit?.message?.split("\n")[0] ?? "",
      date: commit.commit?.author?.date ?? null,
      url: commit.html_url ?? null,
    })),
  };
}

/**
 * Comment threads on a long-running PR are unbounded, and the whole thread ends
 * up in the source body that task/knowledge extraction reads. This pins the
 * page size GitHub currently defaults to, so the bound is explicit here rather
 * than inherited from an API default that could change. The review *decisions*
 * below are what carry the actionable feedback, and those are fetched in full.
 */
const MAX_PR_COMMENTS = 30;

async function fetchPrEvidence(repo: string, pr: GitHubPullRequest) {
  const comments = await githubFetch<GitHubComment[]>(
    `/repos/${repo}/issues/${pr.number}/comments?per_page=${MAX_PR_COMMENTS}`
  );
  const reviewComments = await githubFetch<GitHubComment[]>(
    `/repos/${repo}/pulls/${pr.number}/comments?per_page=${MAX_PR_COMMENTS}`
  );
  const commits = await githubFetch<GitHubCommit[]>(`/repos/${repo}/pulls/${pr.number}/commits`);
  // Review submissions carry the decision (CHANGES_REQUESTED / APPROVED /
  // COMMENTED) that inline comments alone never reveal. A repo that forbids
  // reading reviews must not lose the rest of the PR signal.
  let reviews: GitHubReviewSubmission[] = [];
  try {
    reviews = await githubFetch<GitHubReviewSubmission[]>(
      `/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`
    );
  } catch {
    reviews = [];
  }
  let checkRuns: GitHubCheckRunsResponse["check_runs"] = [];
  try {
    const checks = await githubFetch<GitHubCheckRunsResponse>(
      `/repos/${repo}/commits/${pr.head.sha}/check-runs`
    );
    checkRuns = checks.check_runs ?? [];
  } catch {
    checkRuns = [];
  }
  return {
    comments: comments.slice(-MAX_PR_COMMENTS),
    reviewComments: reviewComments.slice(-MAX_PR_COMMENTS),
    commits,
    reviews,
    checkRuns,
  };
}

export async function fetchGitHubPrSignalsForRepo(input: {
  repository: string;
  updatedSinceIso?: string;
}): Promise<ConnectorSourceCandidate[]> {
  const me = await testGitHubConnection();
  const repo = parseGitHubRepo(input.repository);
  if (!repo) throw new Error("GitHub repository must look like owner/repo or a github.com URL.");

  const prs = await githubFetch<GitHubPullRequest[]>(`/repos/${repo}/pulls?state=open&per_page=50`);
  const sinceMs = input.updatedSinceIso ? Date.parse(input.updatedSinceIso) : Number.NEGATIVE_INFINITY;
  const relevant = prs.filter((pr) => {
    const updatedMs = Date.parse(pr.updated_at);
    if (Number.isFinite(sinceMs) && Number.isFinite(updatedMs) && updatedMs < sinceMs) {
      return false;
    }
    if (pr.user.login === me) return true;
    return (pr.requested_reviewers ?? []).some((reviewer) => reviewer.login === me);
  });

  const candidates: ConnectorSourceCandidate[] = [];
  for (const pr of relevant) {
    const { comments, reviewComments, commits, reviews, checkRuns } = await fetchPrEvidence(
      repo,
      pr
    );
    const failingChecks = checkRuns.filter((check) =>
      ["failure", "timed_out", "cancelled", "action_required"].includes(check.conclusion ?? "")
    );
    const role = pr.user.login === me ? "authored_by_me" : "review_requested";
    const reviewSummary = summarizePrReviewState({
      reviews,
      me,
      prAuthor: pr.user.login,
      requestedReviewers: (pr.requested_reviewers ?? []).map((reviewer) => reviewer.login),
      commitDates: commits.map((commit) => commit.commit?.author?.date ?? null),
      failingCheckCount: failingChecks.length,
    });
    candidates.push({
      sourceType: "github",
      sourceExternalId: `${repo}#${pr.number}`,
      title: `${repo} PR #${pr.number}: ${pr.title}`,
      author: pr.user.login,
      sourceDate: pr.updated_at,
      url: pr.html_url,
      body: [
        `Repository: ${repo}`,
        `PR: #${pr.number}`,
        `Role: ${role}`,
        `Author: ${pr.user.login}`,
        `Branch: ${pr.head.ref} -> ${pr.base.ref}`,
        `Head SHA: ${pr.head.sha}`,
        `URL: ${pr.html_url}`,
        "",
        ...formatPrReviewSection(reviewSummary),
        "",
        "Description:",
        pr.body ?? "(empty)",
        "",
        "PR comments:",
        comments
          .map((comment) => `- ${comment.user?.login ?? "unknown"}: ${comment.body ?? ""}`)
          .join("\n") || "(none)",
        "",
        "Review comments:",
        reviewComments
          .map((comment) => `- ${comment.user?.login ?? "unknown"}: ${comment.body ?? ""}`)
          .join("\n") || "(none)",
        "",
        "Recent commits:",
        commits
          .slice(-5)
          .map(
            (commit) =>
              `- ${commit.sha.slice(0, 7)} ${commit.commit?.message?.split("\n")[0] ?? ""}`
          )
          .join("\n") || "(none)",
        "",
        "Failing checks:",
        failingChecks
          .map((check) => `- ${check.name ?? "unknown"}: ${check.conclusion ?? check.status ?? "unknown"}`)
          .join("\n") || "(none)",
      ].join("\n"),
      metadata: {
        repository: repo,
        prNumber: pr.number,
        role,
        reviewState: reviewSummary.actionState,
        reviewNeedsMyAction: reviewSummary.needsMyAction,
        changesRequestedBy: reviewSummary.changesRequestedBy,
        approvedBy: reviewSummary.approvedBy,
        changesRequestedOutstanding: reviewSummary.changesRequestedOutstanding,
        reviewRequestedFromMe: reviewSummary.myReviewPending,
        latestReviewAt: reviewSummary.latestReviewAt,
        commitsAfterLatestReview: reviewSummary.commitsAfterLatestReview,
        requestedReviewers: (pr.requested_reviewers ?? []).map((reviewer) => reviewer.login),
        recentCommits: commits.slice(-5).map((commit) => ({
          sha: commit.sha,
          message: commit.commit?.message ?? "",
          date: commit.commit?.author?.date ?? null,
        })),
        failingChecks,
      },
    });
  }
  return candidates;
}

export async function fetchGitHubPrSignals(input: {
  repositories: string[];
}): Promise<ConnectorSourceCandidate[]> {
  const candidates: ConnectorSourceCandidate[] = [];
  for (const repo of input.repositories.map((item) => item.trim()).filter(Boolean)) {
    candidates.push(...(await fetchGitHubPrSignalsForRepo({ repository: repo })));
  }
  return candidates;
}
