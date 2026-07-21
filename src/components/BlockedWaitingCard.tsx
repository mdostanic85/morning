"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Clock3 } from "lucide-react";
import type { DailyBriefV2 } from "@/domain/dailyBrief";
import { AppBadge, type AppBadgeTone } from "@/components/AppBadge";
import { OwnershipDecisionButtons } from "@/components/OwnershipDecisionButtons";
import { TaskActionButtons } from "@/components/TaskActionButtons";
import { cn } from "@/lib/utils";

function StatusBadge({
  label,
  tone,
  Icon,
}: {
  label: string;
  tone: AppBadgeTone;
  Icon: typeof Clock3;
}) {
  return (
    <AppBadge tone={tone} icon={<Icon className="size-3.5" aria-hidden />}>
      {label}
    </AppBadge>
  );
}

/** Ownership-unclear items say "confirm this is yours"; waiting items name what they're blocked on. */
function blockedWaitingActionCopy(reason: string): string {
  if (/^waiting on/i.test(reason)) return "Follow up, then mark done";
  return "Confirm this is yours, or mark it not mine";
}

/**
 * Same visual family as `SecondaryTaskCard` (`brief-secondary-*` classes),
 * but interactive: "Show actions" expands the same confirmation-gated
 * `TaskActionButtons` used on the task detail page, so a blocked/unclear
 * item can actually be resolved right here instead of only linking away.
 */
export function BlockedWaitingCard({ item }: { item: DailyBriefV2["blockedWaiting"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const isWaiting = /^waiting on/i.test(item.reason);
  const badge = isWaiting
    ? { label: "Waiting", tone: "warning" as AppBadgeTone, Icon: Clock3 }
    : { label: "Clarify ownership", tone: "warning" as AppBadgeTone, Icon: AlertTriangle };

  return (
    <div className="brief-secondary-card">
      <div className="brief-secondary-badges">
        <StatusBadge label={badge.label} tone={badge.tone} Icon={badge.Icon} />
        {item.jiraKey ? <AppBadge tone="neutral">{item.jiraKey}</AppBadge> : null}
      </div>

      {item.taskId != null ? (
        <Link href={`/tasks/${item.taskId}`} className="brief-secondary-title-link">
          <h3 className="brief-secondary-title">{item.title}</h3>
        </Link>
      ) : (
        <h3 className="brief-secondary-title">{item.title}</h3>
      )}

      <p className="brief-secondary-reason">{item.reason}</p>
      {!isWaiting && item.taskId != null ? (
        <div className="mt-3">
          <OwnershipDecisionButtons taskId={item.taskId} compact />
        </div>
      ) : (
        <p className="brief-secondary-next">
          <span className="brief-secondary-next-label">Action: </span>
          {blockedWaitingActionCopy(item.reason)}
        </p>
      )}

      {isWaiting && item.taskId != null ? (
        <>
          <button
            type="button"
            className="brief-secondary-actions-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "Hide actions" : "Show actions"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
          {expanded ? (
            <div className="brief-secondary-actions">
              <TaskActionButtons
                taskId={item.taskId}
                linkedJiraKey={item.jiraKey}
                embedded
                showDelete={false}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
