"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import type { IngestionRule } from "@/domain/ingestionRule";
import { SOURCE_TYPES, type SourceType } from "@/domain/sourceItem";
import { Heading } from "@/components/Heading";

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  manual_transcript: "Manual transcript",
  gmail: "Gmail",
  calendar: "Calendar",
  drive: "Drive",
  jira: "Jira",
  confluence: "Confluence",
  granola: "Granola",
  github: "GitHub",
  figma: "Figma",
  discord: "Discord",
  git: "Git",
};

function scopeLabel(rule: IngestionRule, projectName: string | null): string {
  const parts: string[] = [];
  if (rule.sourceType) parts.push(SOURCE_TYPE_LABELS[rule.sourceType]);
  if (rule.projectId != null) parts.push(projectName ?? `Project #${rule.projectId}`);
  return parts.length > 0 ? parts.join(" · ") : "All sources";
}

export function IngestionRulesPanel({
  initialRules,
  projects,
}: {
  initialRules: IngestionRule[];
  projects: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [ruleText, setRuleText] = useState("");
  const [sourceType, setSourceType] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

  async function addRule() {
    const trimmed = ruleText.trim();
    if (!trimmed) {
      Toast.toast.danger("Write the rule first.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ingestion-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule: trimmed,
          sourceType: sourceType || null,
          projectId: projectId ? Number(projectId) : null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add rule.");
      setRuleText("");
      setSourceType("");
      setProjectId("");
      Toast.toast.success("Rule added.");
      router.refresh();
    } catch (err) {
      Toast.toast.danger(err instanceof Error ? err.message : "Could not add rule.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(rule: IngestionRule) {
    const res = await fetch(`/api/ingestion-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (!res.ok) {
      Toast.toast.danger("Could not update rule.");
      return;
    }
    router.refresh();
  }

  async function removeRule(rule: IngestionRule) {
    const res = await fetch(`/api/ingestion-rules/${rule.id}`, { method: "DELETE" });
    if (!res.ok) {
      Toast.toast.danger("Could not delete rule.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="app-card p-6">
      <Heading level={2} visualLevel={5}>Extraction rules</Heading>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Plain-language preferences that guide what gets extracted from a source. For example, &ldquo;ignore
        GitHub CI status noise&rdquo; or &ldquo;attribute this repo to Project X&rdquo;. Scope a rule to a
        connector, a project, both, or leave it applying everywhere.
      </p>

      {initialRules.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {initialRules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-soft/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className={`text-sm ${rule.active ? "text-foreground" : "text-muted-soft line-through"}`}>
                  {rule.rule}
                </p>
                <p className="mt-0.5 text-metadata text-muted-soft">
                  {scopeLabel(rule, projectNameById.get(rule.projectId ?? -1) ?? null)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleActive(rule)}
                  className="text-metadata font-medium text-muted hover:text-foreground"
                >
                  {rule.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => removeRule(rule)}
                  className="text-metadata font-medium text-danger hover:opacity-80"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-soft">No extraction rules yet.</p>
      )}

      <div className="mt-5 space-y-2.5 border-t border-border pt-4">
        <textarea
          value={ruleText}
          onChange={(event) => setRuleText(event.target.value)}
          placeholder='e.g. "Ignore GitHub CI status noise"'
          rows={2}
          className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm shadow-none outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value)}
            className="h-9 rounded-lg border border-border bg-background/70 px-2 text-sm text-foreground"
            aria-label="Scope to connector"
          >
            <option value="">Any connector</option>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SOURCE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="h-9 rounded-lg border border-border bg-background/70 px-2 text-sm text-foreground"
            aria-label="Scope to project"
          >
            <option value="">Any project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={addRule} isDisabled={saving}>
            {saving ? "Adding…" : "Add rule"}
          </Button>
        </div>
      </div>
    </section>
  );
}
