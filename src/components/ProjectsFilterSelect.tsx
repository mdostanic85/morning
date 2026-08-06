"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Key } from "react";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

const FILTERS = ["all", "active", "inactive"] as const;
export type ProjectsFilter = (typeof FILTERS)[number];

const LABELS: Record<ProjectsFilter, string> = {
 all: "All projects",
 active: "Active",
 inactive: "Inactive",
};

const fromKey = (k: Key | null) => String(k ?? "");

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
 <Dropdown>
 <Button
 type="button"
 variant="outline"
 size="md"
 className="h-(--control-height) min-w-52 justify-between"
 aria-label="Filter projects"
 >
 <span>
 {LABELS[activeFilter]}{" "}
 <span className="tabular-nums text-muted-soft">({counts[activeFilter]})</span>
 </span>
 <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
 </Button>
 <Dropdown.Popover
 placement="bottom start"
 offset={6}
 className="min-w-(--trigger-width) rounded-lg border border-border bg-overlay p-1"
 >
 <Dropdown.Menu
 aria-label="Project filters"
 onAction={(key) => handleChange(key)}
 className="max-h-72 overflow-y-auto outline-none"
 >
 {FILTERS.map((filter) => {
 const label = `${LABELS[filter]} (${counts[filter]})`;
 return (
 <Dropdown.Item
 key={filter}
 id={filter}
 textValue={label}
 className="relative flex min-h-11 w-full cursor-default items-center rounded-md px-2 pr-8 text-sm outline-none"
 >
 {LABELS[filter]}
 <span className="ml-1 tabular-nums text-muted-soft">({counts[filter]})</span>
 {activeFilter === filter ? (
 <CheckIcon className="absolute right-2 size-4" aria-hidden />
 ) : null}
 </Dropdown.Item>
 );
 })}
 </Dropdown.Menu>
 </Dropdown.Popover>
 </Dropdown>
 );
}
