"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react";
import { Select } from "@heroui/react/select";
import { ListBox } from "@heroui/react/list-box";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

const FILTERS = ["all", "active", "inactive"] as const;
export type ProjectsFilter = (typeof FILTERS)[number];

const LABELS: Record<ProjectsFilter, string> = {
 all: "All projects",
 active: "Active",
 inactive: "Inactive",
};

const EMPTY = "__empty__";
const toKey = (v: string | null | undefined) => (v === "" ? EMPTY : v ?? undefined);
const fromKey = (k: Key | null) => (k === EMPTY ? "" : String(k ?? ""));

interface ProjectsFilterSelectProps {
 activeFilter: ProjectsFilter;
 counts: Record<ProjectsFilter, number>;
}

export function ProjectsFilterSelect({ activeFilter, counts }: ProjectsFilterSelectProps) {
 const router = useRouter();
 const searchParams = useSearchParams();

 function handleChange(key: Key | null) {
 const next = (fromKey(key) || "all") as ProjectsFilter;
 const params = new URLSearchParams(searchParams.toString());
 if (next === "all") {
 params.delete("filter");
 } else {
 params.set("filter", next);
 }
 const query = params.toString();
 router.replace(query ? `/projects?${query}` : "/projects", { scroll: false });
 }

 return (
 <Select
 selectedKey={toKey(activeFilter)}
 onSelectionChange={handleChange}
 aria-label="Filter projects"
 >
 <Select.Trigger className="flex h-11 w-fit items-center justify-between gap-1.5 rounded-lg border border-border bg-background/70 px-3 text-sm shadow-none">
 <Select.Value className="flex flex-1 text-left">
 {(state) => (state.isPlaceholder ? "Filter projects" : state.defaultChildren)}
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
 <ListBox aria-label="Project filters" className="max-h-72 overflow-y-auto outline-none">
 {FILTERS.map((filter) => {
 const label = `${LABELS[filter]} (${counts[filter]})`;
 return (
 <ListBox.Item
 key={filter}
 id={filter}
 textValue={label}
 className="relative flex min-h-11 w-full cursor-default items-center rounded-md px-2 pr-8 text-sm outline-none"
 >
 {LABELS[filter]}
 <span className="ml-1 tabular-nums text-muted-soft">({counts[filter]})</span>
 <ListBox.ItemIndicator className="absolute right-2">
 <CheckIcon className="size-4" />
 </ListBox.ItemIndicator>
 </ListBox.Item>
 );
 })}
 </ListBox>
 </Select.Popover>
 </Select>
 );
}
