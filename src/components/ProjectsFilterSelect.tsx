"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILTERS = ["all", "active", "inactive"] as const;
export type ProjectsFilter = (typeof FILTERS)[number];

const LABELS: Record<ProjectsFilter, string> = {
  all: "All projects",
  active: "Active",
  inactive: "Inactive",
};

interface ProjectsFilterSelectProps {
  activeFilter: ProjectsFilter;
  counts: Record<ProjectsFilter, number>;
}

export function ProjectsFilterSelect({ activeFilter, counts }: ProjectsFilterSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string | null) {
    const next = (value ?? "all") as ProjectsFilter;
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
    <Select value={activeFilter} onValueChange={handleChange}>
      <SelectTrigger size="sm" aria-label="Filter projects">
        <SelectValue>{LABELS[activeFilter]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {FILTERS.map((filter) => (
          <SelectItem key={filter} value={filter}>
            {LABELS[filter]}
            <span className="ml-1 tabular-nums text-muted-soft">({counts[filter]})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
