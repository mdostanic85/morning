import type { LucideIcon } from "lucide-react";
import {
  BanIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CircleIcon,
  EyeIcon,
  Loader2Icon,
  PlayCircleIcon,
} from "lucide-react";
import { isJiraDoneStatus } from "@/lib/connectors/jiraStatus";

export interface JiraStatusVisual {
  label: string;
  icon: LucideIcon;
  triggerClassName: string;
  dotClassName: string;
}

export function jiraStatusVisual(status: string | null | undefined): JiraStatusVisual {
  if (!status?.trim()) {
    return {
      label: "Jira status",
      icon: Loader2Icon,
      triggerClassName: "border-border bg-surface-soft text-muted",
      dotClassName: "bg-muted-soft",
    };
  }

  const normalized = status.toLowerCase();

  if (isJiraDoneStatus(normalized)) {
    return {
      label: status,
      icon: CheckCircle2Icon,
      triggerClassName: "border-good/40 bg-good/[0.08] text-good hover:border-good/60 hover:bg-good/15",
      dotClassName: "bg-good",
    };
  }

  if (/in progress|in development|doing|active/i.test(normalized)) {
    return {
      label: status,
      icon: PlayCircleIcon,
      triggerClassName:
        "border-accent/40 bg-accent/[0.08] text-accent hover:border-accent/60 hover:bg-accent/15",
      dotClassName: "bg-accent",
    };
  }

  if (/review|qa|ready for/i.test(normalized)) {
    return {
      label: status,
      icon: EyeIcon,
      triggerClassName: "border-warm/40 bg-warm/[0.08] text-warm hover:border-warm/60 hover:bg-warm/15",
      dotClassName: "bg-warm",
    };
  }

  if (/block/i.test(normalized)) {
    return {
      label: status,
      icon: BanIcon,
      triggerClassName:
        "border-danger/40 bg-danger/[0.08] text-danger hover:border-danger/60 hover:bg-danger/15",
      dotClassName: "bg-danger",
    };
  }

  if (/to do|open|backlog|selected for development/i.test(normalized)) {
    return {
      label: status,
      icon: CircleIcon,
      triggerClassName: "border-border bg-surface-soft text-muted hover:bg-surface-soft/80",
      dotClassName: "bg-muted",
    };
  }

  return {
    label: status,
    icon: CircleDotIcon,
    triggerClassName: "border-border bg-surface-soft text-foreground hover:bg-surface-soft/80",
    dotClassName: "bg-muted-soft",
  };
}
