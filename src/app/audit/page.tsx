import Link from "next/link";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { getAuditLog } from "@/services/hydra";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const logs = await getAuditLog(200);
  return (
    <div className="space-y-7">
      <header>
        <SettingsBackLink section="Activity log" />
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em]">Activity log</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Manual runs, schedule/config changes, outcomes, and delivery metadata. Source content and
          secrets are intentionally excluded.
        </p>
      </header>
      <div className="app-card overflow-hidden">
        <div className="divide-y divide-border">
          {logs.length === 0 ? (
            <p className="p-6 text-sm text-muted">No audit events yet.</p>
          ) : (
            logs.map((log) => (
              <article
                key={log.id}
                className="grid gap-2 p-5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
              >
                <time className="font-mono text-xs text-muted">
                  {new Date(log.createdAt).toLocaleString()}
                </time>
                <div>
                  <p className="font-medium">{log.action.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-muted">
                    {log.entityType}
                    {log.entityId ? ` #${log.entityId}` : ""} · {log.actor}
                  </p>
                </div>
                {log.entityType === "report_run" && log.entityId ? (
                  <Link
                    href={`/reports/${log.entityId}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Open run
                  </Link>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
