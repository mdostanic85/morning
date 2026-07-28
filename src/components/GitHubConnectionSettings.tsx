"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type Key } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Select } from "@heroui/react/select";
import { ListBox } from "@heroui/react/list-box";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

const EMPTY = "__empty__";
const toKey = (v: string | null | undefined) => (v === "" ? EMPTY : v ?? undefined);
const fromKey = (k: Key | null) => (k === EMPTY ? "" : String(k ?? ""));

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
 const [repository, setRepository] = useState(initialRepository ?? "");
 const [branch, setBranch] = useState(initialBranch ?? "");
 const [filter, setFilter] = useState("");
 const [manualRepo, setManualRepo] = useState("");
 const [loadingRepos, setLoadingRepos] = useState(true);
 const [loadingBranches, setLoadingBranches] = useState(false);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);

 // Reset form state when the connection setup changes. Render-time
 // adjustment instead of an effect to avoid a cascading re-render.
 const resetKey = `${setupKey}\u0000${initialRepository ?? ""}\u0000${initialBranch ?? ""}`;
 const [prevResetKey, setPrevResetKey] = useState(resetKey);
 if (prevResetKey !== resetKey) {
 setPrevResetKey(resetKey);
 setRepository(initialRepository ?? "");
 setBranch(initialBranch ?? "");
 setFilter("");
 setManualRepo("");
 }

 // Clear stale branches as soon as the selected repository changes.
 const [prevRepository, setPrevRepository] = useState(repository);
 if (prevRepository !== repository) {
 setPrevRepository(repository);
 setBranches([]);
 }

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
 if (!repository) return;

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
 Toast.toast.danger(err instanceof Error ? err.message : "Could not load branches.");
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
 Toast.toast.danger("Use owner/repo format, e.g. ooden-tech/or-hydra-app.");
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
 Toast.toast.danger("Pick a repository and branch first.");
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
 Toast.toast.success("GitHub repo and branch saved.");
 router.refresh();
 } catch (err) {
 Toast.toast.danger(err instanceof Error ? err.message : "Could not save GitHub settings.");
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
 fullWidth
 value={manualRepo}
 onChange={(event) => setManualRepo(event.target.value)}
 placeholder="ooden-tech/or-hydra-app"
 aria-label="Manual GitHub repository"
 className={cn("h-11 border border-border bg-background/70 text-sm shadow-none")}
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
 <p className="text-metadata font-medium text-foreground">What are you working on?</p>
 <p className="mt-0.5 text-metadata text-muted">
 {login ? `Signed in as ${login}. ` : ""}
 Pick repo and branch for sync and delivery checks.
 </p>
 {needsSetup ? (
 <p className="mt-1 text-metadata text-warm">Finish setup: choose repo and branch, then Save.</p>
 ) : null}
 </div>

 <Input
 fullWidth
 value={filter}
 onChange={(event) => setFilter(event.target.value)}
 placeholder="Filter repositories… e.g. ooden-tech"
 aria-label="Filter GitHub repositories"
 className={cn("h-11 border border-border bg-background/70 text-sm shadow-none")}
 />

 <div className="grid gap-3 sm:grid-cols-2">
 <label className="block space-y-1.5">
 <span className="text-metadata font-medium text-muted-soft">Repository</span>
 <Select
 selectedKey={toKey(repository)}
 onSelectionChange={(key) => {
 setRepository(fromKey(key));
 setBranch("");
 }}
 className="w-full"
 aria-label="GitHub repository"
 >
 <Select.Trigger className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm shadow-none">
 <Select.Value className="flex flex-1 text-left">
 {(state) => (state.isPlaceholder ? "Select repository" : state.defaultChildren)}
 </Select.Value>
 <Select.Indicator className="text-muted">
 <ChevronDownIcon className="size-4" />
 </Select.Indicator>
 </Select.Trigger>
 <Select.Popover
 placement="bottom start"
 offset={6}
 className="min-w-40 rounded-lg border border-border bg-overlay p-1"
 >
 <ListBox aria-label="Repositories" className="max-h-72 overflow-y-auto outline-none">
 {filteredRepos.length === 0 ? (
 <ListBox.Item
 id="__no_matches__"
 textValue="No matches"
 isDisabled
 className="relative flex min-h-9 w-full cursor-default items-center rounded-md px-2 pr-8 text-metadata text-muted outline-none"
 >
 No matches. Add repo manually below.
 </ListBox.Item>
 ) : (
 filteredRepos.map((repo) => {
 const label = `${repo.fullName}${repo.private ? " (private)" : ""}`;
 return (
 <ListBox.Item
 key={repo.fullName}
 id={repo.fullName}
 textValue={label}
 className="relative flex min-h-9 w-full cursor-default items-center rounded-md px-2 pr-8 text-sm outline-none"
 >
 {label}
 <ListBox.ItemIndicator className="absolute right-2">
 <CheckIcon className="size-4" />
 </ListBox.ItemIndicator>
 </ListBox.Item>
 );
 })
 )}
 </ListBox>
 </Select.Popover>
 </Select>
 </label>

 <label className="block space-y-1.5">
 <span className="text-metadata font-medium text-muted-soft">Branch</span>
 <Select
 selectedKey={toKey(branch)}
 onSelectionChange={(key) => setBranch(fromKey(key))}
 isDisabled={!repository || loadingBranches}
 className="w-full"
 aria-label="GitHub branch"
 >
 <Select.Trigger className="flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm shadow-none">
 <Select.Value className="flex flex-1 text-left">
 {(state) =>
 state.isPlaceholder
 ? loadingBranches
 ? "Loading branches…"
 : "Select branch"
 : state.defaultChildren
 }
 </Select.Value>
 <Select.Indicator className="text-muted">
 <ChevronDownIcon className="size-4" />
 </Select.Indicator>
 </Select.Trigger>
 <Select.Popover
 placement="bottom start"
 offset={6}
 className="min-w-40 rounded-lg border border-border bg-overlay p-1"
 >
 <ListBox aria-label="Branches" className="max-h-72 overflow-y-auto outline-none">
 {branches.map((item) => {
 const label = `${item.name}${item.default ? " (default)" : ""}`;
 return (
 <ListBox.Item
 key={item.name}
 id={item.name}
 textValue={label}
 className="relative flex min-h-9 w-full cursor-default items-center rounded-md px-2 pr-8 text-sm outline-none"
 >
 {label}
 <ListBox.ItemIndicator className="absolute right-2">
 <CheckIcon className="size-4" />
 </ListBox.ItemIndicator>
 </ListBox.Item>
 );
 })}
 </ListBox>
 </Select.Popover>
 </Select>
 </label>
 </div>

 <div className="space-y-2 rounded-lg border border-border bg-surface-soft/40 px-3 py-2">
 <p className="text-metadata text-muted">
 Org repo missing? Add manually, or authorize this app for the org on GitHub → Settings →
 Applications.
 </p>
 <div className="form-inline">
 <Input
 fullWidth
 value={manualRepo}
 onChange={(event) => setManualRepo(event.target.value)}
 placeholder="ooden-tech/or-hydra-app"
 aria-label="Manual GitHub repository"
 className={cn("h-11 border border-border bg-background/70 text-sm shadow-none")}
 />
 <Button type="button" size="sm" variant="outline" onClick={addManualRepo}>
 Add repo
 </Button>
 </div>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 <Button
 type="button"
 size="sm"
 onClick={save}
 isDisabled={saving || !repository || !branch}
 >
 {saving ? "Saving…" : saved ? "Saved" : "Save"}
 </Button>
 {initialRepository && initialBranch ? (
 <p className="text-metadata text-muted-soft">
 Current: {initialRepository} @ {initialBranch}
 </p>
 ) : null}
 </div>
 </div>
 );
}
