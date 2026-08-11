"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";
import { Button } from "@heroui/react/button";
import { Heading } from "@/components/Heading";

export interface GoogleSourceStatus {
  provider: string;
  label: string;
  description: string;
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
}

interface GoogleConnectionPanelProps {
  sources: GoogleSourceStatus[];
  configured: boolean;
  setupHint?: string | null;
}

export function GoogleConnectionPanel({
  sources,
  configured,
  setupHint = null,
}: GoogleConnectionPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const allConnected =
    sources.length > 0 && sources.every((source) => source.status === "connected");
  const anyConnected = sources.some((source) => source.status === "connected");

  async function disconnect(provider: string) {
    setPending(true);
    await fetch(`/api/connections/${provider}`, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  return (
    <section className="app-card px-4 py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2} visualLevel={6}>Google</Heading>
            <AppBadge
              className={cn(
                allConnected
                  ? "border-good/35 bg-good/10 text-good"
                  : anyConnected
                    ? "border-warm/35 bg-warm/10 text-warm"
                    : "border-border bg-surface-soft text-muted"
              )}
            >
              {allConnected ? "Connected" : anyConnected ? "Partly connected" : "Not connected"}
            </AppBadge>
          </div>
          <p className="mt-1 text-sm leading-snug text-muted">
            Signing in creates your Morning account. These connections are separate and only grant the read access you choose.
          </p>
          <p className="mt-1 text-metadata leading-relaxed text-muted-soft">
            Connecting authorizes Morning to read, store, and process matching Google data for your
            daily view. Review <a className="underline" href="/google-data">how Google data is used</a>.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        {sources.map((source) => (
          <div key={source.provider} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div>
              <div className="text-sm text-foreground">{source.label}</div>
              <p className="mt-0.5 text-metadata text-muted">{source.description}</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {source.status === "connected" && source.lastSync ? (
                <span className="text-metadata text-muted-soft">
                  Last sync {new Date(source.lastSync).toLocaleString()}
                </span>
              ) : null}
              <AppBadge
                className={cn(
                  source.status === "connected"
                    ? "border-good/35 bg-good/10 text-good"
                    : source.status === "error"
                      ? "border-danger/35 bg-danger/10 text-danger"
                      : "border-border bg-surface-soft text-muted"
                )}
              >
                {source.status === "connected"
                  ? "Connected"
                  : source.status === "error"
                    ? "Needs attention"
                    : "Not connected"}
              </AppBadge>
              {configured ? (
                <a
                  href={`/api/connections/${source.provider}/connect`}
                  className="link-btn-outline motion-btn"
                >
                  {source.status === "connected" ? "Reconnect" : "Connect"}
                </a>
              ) : (
                <AppTooltip
                  content="Google OAuth credentials are missing. See details below."
                  isInteractive
                >
                  <span className="link-btn-outline disabled" aria-disabled="true" tabIndex={0}>
                    Connect
                  </span>
                </AppTooltip>
              )}
              {source.status === "connected" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onPress={() => disconnect(source.provider)}
                  isDisabled={pending}
                >
                  {pending ? "Working..." : "Disconnect"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {setupHint ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-warm/25 bg-warm/8 px-3 py-2.5 text-metadata leading-relaxed text-warm">
          {setupHint}
        </p>
      ) : null}
    </section>
  );
}
