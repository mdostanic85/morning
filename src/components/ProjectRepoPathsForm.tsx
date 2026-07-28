"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { TextArea } from "@heroui/react/textarea";

export function ProjectRepoPathsForm({
  projectId,
  initialRepoPaths,
}: {
  projectId: number;
  initialRepoPaths: string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialRepoPaths.join("\n"));
  const [saving, setSaving] = useState(false);

  async function saveRepoPaths(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const repoPaths = value
        .split("\n")
        .map((path) => path.trim())
        .filter(Boolean);
      const res = await fetch(`/api/projects/${projectId}/repo-paths`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPaths }),
      });
      if (!res.ok) throw new Error("Could not save repo paths.");
      Toast.toast.success("Repo paths saved.");
      router.refresh();
    } catch {
      Toast.toast.danger("Could not save repo paths.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={saveRepoPaths}
      className="rounded-xl border border-border bg-surface-soft/50 p-4"
    >
      <label htmlFor="repo-paths" className="block text-metadata font-medium text-foreground">
        Local repo paths
      </label>
      <p className="mt-0.5 text-metadata text-muted">
        Add one path per line. Worklight uses these repositories when checking completed work.
      </p>
      <TextArea
        id="repo-paths"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="/Users/you/path/to/repo"
        className="mt-2 text-sm"
      />
      <div className="mt-3">
        <Button type="submit" size="sm" className="min-h-11" isDisabled={saving}>
          {saving ? "Saving..." : "Save repo paths"}
        </Button>
      </div>
    </form>
  );
}
