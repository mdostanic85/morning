import type { SourceType } from "@/domain/sourceItem";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { AppTooltip } from "@/components/AppTooltip";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  manual_transcript: "Transcript",
  gmail: "Gmail",
  calendar: "Calendar",
  drive: "Gemini",
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

export function sourceTypeDescription(sourceType: SourceType): string {
  return SOURCE_TYPE_DESCRIPTION[sourceType] ?? `Source: ${sourceType}`;
}

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  return (
    <AppTooltip content={sourceTypeDescription(sourceType)}>
      <AppBadge tone={SOURCE_TYPE_TONE[sourceType] ?? "neutral"} className="font-normal">
        {SOURCE_TYPE_LABEL[sourceType] ?? sourceType}
      </AppBadge>
    </AppTooltip>
  );
}
