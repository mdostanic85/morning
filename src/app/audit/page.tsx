import Link from "next/link";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { getAuditLog } from "@/services/hydra";
import { Heading } from "@/components/Heading";

export const dynamic = "force-dynamic";

function formatAuditAction(action: string): string {
  const label = action.replaceAll("_", " ").replaceAll(".", " ");
  return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

function formatAuditEntity(entityType: string): string {
  return entityType.replaceAll("_", " ");
}

export default async function AuditPage() {
  const logs = await getAuditLog(200);
  return (
    <div className="space-y-7">
      <header>
        <SettingsBackLink section="Trust trail" />
        <Heading level={1} visualLevel={2} className="mt-2">Trust trail</Heading>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Review report runs, schedule changes, outcomes, and delivery details. Source content and
          credentials are never shown here.
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
                <time className="font-utility text-metadata text-muted">
                  {new Date(log.createdAt).toLocaleString()}
                </time>
                <div>
                  <p className="font-medium">{formatAuditAction(log.action)}</p>
                  <p className="mt-1 text-metadata text-muted">
                    {formatAuditEntity(log.entityType)}
                    {log.entityId ? ` #${log.entityId}` : ""}, {log.actor === "local-user" ? "created locally" : log.actor}
                  </p>
                </div>
                {log.entityType === "report_run" && log.entityId ? (
                  <Link
                    href={`/reports/${log.entityId}`}
                    className="inline-flex min-h-11 items-center text-metadata text-accent hover:underline"
                  >
                    Open report
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
