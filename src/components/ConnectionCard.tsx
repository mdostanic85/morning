"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Toast } from "@heroui/react/toast";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Heading } from "@/components/Heading";

interface ConnectionCardProps {
  provider: string;
  label: string;
  description: string;
  authType: "oauth" | "api_key" | "pat" | "bot" | "mcp";
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
  metadata?: Record<string, unknown> | null;
  setupHint?: string | null;
  supportsMcp?: boolean;
  mcpConnectUrl?: string | null;
  transport?: "api" | "mcp" | null;
  hideMcpConnect?: boolean;
  sharedMcpNote?: string | null;
  mcpConnectLabel?: string | null;
  patFallback?: boolean;
  connectedExtra?: ReactNode;
  /** Extra credential setup shown under Manage, for providers the single-secret form cannot express. */
  extraSetup?: ReactNode;
  extraSetupLabel?: string | null;
  initialExpanded?: boolean;
}

export function ConnectionCard({
  provider,
  label,
  description,
  authType,
  status,
  lastSync,
  metadata,
  setupHint = null,
  supportsMcp = false,
  mcpConnectUrl = null,
  transport = null,
  hideMcpConnect = false,
  sharedMcpNote = null,
  mcpConnectLabel = null,
  patFallback = false,
  connectedExtra = null,
  extraSetup = null,
  extraSetupLabel = null,
  initialExpanded = false,
}: ConnectionCardProps) {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(
    () =>
      initialExpanded ||
      (authType !== "oauth" && authType !== "mcp" && status !== "connected")
  );

  async function disconnect() {
    setPending("disconnect");
    await fetch(`/api/connections/${provider}`, { method: "DELETE" });
    setPending(null);
    router.refresh();
  }

  async function saveSecret(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) return;
    setPending("secret");
    const res = await fetch(`/api/connections/${provider}/secret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    const data = (await res.json()) as { error?: string };
    setSecret("");
    setPending(null);
    if (res.ok) {
      Toast.toast.success("Connected.");
    } else {
      Toast.toast.danger(data.error ?? "Connection failed.");
    }
    router.refresh();
  }

  const connected = status === "connected";
  const hasError = status === "error";
  const usingMcp = connected && (transport === "mcp" || authType === "mcp");
  const mcpHref =
    supportsMcp && mcpConnectUrl && !hideMcpConnect
      ? connected
        ? `${mcpConnectUrl}?force=1`
        : mcpConnectUrl
      : null;
  const showApiConnect = authType === "oauth" && !usingMcp;
  const apiConnectHref = `/api/connections/${provider}/connect`;
  const statusLabel = connected ? "Connected" : hasError ? "Needs attention" : "Not connected";
  const statusStyle = connected
    ? "border-good/35 bg-good/10 text-good"
    : hasError
      ? "border-danger/35 bg-danger/10 text-danger"
      : "border-border bg-surface-soft text-muted";
  const secretPlaceholder =
    authType === "pat"
      ? provider === "figma"
        ? "Paste read-only Figma personal access token"
        : "Paste read-only GitHub PAT"
      : authType === "bot"
        ? "Paste Discord bot token"
        : "Paste API key";
  const mcpButtonLabel = mcpConnectLabel
    ? connected
      ? `Reconnect ${mcpConnectLabel}`
      : `Connect ${mcpConnectLabel}`
    : connected
      ? "Reconnect via MCP"
      : "Connect via MCP";
  const hasTokenForm = (authType !== "oauth" && authType !== "mcp") || patFallback;
  const showPatFallback = patFallback && authType === "oauth";
  const showToggle =
    hasTokenForm ||
    (supportsMcp && !usingMcp) ||
    Boolean(extraSetup) ||
    Boolean(setupHint && !supportsMcp);
  const errorText = typeof metadata?.error === "string" ? metadata.error : null;

  return (
    <section className="app-card px-4 py-3">
      {/* Header row: label + status + actions */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2} visualLevel={6}>{label}</Heading>
            <AppBadge className={cn(statusStyle)}>{statusLabel}</AppBadge>
            {usingMcp ? <AppBadge tone="neutral">MCP</AppBadge> : null}
          </div>
          {!connected ? (
            <p className="mt-1 text-sm leading-snug text-muted line-clamp-2">{description}</p>
          ) : lastSync ? (
            <p className="mt-1 text-sm text-muted-soft">
              Last sync {new Date(lastSync).toLocaleString()}
            </p>
          ) : sharedMcpNote ? (
            <p className="mt-1 text-sm text-muted-soft">{sharedMcpNote}</p>
          ) : typeof metadata?.workRepository === "string" &&
            typeof metadata?.workBranch === "string" ? (
            <p className="mt-1 text-sm text-muted-soft">
              {metadata.workRepository} @ {metadata.workBranch}
            </p>
          ) : null}
          {errorText ? <p className="mt-1.5 text-sm text-danger">{errorText}</p> : null}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
          {mcpHref ? (
            <a
              href={mcpHref}
              className={usingMcp ? "link-btn-outline motion-btn" : "link-btn-primary motion-btn"}
            >
              {mcpButtonLabel}
            </a>
          ) : null}
          {showApiConnect && !supportsMcp ? (
            setupHint ? (
              <AppTooltip
                content="OAuth app credentials are missing. See details below."
                isInteractive
              >
                <span className="link-btn-primary disabled" aria-disabled="true" tabIndex={0}>
                  {connected ? "Reconnect" : "Connect"}
                </span>
              </AppTooltip>
            ) : (
              <a href={apiConnectHref} className="link-btn-primary motion-btn">
                {connected ? "Reconnect" : "Connect"}
              </a>
            )
          ) : null}
          {connected || hasError ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onPress={disconnect}
              isDisabled={pending !== null}
            >
              Disconnect
            </Button>
          ) : null}
          {showToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onPress={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : hasTokenForm && !connected ? "Add token" : "Manage"}
            </Button>
          ) : null}
        </div>
      </div>

      {connected && connectedExtra ? (
        <div className="mt-3 border-t border-border pt-3">{connectedExtra}</div>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {connected ? (
            <p className="text-sm leading-relaxed text-muted">{description}</p>
          ) : null}

          {setupHint ? (
            <p className="rounded-[var(--radius-md)] border border-warm/25 bg-warm/8 px-3 py-2.5 text-metadata leading-relaxed text-warm [overflow-wrap:anywhere]">
              {setupHint}
            </p>
          ) : null}

          {extraSetup ? (
            <div className="space-y-2">
              {extraSetupLabel ? (
                <p className="text-metadata font-medium text-muted-soft">{extraSetupLabel}</p>
              ) : null}
              {extraSetup}
            </div>
          ) : null}

          {supportsMcp && !usingMcp && showApiConnect ? (
            <div className="space-y-1.5">
              <p className="text-metadata font-medium text-muted-soft">Direct API setup (optional)</p>
              {setupHint ? (
                <span className="link-btn-outline disabled" aria-disabled="true">
                  {connected ? "Reconnect (API)" : "Connect (API)"}
                </span>
              ) : (
                <a href={apiConnectHref} className="link-btn-outline motion-btn">
                  {connected ? "Reconnect (API)" : "Connect (API)"}
                </a>
              )}
            </div>
          ) : null}

          {hasTokenForm ? (
            <div className={showPatFallback ? "space-y-1.5" : undefined}>
              {showPatFallback ? (
                <p className="text-metadata font-medium text-muted-soft">
                  Personal access token (optional fallback)
                </p>
              ) : null}
              <form onSubmit={saveSecret} className="form-inline">
                <Input
                  fullWidth
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={secretPlaceholder}
                  aria-label={`${label} token`}
                  className="h-11 border border-border bg-background/70 text-sm shadow-none"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  isDisabled={pending !== null || !secret.trim()}
                >
                  {pending === "secret" ? "Testing…" : connected ? "Replace" : "Connect"}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
