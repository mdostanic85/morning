"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@heroui/react/input";
import { cn } from "@/lib/utils";

interface GitHubRepositoryOption {
  fullName: string;
  private: boolean;
  updatedAt: string;
}

interface GitHubRepoPickerProps {
  value: string[];
  onChange: (repos: string[]) => void;
}

export function GitHubRepoPicker({ value, onChange }: GitHubRepoPickerProps) {
  const [repos, setRepos] = useState<GitHubRepositoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => new Set(value), [value]);
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return repos;
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(query));
  }, [filter, repos]);

  const manualOnly = value.filter((repo) => !repos.some((item) => item.fullName === repo));

  function toggle(fullName: string) {
    if (selected.has(fullName)) {
      onChange(value.filter((repo) => repo !== fullName));
      return;
    }
    onChange([...value, fullName]);
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading your GitHub repositories…</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">{error}</p>
        <p className="text-xs text-muted-soft">
          <Link href="/settings" className="text-foreground underline-offset-2 hover:underline">
            Connect GitHub in Settings
          </Link>{" "}
          to pick repositories from a list, or type <code className="text-foreground">owner/repo</code>{" "}
          manually below.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        fullWidth
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter repositories…"
        aria-label="Filter GitHub repositories"
        className={cn("h-11 border border-border bg-background/70 text-sm shadow-none")}
      />
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">No repositories match that filter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((repo) => {
              const checked = selected.has(repo.fullName);
              return (
                <li key={repo.fullName}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-soft",
                      checked && "bg-surface-soft"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(repo.fullName)}
                      className="size-4 rounded border-border"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{repo.fullName}</span>
                    {repo.private ? (
                      <span className="shrink-0 text-xs text-muted-soft">private</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {manualOnly.length > 0 ? (
        <p className="text-xs text-muted-soft">
          Also tracking manually added repos not in this list: {manualOnly.join(", ")}
        </p>
      ) : null}
      {value.length > 0 ? (
        <p className="text-xs text-muted-soft">
          {value.length} repositor{value.length === 1 ? "y" : "ies"} selected for this project.
        </p>
      ) : (
        <p className="text-xs text-muted-soft">Select one or more repositories for GitHub sync.</p>
      )}
    </div>
  );
}
