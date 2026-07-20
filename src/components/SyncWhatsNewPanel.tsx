import Link from "next/link";
import type { SyncNotification, SyncWhatsNew } from "@/lib/imports/syncWhatsNew";

const KIND_LABEL: Record<SyncNotification["kind"], string> = {
  jira_done: "Jira",
  gemini_knowledge: "Gemini",
};

function NotificationRow({ notification }: { notification: SyncNotification }) {
  return (
    <li className="app-card space-y-1.5 p-4">
      <p className="text-[14px] font-medium uppercase tracking-wide text-muted">
        {KIND_LABEL[notification.kind]}
      </p>
      <p className="text-[14px] font-medium leading-snug text-foreground">{notification.title}</p>
      <p className="text-[14px] leading-relaxed text-muted">{notification.detail}</p>
      {notification.href ? (
        <Link
          href={notification.href}
          className="inline-block text-[14px] text-accent underline-offset-2 hover:underline"
        >
          {notification.hrefLabel ?? "Open"}
        </Link>
      ) : null}
    </li>
  );
}

export function SyncWhatsNewPanel({ whatsNew }: { whatsNew: SyncWhatsNew }) {
  if (!whatsNew.hasNew) return null;

  return (
    <div className="mt-3 w-full max-w-lg space-y-2">
      <p className="text-[14px] font-medium uppercase tracking-wide text-muted">What&apos;s new</p>
      <ul className="space-y-2">
        {whatsNew.notifications.map((notification) => (
          <NotificationRow
            key={`${notification.kind}-${notification.title}`}
            notification={notification}
          />
        ))}
      </ul>
    </div>
  );
}
