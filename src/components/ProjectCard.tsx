"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import type { ProjectStatus } from "@/domain/project";
import { Chip } from "@heroui/react/chip";
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

  // Follow the server-provided status when it changes. Render-time
  // adjustment instead of an effect to avoid a cascading re-render.
  const [prevStatus, setPrevStatus] = useState(status);
  if (prevStatus !== status) {
    setPrevStatus(status);
    setActive(status !== "inactive");
  }

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
      Toast.toast.success(nextActive ? "Project restored." : "Project turned off.");
      router.refresh();
    } catch {
      setActive(prevActive);
      Toast.toast.danger("Could not update project status.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-card flex items-start gap-3 p-5 transition-colors hover:border-border-strong hover:bg-surface-raised">
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
        <Chip
          variant="tertiary"
          color="default"
          className="tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border text-foreground transition-colors tabular-nums text-muted"
        >
          {totalOpen} open
        </Chip>
      </div>
    </div>
  );
}
