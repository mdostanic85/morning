"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ProjectStatus } from "@/domain/project";
import { Badge } from "@/components/ui/badge";
import { ProjectStatusToggle } from "@/components/ProjectStatusToggle";

interface ProjectCardProps {
  id: number;
  name: string;
  description: string | null;
  keywords: string[];
  jiraKeys: string[];
  openTaskCount: number;
  jiraIssueCount?: number;
  status?: ProjectStatus;
}

export function ProjectCard({
  id,
  name,
  description,
  keywords,
  jiraKeys,
  openTaskCount,
  jiraIssueCount = 0,
  status = "active",
}: ProjectCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [active, setActive] = useState(status !== "inactive");
  const totalOpen = openTaskCount + jiraIssueCount;

  useEffect(() => {
    setActive(status !== "inactive");
  }, [status]);

  async function toggleStatus(nextActive: boolean) {
    const prevActive = active;
    setActive(nextActive);
    const nextStatus: ProjectStatus = nextActive ? "active" : "inactive";
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error("Could not update project status.");
      toast.success(nextActive ? "Project restored." : "Project turned off.");
      router.refresh();
    } catch {
      setActive(prevActive);
      toast.error("Could not update project status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card flex items-start gap-3 p-5 transition-colors hover:border-border-strong hover:bg-surface-raised">
      <Link href={`/projects/${id}?tab=tasks`} className="min-w-0 flex-1">
        <h3 className="text-base font-medium leading-snug">{name}</h3>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted line-clamp-2">{description}</p>
        ) : null}
        {jiraKeys.length > 0 ? (
          <p className="mt-2 text-xs text-muted-soft">Jira: {jiraKeys.join(" · ")}</p>
        ) : keywords.length > 0 ? (
          <p className="mt-2.5 text-xs text-muted-soft">{keywords.join(" · ")}</p>
        ) : null}
      </Link>
      <div className="flex shrink-0 items-center gap-2 self-start">
        <ProjectStatusToggle
          checked={active}
          onCheckedChange={toggleStatus}
          disabled={pending}
          aria-label={active ? "Turn off project" : "Restore project"}
        />
        <Badge variant="outline" className="tabular-nums text-muted">
          {totalOpen} open
        </Badge>
      </div>
    </div>
  );
}
