import { CalendarIcon, FlagIcon, UserIcon } from "lucide-react";
import type { JiraInlineMetadata } from "@/lib/connectors/jiraText";
import { jiraStatusVisual } from "@/lib/connectors/jiraStatusVisual";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { cn } from "@/lib/utils";

function priorityTone(priority: string): AppBadgeTone {
  const normalized = priority.toLowerCase();
  if (/(highest|critical|blocker|p0)/.test(normalized)) return "danger";
  if (/(high|p1)/.test(normalized)) return "warning";
  if (/(low|minor|trivial|p3)/.test(normalized)) return "neutral";
  return "default";
}

function formatDueDate(value: string): string {
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!dateOnly) return value;
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function JiraMetadataBadges({
  metadata,
  className,
}: {
  metadata: JiraInlineMetadata;
  className?: string;
}) {
  const hasValues = Object.values(metadata).some(Boolean);
  if (!hasValues) return null;

  const statusVisual = metadata.status ? jiraStatusVisual(metadata.status) : null;
  const StatusIcon = statusVisual?.icon;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {metadata.status && statusVisual ? (
        <AppBadge
          tone="default"
          className={cn("font-normal gap-1.5", statusVisual.triggerClassName)}
          icon={StatusIcon ? <StatusIcon className="size-3.5 shrink-0" aria-hidden /> : null}
        >
          {metadata.status}
        </AppBadge>
      ) : null}

      {metadata.priority ? (
        <AppBadge
          tone={priorityTone(metadata.priority)}
          className="font-normal gap-1.5"
          icon={<FlagIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />}
        >
          <span className="text-muted-soft">Priority</span>
          <span>{metadata.priority}</span>
        </AppBadge>
      ) : null}

      {metadata.assignee ? (
        <AppBadge
          tone="neutral"
          className="font-normal gap-1.5"
          icon={<UserIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />}
        >
          <span className="text-muted-soft">Assignee</span>
          <span className="text-foreground">{metadata.assignee}</span>
        </AppBadge>
      ) : null}

      {metadata.reporter ? (
        <AppBadge
          tone="neutral"
          className="font-normal gap-1.5 opacity-90"
          icon={<UserIcon className="size-3.5 shrink-0 opacity-60" aria-hidden />}
        >
          <span className="text-muted-soft">Reporter</span>
          <span>{metadata.reporter}</span>
        </AppBadge>
      ) : null}

      {metadata.dueDate ? (
        <AppBadge
          tone="neutral"
          className="font-normal gap-1.5"
          icon={<CalendarIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />}
        >
          <span className="text-muted-soft">Due</span>
          <span className="text-foreground">{formatDueDate(metadata.dueDate)}</span>
        </AppBadge>
      ) : null}
    </div>
  );
}
