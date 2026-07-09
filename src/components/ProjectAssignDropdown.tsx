"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ProjectOption {
  id: number;
  name: string;
}

interface ProjectAssignDropdownProps {
  taskId: number;
  projects: ProjectOption[];
  initialProjectId: number | null;
}

export function ProjectAssignDropdown({
  taskId,
  projects,
  initialProjectId,
}: ProjectAssignDropdownProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(initialProjectId?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(value: string | null) {
    const resolved = value ?? "";
    setProjectId(resolved);
    setSaving(true);
    try {
      const res = await fetch(`/api/work-tasks/${taskId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: resolved ? Number(resolved) : null }),
      });
      if (!res.ok) throw new Error("Failed to assign project.");
      router.refresh();
    } catch {
      setProjectId(initialProjectId?.toString() ?? "");
      toast.error("Could not assign project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
      <label htmlFor={`project-select-${taskId}`}>Project</label>
      <Select
        value={projectId}
        onValueChange={handleChange}
        disabled={saving || projects.length === 0}
      >
        <SelectTrigger id={`project-select-${taskId}`} size="sm">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Unassigned</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={String(project.id)}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving ? <span>Saving…</span> : null}
    </div>
  );
}
