"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GitHubRepositoryOption {
  fullName: string;
  private: boolean;
  updatedAt: string;
}

interface GitHubBranchOption {
  name: string;
  default: boolean;
}

interface GitHubConnectionSettingsProps {
  setupKey: string;
  initialRepository?: string | null;
  initialBranch?: string | null;
  login?: string | null;
}

function isRepoSlug(value: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(value.trim());
}

export function GitHubConnectionSettings({
  setupKey,
  initialRepository = null,
  initialBranch = null,
  login = null,
}: GitHubConnectionSettingsProps) {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepositoryOption[]>([]);
  const [branches, setBranches] = useState<GitHubBranchOption[]>([]);
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("");
  const [filter, setFilter] = useState("");
  const [manualRepo, setManualRepo] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRepository(initialRepository ?? "");
    setBranch(initialBranch ?? "");
    setFilter("");
    setManualRepo("");
  }, [setupKey, initialRepository, initialBranch]);

  useEffect(() => {
    let cancelled = false;
    async function loadRepos() {
      setLoadingRepos(true);
      setError(null);
      try {
        const res = await fetch("/api/connections/github/repos");
        const data = (await res.json()) as {
          repos?: GitHubRepositoryOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load repositories.");
        if (!cancelled) setRepos(data.repos ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load repositories.");
        }
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    }
    void loadRepos();
    return () => {
      cancelled = true;
    };
  }, [setupKey]);

  useEffect(() => {
    if (!repository) {
      setBranches([]);
      return;
    }

    let cancelled = false;
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const res = await fetch(
          `/api/connections/github/branches?repo=${encodeURIComponent(repository)}`
        );
        const data = (await res.json()) as {
          branches?: GitHubBranchOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load branches.");
        if (!cancelled) {
          const nextBranches = data.branches ?? [];
          setBranches(nextBranches);
          setBranch((current) => {
            if (current && nextBranches.some((item) => item.name === current)) return current;
            return nextBranches.find((item) => item.default)?.name ?? "";
          });
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Could not load branches.");
          setBranches([]);
        }
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    }
    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const filteredRepos = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(query));
  }, [filter, repos]);

  function addManualRepo() {
    const slug = manualRepo.trim();
    if (!isRepoSlug(slug)) {
      toast.error("Use owner/repo format, e.g. ooden-tech/or-hydra-app.");
      return;
    }
    setRepos((current) =>
      current.some((repo) => repo.fullName === slug)
        ? current
        : [
            ...current,
            {
              fullName: slug,
              private: true,
              updatedAt: new Date().toISOString(),
            },
          ]
    );
    setRepository(slug);
    setManualRepo("");
    setFilter(slug);
  }

  async function save() {
    if (!repository || !branch) {
      toast.error("Pick a repository and branch first.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/connections/github/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, branch }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save GitHub settings.");
      toast.success("GitHub repo and branch saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save GitHub settings.");
    } finally {
      setSaving(false);
    }
  }

  const saved =
    initialRepository &&
    initialBranch &&
    initialRepository === repository &&
    initialBranch === branch;

  const needsSetup = !initialRepository || !initialBranch;

  if (loadingRepos) {
    return <p className="text-sm text-muted">Loading repositories…</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-danger">{error}</p>
        <div className="form-inline">
          <Input
            value={manualRepo}
            onChange={(event) => setManualRepo(event.target.value)}
            placeholder="ooden-tech/or-hydra-app"
            aria-label="Manual GitHub repository"
            className="text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={addManualRepo}>
            Add repo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-foreground">What are you working on?</p>
        <p className="mt-0.5 text-xs text-muted">
          {login ? `Signed in as ${login}. ` : ""}
          Pick repo and branch for sync and delivery checks.
        </p>
        {needsSetup ? (
          <p className="mt-1 text-xs text-warm">Finish setup: choose repo and branch, then Save.</p>
        ) : null}
      </div>

      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter repositories… e.g. ooden-tech"
        aria-label="Filter GitHub repositories"
        className="text-sm"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-soft">Repository</span>
          <Select
            value={repository || null}
            onValueChange={(value) => {
              setRepository(value ?? "");
              setBranch("");
            }}
          >
            <SelectTrigger className="w-full" size="sm" aria-label="GitHub repository">
              <SelectValue placeholder="Select repository" />
            </SelectTrigger>
            <SelectContent align="start">
              {filteredRepos.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted">No matches. Add repo manually below.</p>
              ) : (
                filteredRepos.map((repo) => (
                  <SelectItem key={repo.fullName} value={repo.fullName}>
                    {repo.fullName}
                    {repo.private ? " (private)" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-soft">Branch</span>
          <Select
            value={branch || null}
            onValueChange={(value) => setBranch(value ?? "")}
            disabled={!repository || loadingBranches}
          >
            <SelectTrigger className="w-full" size="sm" aria-label="GitHub branch">
              <SelectValue
                placeholder={loadingBranches ? "Loading branches…" : "Select branch"}
              />
            </SelectTrigger>
            <SelectContent align="start">
              {branches.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name}
                  {item.default ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-surface-soft/40 px-3 py-2">
        <p className="text-xs text-muted">
          Org repo missing? Add manually, or authorize this app for the org on GitHub → Settings →
          Applications.
        </p>
        <div className="form-inline">
          <Input
            value={manualRepo}
            onChange={(event) => setManualRepo(event.target.value)}
            placeholder="ooden-tech/or-hydra-app"
            aria-label="Manual GitHub repository"
            className="text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={addManualRepo}>
            Add repo
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving || !repository || !branch}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
        {initialRepository && initialBranch ? (
          <p className="text-xs text-muted-soft">
            Current: {initialRepository} @ {initialBranch}
          </p>
        ) : null}
      </div>
    </div>
  );
}
