"use client";

import type { SourceType } from "@/domain/sourceItem";
import { Tooltip } from "@heroui/react/tooltip";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";

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

const SOURCE_TYPE_TONE: Record<SourceType, AppBadgeTone> = {
  manual_transcript: "accent",
  gmail: "pink",
  calendar: "sky",
  drive: "sky",
  jira: "sky",
  confluence: "mint",
  granola: "sun",
  github: "neutral",
  figma: "pink",
  discord: "accent",
  git: "mint",
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  return (
    <Tooltip delay={400}>
      <Tooltip.Trigger>
        <AppBadge tone={SOURCE_TYPE_TONE[sourceType] ?? "neutral"} className="font-normal">
          {SOURCE_TYPE_LABEL[sourceType] ?? sourceType}
        </AppBadge>
      </Tooltip.Trigger>
      <Tooltip.Content
        placement="top"
        showArrow
        className="max-w-xs bg-foreground px-3 py-1.5 text-sm text-background"
      >
        <Tooltip.Arrow />
        {SOURCE_TYPE_DESCRIPTION[sourceType] ?? `Source: ${sourceType}`}
      </Tooltip.Content>
    </Tooltip>
  );
}
