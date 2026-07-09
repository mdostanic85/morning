"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
      toast.success("Repo paths saved.");
      router.refresh();
    } catch {
      toast.error("Could not save repo paths.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={saveRepoPaths}
      className="rounded-xl border border-border bg-surface-soft/50 p-4"
    >
      <label htmlFor="repo-paths" className="block text-xs font-medium text-foreground">
        Local repo paths
      </label>
      <p className="mt-0.5 text-xs text-muted">
        One path per line — used to gather git evidence during verification.
      </p>
      <Textarea
        id="repo-paths"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="/Users/you/path/to/repo"
        className="mt-2 text-sm"
      />
      <div className="mt-3">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save repo paths"}
        </Button>
      </div>
    </form>
  );
}
