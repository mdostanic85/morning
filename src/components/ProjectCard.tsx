"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import type { ProjectStatus } from "@/domain/project";
import { AppBadge } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";
import { ProjectStatusToggle } from "@/components/ProjectStatusToggle";
import { Heading } from "@/components/Heading";

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
      <Link href={`/projects/${id}?tab=overview`} className="min-w-0 flex-1">
        <Heading level={2} visualLevel={6}>{name}</Heading>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted line-clamp-2">
            {description}
          </p>
        ) : null}
        {jiraKeys.length > 0 ? (
          <p className="mt-2 text-metadata text-muted-soft">Jira: {jiraKeys.join(" · ")}</p>
        ) : keywords.length > 0 ? (
          <p className="mt-2.5 text-metadata text-muted-soft">{keywords.join(" · ")}</p>
        ) : null}
      </Link>
      <div className="flex shrink-0 items-center gap-2 self-start">
        <AppTooltip content={active ? "Turn off project" : "Restore project"} isInteractive>
        <ProjectStatusToggle
          checked={active}
          onCheckedChange={toggleStatus}
          disabled={pending}
          aria-label={active ? "Turn off project" : "Restore project"}
        />
        </AppTooltip>
        <AppBadge tone="neutral" className="tabular-nums">
          {totalOpen} open
        </AppBadge>
      </div>
    </div>
  );
}
