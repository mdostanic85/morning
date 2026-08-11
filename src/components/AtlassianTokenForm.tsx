"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";

/**
 * Atlassian API token setup. The Rovo MCP domain allowlist and an OAuth 3LO app
 * both need an org admin to act; a personal API token needs nobody, so this is
 * the path that works when you are a plain member of someone else's site.
 */
export function AtlassianTokenForm({ siteUrl = "" }: { siteUrl?: string }) {
  const router = useRouter();
  const [site, setSite] = useState(siteUrl);
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [pending, setPending] = useState(false);

  const ready = site.trim() && email.trim() && apiToken.trim();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    const res = await fetch("/api/connections/atlassian/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl: site, email, apiToken }),
    });
    const data = (await res.json()) as { error?: string; account?: string };
    setPending(false);
    if (res.ok) {
      setApiToken("");
      Toast.toast.success(`Connected Jira and Confluence as ${data.account ?? email}.`);
      router.refresh();
    } else {
      Toast.toast.danger(data.error ?? "Atlassian connection failed.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <Input
        fullWidth
        type="text"
        value={site}
        onChange={(event) => setSite(event.target.value)}
        placeholder="your-team.atlassian.net"
        aria-label="Atlassian site URL"
        className="h-11 bg-background/70 text-sm shadow-none"
      />
      <Input
        fullWidth
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Atlassian account email"
        aria-label="Atlassian account email"
        className="h-11 bg-background/70 text-sm shadow-none"
      />
      <Input
        fullWidth
        type="password"
        value={apiToken}
        onChange={(event) => setApiToken(event.target.value)}
        placeholder="Paste API token"
        aria-label="Atlassian API token"
        className="h-11 bg-background/70 text-sm shadow-none"
      />
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="min-h-11"
          isDisabled={pending || !ready}
        >
          {pending ? "Testing…" : "Connect with token"}
        </Button>
        <a
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noreferrer"
          className="text-metadata text-muted-soft underline underline-offset-2"
        >
          Create an API token
        </a>
      </div>
    </form>
  );
}
