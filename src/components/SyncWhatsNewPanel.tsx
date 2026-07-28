"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import type { SyncNotification, SyncWhatsNew } from "@/lib/imports/syncWhatsNew";
import { Heading } from "@/components/Heading";

const KIND_LABEL: Record<SyncNotification["kind"], string> = {
  jira_done: "Jira",
  gemini_knowledge: "Gemini",
};

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: SyncNotification;
  onOpen: () => void;
}) {
  return (
    <li className="space-y-2 border-t border-border/70 px-5 py-4 first:border-t-0">
      <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-muted">
        {KIND_LABEL[notification.kind]}
      </p>
      <p className="text-base font-semibold leading-snug text-foreground">
        {notification.title}
      </p>
      <p className="line-clamp-3 text-[14px] leading-relaxed text-muted">
        {notification.detail}
      </p>
      {notification.href ? (
        <Link
          href={notification.href}
          onClick={onOpen}
          className="inline-flex min-h-9 items-center rounded-lg bg-action-primary px-3.5 py-2 text-[14px] font-semibold text-action-primary-foreground transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {notification.hrefLabel ?? "View update"}
        </Link>
      ) : null}
    </li>
  );
}

export function SyncWhatsNewPanel({
  whatsNew,
  onDismiss,
}: {
  whatsNew: SyncWhatsNew;
  onDismiss: () => void;
}) {
  if (!whatsNew.hasNew) return null;

  return (
    <aside
      aria-labelledby="sync-whats-new-title"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[70] mx-auto w-auto max-w-md overflow-hidden rounded-[1.5rem] border border-border bg-overlay text-overlay-foreground shadow-[0_24px_70px_rgba(7,15,31,0.28)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:mx-0 sm:w-[26rem]"
    >
      <div
        aria-hidden
        className="h-1 bg-[linear-gradient(90deg,var(--gradient-violet),var(--gradient-blue),var(--gradient-cyan))]"
      />
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft-surface text-accent-strong">
          <Sparkles className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-muted">
            Sync update
          </p>
          <Heading
            level={2}
            visualLevel={4}
            id="sync-whats-new-title"
            className="mt-0.5"
          >
            What&apos;s new
          </Heading>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss sync updates"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </header>
      <ul className="max-h-[min(28rem,60vh)] overflow-y-auto">
        {whatsNew.notifications.map((notification) => (
          <NotificationRow
            key={`${notification.kind}-${notification.title}`}
            notification={notification}
            onOpen={onDismiss}
          />
        ))}
      </ul>
      <footer className="flex justify-end border-t border-border/70 bg-surface-soft/55 px-5 py-3">
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 rounded-lg px-3.5 py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Dismiss
        </button>
      </footer>
    </aside>
  );
}
