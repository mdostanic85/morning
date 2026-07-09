"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      toast.success("Connected.");
    } else {
      toast.error(data.error ?? "Connection failed.");
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
    hasTokenForm || (supportsMcp && !usingMcp) || Boolean(setupHint && !supportsMcp);
  const errorText = typeof metadata?.error === "string" ? metadata.error : null;

  return (
    <section className="card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{label}</h3>
            <span className={cn("tag", statusStyle)}>{statusLabel}</span>
            {usingMcp ? (
              <span className="tag border-border bg-surface-soft text-muted">MCP</span>
            ) : null}
          </div>
          {!connected ? (
            <p className="mt-1 text-sm leading-snug text-muted line-clamp-1">{description}</p>
          ) : lastSync ? (
            <p className="mt-1 text-xs text-muted-soft">
              Last sync {new Date(lastSync).toLocaleString()}
            </p>
          ) : sharedMcpNote ? (
            <p className="mt-1 text-xs text-muted-soft">{sharedMcpNote}</p>
          ) : typeof metadata?.workRepository === "string" &&
            typeof metadata?.workBranch === "string" ? (
            <p className="mt-1 text-xs text-muted-soft">
              {metadata.workRepository} @ {metadata.workBranch}
            </p>
          ) : null}
          {errorText ? <p className="mt-1 text-sm text-danger">{errorText}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {mcpHref ? (
            <a
              href={mcpHref}
              className={
                usingMcp
                  ? buttonVariants({ variant: "outline", size: "sm" })
                  : buttonVariants({ size: "sm" })
              }
            >
              {mcpButtonLabel}
            </a>
          ) : null}
          {showApiConnect && !supportsMcp ? (
            setupHint ? (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "cursor-not-allowed opacity-45"
                )}
                aria-disabled="true"
                title="OAuth app credentials are missing — see details below."
              >
                {connected ? "Reconnect" : "Connect"}
              </span>
            ) : (
              <a href={apiConnectHref} className={buttonVariants({ size: "sm" })}>
                {connected ? "Reconnect" : "Connect"}
              </a>
            )
          ) : null}
          {connected || hasError ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={disconnect}
              disabled={pending !== null}
            >
              Disconnect
            </Button>
          ) : null}
          {showToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide" : hasTokenForm && !connected ? "Add token" : "Manage"}
            </Button>
          ) : null}
        </div>
      </div>

      {connected && connectedExtra ? (
        <div className="mt-4 border-t border-border pt-4">{connectedExtra}</div>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {connected ? (
            <p className="text-sm leading-relaxed text-muted">{description}</p>
          ) : null}

          {setupHint ? (
            <p className="rounded-lg border border-warm/25 bg-warm/8 px-3 py-2 text-sm leading-relaxed text-warm">
              {setupHint}
            </p>
          ) : null}

          {supportsMcp && !usingMcp && showApiConnect ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-soft">
                Direct API setup (optional)
              </p>
              {setupHint ? (
                <span
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "cursor-not-allowed opacity-45"
                  )}
                  aria-disabled="true"
                >
                  {connected ? "Reconnect (API)" : "Connect (API)"}
                </span>
              ) : (
                <a
                  href={apiConnectHref}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {connected ? "Reconnect (API)" : "Connect (API)"}
                </a>
              )}
            </div>
          ) : null}

          {hasTokenForm ? (
            <div className={showPatFallback ? "space-y-2" : undefined}>
              {showPatFallback ? (
                <p className="text-xs font-medium text-muted-soft">
                  Personal access token (optional fallback)
                </p>
              ) : null}
              <form onSubmit={saveSecret} className="form-inline">
              <Input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={secretPlaceholder}
                aria-label={`${label} token`}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={pending !== null || !secret.trim()}
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
