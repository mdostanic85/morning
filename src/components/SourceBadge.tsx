import type { SourceType } from "@/domain/sourceItem";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  manual_transcript: "Pasted transcript",
  gmail: "Gmail",
  jira: "Jira",
  confluence: "Confluence",
  granola: "Granola",
  github: "GitHub",
  figma: "Figma",
  discord: "Discord",
  git: "Git",
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
      {SOURCE_TYPE_LABEL[sourceType] ?? sourceType}
    </span>
  );
}
