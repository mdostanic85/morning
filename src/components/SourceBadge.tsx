"use client";

import type { SourceType } from "@/domain/sourceItem";
import { Chip } from "@heroui/react/chip";
import { Tooltip } from "@heroui/react/tooltip";
import { cn } from "@/lib/utils";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  manual_transcript: "Transcript",
  gmail: "Gmail",
  calendar: "Calendar",
  drive: "Drive",
  jira: "Jira",
  confluence: "Confluence",
  granola: "Granola",
  github: "GitHub",
  figma: "Figma",
  discord: "Discord",
  git: "Git",
};

const SOURCE_TYPE_DESCRIPTION: Record<SourceType, string> = {
  manual_transcript: "Manually pasted meeting transcript",
  gmail: "Email from Gmail",
  calendar: "Meeting from Google Calendar",
  drive: "Gemini / meeting notes from Google Drive",
  jira: "Jira ticket or issue",
  confluence: "Confluence page or doc",
  granola: "Meeting note from Granola",
  github: "GitHub PR, issue, or comment",
  figma: "Figma file or comment",
  discord: "Discord message",
  git: "Local git repository activity",
};

const SOURCE_TYPE_STYLES: Record<SourceType, string> = {
  manual_transcript: "border-accent/40 bg-accent-soft-surface text-accent-strong",
  gmail: "border-pink/50 bg-pink-soft text-pink-foreground",
  calendar: "border-sky/50 bg-sky-soft text-sky-foreground",
  drive: "border-sky/45 bg-sky-soft text-sky-foreground",
  jira: "border-sky/50 bg-sky-soft text-sky-foreground",
  confluence: "border-mint/50 bg-mint-soft text-mint-foreground",
  granola: "border-sun/55 bg-sun-soft text-sun-foreground",
  github: "border-border-strong bg-surface-soft text-muted",
  figma: "border-pink/55 bg-pink-soft text-pink-foreground",
  discord: "border-accent/35 bg-accent-soft-surface text-accent-strong",
  git: "border-mint/50 bg-mint-soft text-mint-foreground",
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger>
        <Chip
          variant="tertiary"
          color="default"
          className={cn(
            "tag h-6 min-h-6 w-fit shrink-0 overflow-hidden border border-border text-foreground transition-colors font-normal cursor-default",
            SOURCE_TYPE_STYLES[sourceType] ?? "border-border-strong/60 bg-surface-soft text-muted"
          )}
        >
          {SOURCE_TYPE_LABEL[sourceType] ?? sourceType}
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
        <Tooltip.Arrow />
        {SOURCE_TYPE_DESCRIPTION[sourceType] ?? `Source: ${sourceType}`}
      </Tooltip.Content>
    </Tooltip>
  );
}
