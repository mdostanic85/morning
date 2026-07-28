"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppBadge } from "@/components/AppBadge";
import { Button } from "@heroui/react/button";
import { Heading } from "@/components/Heading";

export interface GoogleSourceStatus {
  provider: string;
  label: string;
  status: "connected" | "disconnected" | "error";
  lastSync: string | null;
  hidden?: boolean;
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

  const visibleSources = sources.filter((source) => !source.hidden);
  const allConnected =
    visibleSources.length > 0 && visibleSources.every((source) => source.status === "connected");
  const anyConnected = visibleSources.some((source) => source.status === "connected");

  async function disconnectAll() {
    setPending(true);
    await Promise.all(
      sources
        .filter((s) => s.status !== "disconnected")
        .map((s) => fetch(`/api/connections/${s.provider}`, { method: "DELETE" }))
    );
    setPending(false);
    router.refresh();
  }

  const connectHref = "/api/connections/gmail/connect?link=google";

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
            One sign-in authorizes read-only Gemini meeting notes and Google Calendar.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
          {configured ? (
            <a
              href={connectHref}
              className={
                anyConnected ? "link-btn-outline motion-btn" : "link-btn-primary motion-btn"
              }
            >
              {anyConnected ? "Reconnect Google" : "Connect Google"}
            </a>
          ) : (
            <span
              className="link-btn-primary disabled"
              aria-disabled="true"
              title="Google OAuth credentials are missing. See details below."
            >
              Connect Google
            </span>
          )}
          {anyConnected ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onPress={disconnectAll}
              isDisabled={pending}
            >
              {pending ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        {visibleSources.map((source) => (
          <div key={source.provider} className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <span className="text-sm text-foreground">{source.label}</span>
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
