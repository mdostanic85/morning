import { CalendarIcon, FlagIcon, UserIcon } from "lucide-react";
import { Chip } from "@heroui/react/chip";
import type { JiraInlineMetadata } from "@/lib/connectors/jiraText";
import { jiraStatusVisual } from "@/lib/connectors/jiraStatusVisual";
import { cn } from "@/lib/utils";

function priorityBadgeClass(priority: string): string {
  const normalized = priority.toLowerCase();
  if (/(highest|critical|blocker|p0)/.test(normalized)) {
    return "border-danger/40 bg-danger/8 text-danger";
  }
  if (/(high|p1)/.test(normalized)) {
    return "border-warm/40 bg-warm/8 text-warm";
  }
  if (/(medium|normal|p2)/.test(normalized)) {
    return "border-border bg-surface-soft text-muted";
  }
  if (/(low|minor|trivial|p3)/.test(normalized)) {
    return "border-border/70 bg-surface-soft/70 text-muted-soft";
  }
  return "border-border bg-surface-soft text-muted";
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
        <Chip
          variant="tertiary"
          color="default"
          className={cn(
            "tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border text-foreground transition-colors gap-1.5 font-normal",
            statusVisual.triggerClassName
          )}
        >
          {StatusIcon ? <StatusIcon className="size-3 shrink-0" aria-hidden /> : null}
          {metadata.status}
        </Chip>
      ) : null}

      {metadata.priority ? (
        <Chip
          variant="tertiary"
          color="default"
          className={cn(
            "tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border text-foreground transition-colors gap-1.5 font-normal",
            priorityBadgeClass(metadata.priority)
          )}
        >
          <FlagIcon className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="text-muted-soft">Priority</span>
          <span>{metadata.priority}</span>
        </Chip>
      ) : null}

      {metadata.assignee ? (
        <Chip
          variant="tertiary"
          color="default"
          className="tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border bg-surface-soft text-muted transition-colors gap-1.5 font-normal"
        >
          <UserIcon className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="text-muted-soft">Assignee</span>
          <span className="text-foreground">{metadata.assignee}</span>
        </Chip>
      ) : null}

      {metadata.reporter ? (
        <Chip
          variant="tertiary"
          color="default"
          className="tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border/70 bg-surface-soft/60 text-muted transition-colors gap-1.5 font-normal"
        >
          <UserIcon className="size-3 shrink-0 opacity-60" aria-hidden />
          <span className="text-muted-soft">Reporter</span>
          <span>{metadata.reporter}</span>
        </Chip>
      ) : null}

      {metadata.dueDate ? (
        <Chip
          variant="tertiary"
          color="default"
          className="tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border bg-surface-soft text-muted transition-colors gap-1.5 font-normal"
        >
          <CalendarIcon className="size-3 shrink-0 opacity-70" aria-hidden />
          <span className="text-muted-soft">Due</span>
          <span className="text-foreground">{formatDueDate(metadata.dueDate)}</span>
        </Chip>
      ) : null}
    </div>
  );
}
