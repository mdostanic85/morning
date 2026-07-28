"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Heading } from "@/components/Heading";

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
  const [stakeholders, setStakeholders] = useState(Array.isArray(config.stakeholders) ? config.stakeholders.join(", ") : "Matt Pettit, Lucas Saeed");
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
      if (!response.ok) throw new Error("Report settings could not be saved.");
      Toast.toast.success("Report settings saved");
      router.refresh();
    } catch (error) {
      Toast.toast.danger(error instanceof Error ? error.message : "Report settings could not be saved.");
    } finally { setSaving(false); }
  }
  return (
    <section className="app-card p-5 sm:p-6">
      <div><p className="eyebrow">Report scope</p><Heading level={2} visualLevel={4} className="mt-1">Sources and delivery</Heading></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label><span className="text-metadata font-medium text-muted">Jira project</span><Input className="mt-1.5" value={jiraProject} onChange={(event) => setJiraProject(event.target.value)} /></label>
        <label><span className="text-metadata font-medium text-muted">Assignee</span><Input className="mt-1.5" value={assignee} onChange={(event) => setAssignee(event.target.value)} /></label>
        <label><span className="text-metadata font-medium text-muted">Priority stakeholders</span><Input className="mt-1.5" value={stakeholders} onChange={(event) => setStakeholders(event.target.value)} /></label>
      </div>
      <div className="mt-5 flex flex-wrap gap-4 text-sm">{(["email", "push"] as const).map((channel) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={delivery[channel]} onChange={(event) => setDelivery({ ...delivery, [channel]: event.target.checked })} className="size-4 accent-[var(--accent)]" /> {channel === "push" ? "Browser notification" : "Email delivery"}</label>)}</div>
      <p className="mt-4 text-metadata text-muted">Reports always appear in the app. Email needs Resend setup. The browser asks for notification access when you run a report.</p>
      <Button className="mt-5" onClick={save} isDisabled={saving}>{saving ? "Saving..." : "Save report settings"}</Button>
    </section>
  );
}
