import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LocalGitCommit {
  hash: string;
  date: string;
  subject: string;
}

export interface LocalGitChangedFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface LocalGitEvidence {
  repoPath: string;
  currentBranch: string | null;
  status: string;
  latestCommits: LocalGitCommit[];
  diffSummary: string;
  changedFiles: LocalGitChangedFile[];
  error?: string;
}

export interface LocalGitBranchEvidence {
  repoPath: string;
  targetBranch: string;
  baseBranch: string | null;
  branchExists: boolean;
  latestCommits: LocalGitCommit[];
  diffSummary: string;
  uiChangedFiles: string[];
  uiDiffExcerpt: string;
  visualNote: string;
  error?: string;
}

const UI_FILE_PATTERN = /\.(tsx|jsx|vue|svelte|css|scss|html|mdx)$/i;
const BASE_BRANCH_CANDIDATES = ["main", "master", "develop", "dev"];

async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    timeout: 8000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

function parseCommit(line: string): LocalGitCommit | null {
  const [hash, date, ...subjectParts] = line.split("\t");
  if (!hash || !date) return null;
  return {
    hash,
    date,
    subject: subjectParts.join("\t"),
  };
}

function parseChangedFiles(output: string, staged: boolean): LocalGitChangedFile[] {
  if (!output.trim()) return [];
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split(/\s+/);
      return {
        status,
        path: pathParts.join(" "),
        staged,
      };
    });
}

function uniqChangedFiles(files: LocalGitChangedFile[]): LocalGitChangedFile[] {
  const byKey = new Map<string, LocalGitChangedFile>();
  for (const file of files) {
    const key = `${file.staged ? "staged" : "unstaged"}:${file.status}:${file.path}`;
    byKey.set(key, file);
  }
  return Array.from(byKey.values());
}

export async function scanLocalGitRepo(repoPath: string): Promise<LocalGitEvidence> {
  try {
    const [
      currentBranch,
      status,
      latestCommitOutput,
      unstagedDiffSummary,
      stagedDiffSummary,
      unstagedChangedFiles,
      stagedChangedFiles,
    ] = await Promise.all([
      runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
      runGit(repoPath, ["status", "--short", "--branch"]),
      runGit(repoPath, ["log", "-n", "5", "--pretty=format:%h%x09%ad%x09%s", "--date=iso-strict"]),
      runGit(repoPath, ["diff", "--stat"]),
      runGit(repoPath, ["diff", "--cached", "--stat"]),
      runGit(repoPath, ["diff", "--name-status"]),
      runGit(repoPath, ["diff", "--cached", "--name-status"]),
    ]);

    const diffParts = [stagedDiffSummary, unstagedDiffSummary].filter(Boolean);
    return {
      repoPath,
      currentBranch,
      status,
      latestCommits: latestCommitOutput
        .split("\n")
        .map(parseCommit)
        .filter((commit): commit is LocalGitCommit => commit != null),
      diffSummary: diffParts.length > 0 ? diffParts.join("\n") : "No local diff.",
      changedFiles: uniqChangedFiles([
        ...parseChangedFiles(stagedChangedFiles, true),
        ...parseChangedFiles(unstagedChangedFiles, false),
      ]),
    };
  } catch (err) {
    return {
      repoPath,
      currentBranch: null,
      status: "",
      latestCommits: [],
      diffSummary: "",
      changedFiles: [],
      error: err instanceof Error ? err.message : "Could not read git repository.",
    };
  }
}

export async function scanLocalGitRepos(repoPaths: string[]): Promise<LocalGitEvidence[]> {
  const uniquePaths = Array.from(new Set(repoPaths.map((path) => path.trim()).filter(Boolean)));
  return Promise.all(uniquePaths.map((repoPath) => scanLocalGitRepo(repoPath)));
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", branch]);
    return true;
  } catch {
    return false;
  }
}

async function resolveBaseBranch(repoPath: string): Promise<string | null> {
  for (const candidate of BASE_BRANCH_CANDIDATES) {
    if (await branchExists(repoPath, candidate)) return candidate;
  }
  return null;
}

export async function scanLocalGitBranch(
  repoPath: string,
  targetBranch: string
): Promise<LocalGitBranchEvidence> {
  const empty: LocalGitBranchEvidence = {
    repoPath,
    targetBranch,
    baseBranch: null,
    branchExists: false,
    latestCommits: [],
    diffSummary: "",
    uiChangedFiles: [],
    uiDiffExcerpt: "",
    visualNote: "",
  };

  try {
    const exists = await branchExists(repoPath, targetBranch);
    if (!exists) {
      return {
        ...empty,
        visualNote: `Branch "${targetBranch}" not found in ${repoPath}.`,
      };
    }

    const baseBranch = await resolveBaseBranch(repoPath);
    const [latestCommitOutput, diffSummary, nameStatus] = await Promise.all([
      runGit(repoPath, [
        "log",
        targetBranch,
        "-n",
        "8",
        "--pretty=format:%h%x09%ad%x09%s",
        "--date=iso-strict",
      ]),
      baseBranch
        ? runGit(repoPath, ["diff", "--stat", `${baseBranch}...${targetBranch}`]).catch(() => "")
        : Promise.resolve(""),
      baseBranch
        ? runGit(repoPath, ["diff", "--name-only", `${baseBranch}...${targetBranch}`]).catch(
            () => ""
          )
        : Promise.resolve(""),
    ]);

    const uiChangedFiles = nameStatus
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && UI_FILE_PATTERN.test(line));

    let uiDiffExcerpt = "";
    if (baseBranch && uiChangedFiles.length > 0) {
      const firstUiFile = uiChangedFiles[0];
      try {
        const diff = await runGit(repoPath, [
          "diff",
          `${baseBranch}...${targetBranch}`,
          "--",
          firstUiFile,
        ]);
        uiDiffExcerpt = diff.slice(0, 4000);
      } catch {
        uiDiffExcerpt = "";
      }
    }

    const visualNote =
      uiChangedFiles.length > 0
        ? `UX-relevant files changed on ${targetBranch}: ${uiChangedFiles.slice(0, 12).join(", ")}. Compare this implementation snapshot against the Figma frame for layout, states, and copy.`
        : `No obvious UI file changes on ${targetBranch} vs ${baseBranch ?? "base"}. Git cannot provide a screenshot — rely on Figma frame evidence and task requirements.`;

    return {
      repoPath,
      targetBranch,
      baseBranch,
      branchExists: true,
      latestCommits: latestCommitOutput
        .split("\n")
        .map(parseCommit)
        .filter((commit): commit is LocalGitCommit => commit != null),
      diffSummary: diffSummary || "No diff against base branch.",
      uiChangedFiles,
      uiDiffExcerpt,
      visualNote,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Could not read git branch.",
    };
  }
}

export async function scanLocalGitBranches(
  repoPaths: string[],
  targetBranch: string
): Promise<LocalGitBranchEvidence[]> {
  const uniquePaths = Array.from(new Set(repoPaths.map((path) => path.trim()).filter(Boolean)));
  return Promise.all(uniquePaths.map((repoPath) => scanLocalGitBranch(repoPath, targetBranch)));
}
