"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";

export function HydraConfigForm({
  config,
  deliverySettings,
}: {
  config: Record<string, unknown>;
  deliverySettings: { inApp: boolean; email: boolean; push: boolean };
}) {
  const router = useRouter();
  const [jiraProject, setJiraProject] = useState(String(config.jiraProject ?? "UATL"));
  const [assignee, setAssignee] = useState(String(config.assignee ?? "Milos Dostanic"));
  const [stakeholders, setStakeholders] = useState(Array.isArray(config.stakeholders) ? config.stakeholders.join(", ") : "Matt, Lucas");
  const [delivery, setDelivery] = useState(deliverySettings);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/hydra/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { jiraProject, assignee, stakeholders: stakeholders.split(",").map((item) => item.trim()).filter(Boolean) },
          deliverySettings: delivery,
        }),
      });
      if (!response.ok) throw new Error("Brief scope could not be saved.");
      Toast.toast.success("Brief scope saved");
      router.refresh();
    } catch (error) {
      Toast.toast.danger(error instanceof Error ? error.message : "Brief scope could not be saved.");
    } finally { setSaving(false); }
  }
  return (
    <section className="app-card p-5 sm:p-6">
      <div><p className="eyebrow">Brief scope</p><h2 className="mt-1 font-display text-xl font-semibold">Work scope</h2></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label><span className="text-xs font-medium text-muted">Jira project</span><Input className="mt-1.5" value={jiraProject} onChange={(event) => setJiraProject(event.target.value)} /></label>
        <label><span className="text-xs font-medium text-muted">Assignee</span><Input className="mt-1.5" value={assignee} onChange={(event) => setAssignee(event.target.value)} /></label>
        <label><span className="text-xs font-medium text-muted">High-authority stakeholders</span><Input className="mt-1.5" value={stakeholders} onChange={(event) => setStakeholders(event.target.value)} /></label>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-sm">{(["email", "push"] as const).map((channel) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={delivery[channel]} onChange={(event) => setDelivery({ ...delivery, [channel]: event.target.checked })} className="size-4 accent-[var(--accent)]" /> {channel === "push" ? "Browser notification" : "Email delivery"}</label>)}</div>
      <p className="mt-4 text-xs text-muted">In-app delivery is always on. Email requires Resend environment settings; browser notifications are requested when you manually run a brief.</p>
      <Button className="mt-5" onClick={save} isDisabled={saving}>{saving ? "Saving…" : "Save configuration"}</Button>
    </section>
  );
}
