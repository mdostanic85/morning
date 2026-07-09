"use client";

import type { SourceType } from "@/domain/sourceItem";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  manual_transcript: "Transcript",
  gmail: "Gmail",
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
  jira: "Jira ticket or issue",
  confluence: "Confluence page or doc",
  granola: "Meeting note from Granola",
  github: "GitHub PR, issue, or comment",
  figma: "Figma file or comment",
  discord: "Discord message",
  git: "Local git repository activity",
};

const SOURCE_TYPE_STYLES: Record<SourceType, string> = {
  manual_transcript:
    "border-violet-400/45 bg-violet-500/12 text-violet-800 dark:border-violet-400/35 dark:bg-violet-500/18 dark:text-violet-200",
  gmail:
    "border-rose-400/45 bg-rose-500/12 text-rose-900 dark:border-rose-400/35 dark:bg-rose-500/18 dark:text-rose-200",
  jira:
    "border-sky-400/45 bg-sky-500/12 text-sky-900 dark:border-sky-400/35 dark:bg-sky-500/18 dark:text-sky-200",
  confluence:
    "border-teal-400/45 bg-teal-500/12 text-teal-900 dark:border-teal-400/35 dark:bg-teal-500/18 dark:text-teal-200",
  granola:
    "border-amber-400/45 bg-amber-500/12 text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/18 dark:text-amber-100",
  github:
    "border-slate-400/45 bg-slate-500/12 text-slate-900 dark:border-slate-400/35 dark:bg-slate-500/18 dark:text-slate-200",
  figma:
    "border-fuchsia-400/45 bg-fuchsia-500/12 text-fuchsia-900 dark:border-fuchsia-400/35 dark:bg-fuchsia-500/18 dark:text-fuchsia-200",
  discord:
    "border-indigo-400/45 bg-indigo-500/12 text-indigo-900 dark:border-indigo-400/35 dark:bg-indigo-500/18 dark:text-indigo-200",
  git:
    "border-emerald-400/45 bg-emerald-500/12 text-emerald-900 dark:border-emerald-400/35 dark:bg-emerald-500/18 dark:text-emerald-200",
};

export function SourceBadge({ sourceType }: { sourceType: SourceType }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={`font-normal cursor-default ${SOURCE_TYPE_STYLES[sourceType] ?? "border-border-strong/60 bg-surface-soft text-muted"}`}
          >
            {SOURCE_TYPE_LABEL[sourceType] ?? sourceType}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {SOURCE_TYPE_DESCRIPTION[sourceType] ?? `Source: ${sourceType}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
