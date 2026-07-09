"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { GitHubRepoPicker } from "@/components/GitHubRepoPicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ProjectIntegrationSettingsFormProps {
  projectId: number;
  initial: {
    jiraKeys: string[];
    githubRepositories: string[];
    confluenceSpaces: string[];
    confluencePageUrls: string[];
    discordChannels: string[];
    figmaFileKeys: string[];
  };
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProjectIntegrationSettingsForm({
  projectId,
  initial,
}: ProjectIntegrationSettingsFormProps) {
  const router = useRouter();
  const [jiraKeys, setJiraKeys] = useState(initial.jiraKeys.join("\n"));
  const [githubRepositories, setGithubRepositories] = useState(initial.githubRepositories);
  const [showManualGithub, setShowManualGithub] = useState(false);
  const [confluenceSpaces, setConfluenceSpaces] = useState(initial.confluenceSpaces.join("\n"));
  const [confluencePageUrls, setConfluencePageUrls] = useState(
    initial.confluencePageUrls.join("\n")
  );
  const [discordChannels, setDiscordChannels] = useState(initial.discordChannels.join("\n"));
  const [figmaFileKeys, setFigmaFileKeys] = useState(initial.figmaFileKeys.join("\n"));
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/integration-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraKeys: splitLines(jiraKeys),
          githubRepositories,
          confluenceSpaces: splitLines(confluenceSpaces),
          confluencePageUrls: splitLines(confluencePageUrls),
          discordChannels: splitLines(discordChannels),
          figmaFileKeys: splitLines(figmaFileKeys),
        }),
      });
      if (!res.ok) throw new Error("Could not save integration settings.");
      toast.success("Connector hints saved.");
      router.refresh();
    } catch {
      toast.error("Could not save connector hints.");
    } finally {
      setSaving(false);
    }
  }

  function textareaField(
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string
  ) {
    return (
      <label className="block">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder={placeholder}
          className="mt-1.5 text-sm"
        />
      </label>
    );
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-surface-soft/50 p-4">
      <h3 className="text-sm font-semibold tracking-tight">Connector hints</h3>
      <p className="mt-0.5 text-xs text-muted">
        One value per line. These keep imports focused instead of pulling noisy sources.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {textareaField("Jira project keys", jiraKeys, setJiraKeys, "PROJ")}
        <div className="sm:col-span-2">
          <span className="text-xs font-medium text-foreground">GitHub repositories</span>
          <div className="mt-1.5">
            <GitHubRepoPicker value={githubRepositories} onChange={setGithubRepositories} />
          </div>
          <button
            type="button"
            onClick={() => setShowManualGithub((value) => !value)}
            className="mt-2 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            {showManualGithub ? "Hide manual entry" : "Add repo manually"}
          </button>
          {showManualGithub ? (
            <Textarea
              value={githubRepositories.join("\n")}
              onChange={(event) => setGithubRepositories(splitLines(event.target.value))}
              rows={2}
              placeholder="owner/repo"
              className="mt-2 text-sm"
            />
          ) : null}
        </div>
        {textareaField("Confluence spaces", confluenceSpaces, setConfluenceSpaces, "SPACE")}
        {textareaField("Confluence page URLs", confluencePageUrls, setConfluencePageUrls, "https://.../pages/123")}
        {textareaField("Discord channel IDs", discordChannels, setDiscordChannels, "1234567890")}
        {textareaField("Figma file keys", figmaFileKeys, setFigmaFileKeys, "AbCdEfGh or full figma.com/design/... URL")}
      </div>
      <div className="mt-4">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save connector hints"}
        </Button>
      </div>
    </form>
  );
}
