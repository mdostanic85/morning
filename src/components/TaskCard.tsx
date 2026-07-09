"use client";

import type { WorkTaskStatus } from "@/domain/workTask";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import {
  ZapIcon,
  ChevronRightIcon,
  ClockIcon,
  PauseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CheckIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DailyFocusCard } from "./DailyFocusCard";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";
import { SourceBadge } from "./SourceBadge";
import { TaskActionButtons } from "./TaskActionButtons";
import { TaskWorkContext } from "./TaskWorkContext";
import { cn } from "@/lib/utils";

export interface TaskCardProps {
  id: number;
  title: string;
  reason: string;
  nextAction: string;
  doneCriteria: string[];
  evidence: EvidenceItem[];
  status: WorkTaskStatus;
  priorityScore?: number | null;
  confidence?: number | null;
  waitingOn?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  projectName?: string | null;
  primary?: boolean;
  latestVerificationReport?: VerificationReport | null;
  latestSyncReviewReport?: SyncReviewReport | null;
  figmaFrameUrl?: string | null;
  localRepoPath?: string | null;
  githubRepo?: string | null;
}

const STATUS_DESCRIPTION: Record<WorkTaskStatus, string> = {
  now: "Currently in focus — you are actively working on this",
  next: "Up next when your current focus clears",
  later: "On the radar but not urgent today",
  waiting: "Blocked — waiting on someone else or an external event",
  tomorrow: "Scheduled to start tomorrow",
  unclear: "Needs your decision before work can begin",
  done: "Completed",
};

const STATUS_ICON: Record<WorkTaskStatus, LucideIcon> = {
  now: ZapIcon,
  next: ChevronRightIcon,
  later: ClockIcon,
  waiting: PauseIcon,
  tomorrow: CalendarIcon,
  unclear: CircleHelpIcon,
  done: CheckIcon,
};

const STATUS_BADGE: Record<WorkTaskStatus, string> = {
  now: "border-now/45 bg-now/10 text-now hover:bg-now/10",
  next: "border-accent/40 bg-accent/8 text-accent-strong hover:bg-accent/8",
  later: "border-border bg-surface-soft text-muted hover:bg-surface-soft",
  waiting: "border-waiting/40 bg-waiting/8 text-waiting hover:bg-waiting/8",
  tomorrow: "border-tomorrow/40 bg-tomorrow/8 text-tomorrow hover:bg-tomorrow/8",
  unclear: "border-unclear/40 bg-unclear/8 text-unclear hover:bg-unclear/8",
  done: "border-good/40 bg-good/8 text-good hover:bg-good/8",
};

export function TaskCard({
  id,
  title,
  reason,
  nextAction,
  doneCriteria,
  evidence,
  status,
  priorityScore,
  confidence,
  waitingOn,
  owner,
  dueDate,
  projectName,
  primary = false,
  latestVerificationReport = null,
  latestSyncReviewReport = null,
  figmaFrameUrl = null,
  localRepoPath = null,
  githubRepo = null,
}: TaskCardProps) {
  const sourceTypes = Array.from(
    new Set(evidence.map((item) => item.sourceType).filter((t) => t != null))
  );

  if (primary) {
    const linkedJiraKey = title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
    const linkedJiraUrl =
      evidence.find((entry) => entry.sourceType === "jira" && entry.sourceUrl)?.sourceUrl ?? null;

    return (
      <DailyFocusCard
        item={{
          title,
          reason,
          nextAction,
          doneCriteria,
          evidence,
          linkedTaskId: id,
          linkedJiraKey,
          linkedJiraUrl,
          latestVerificationReport,
          latestSyncReviewReport,
          figmaFrameUrl,
          localRepoPath,
          githubRepo,
          status,
          projectName,
          waitingOn,
        }}
      />
    );
  }

  const linkedJiraKey = title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-surface border ring-0",
        primary
          ? "border-warm/25 bg-surface-raised shadow-[var(--shadow)]"
          : status === "unclear"
            ? "border-unclear/30 bg-unclear/[0.04] shadow-none"
            : "border-border bg-surface/90 shadow-[var(--shadow-soft)]"
      )}
    >
      {primary ? <div className="horizon" aria-hidden /> : null}

      <CardContent className={cn(primary ? "p-7 sm:p-9" : "p-6 sm:p-7")}>
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "leading-snug tracking-tight",
                primary
                  ? "font-display text-3xl font-semibold sm:text-4xl"
                  : "font-display text-xl font-medium"
              )}
            >
              {title}
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="outline"
                      className={cn("cursor-default gap-1 capitalize", STATUS_BADGE[status])}
                    >
                      {(() => {
                        const Icon = STATUS_ICON[status];
                        return <Icon className="size-3" aria-hidden />;
                      })()}
                      {status}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{STATUS_DESCRIPTION[status]}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {sourceTypes.map((sourceType) => (
                <SourceBadge key={sourceType} sourceType={sourceType} />
              ))}
              {projectName ? (
                <span className="text-[13px] text-muted">{projectName}</span>
              ) : (
                <span className="text-[13px] font-medium text-waiting">Unassigned project</span>
              )}
              {priorityScore != null ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="cursor-default font-mono text-[12px] text-muted-soft">
                        {priorityScore.toFixed(2)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Priority score — higher = more urgent.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            {confidence != null ? (
              <ConfidenceBadge level={confidence} />
            ) : (
              <Badge variant="outline" className="border-border/50 text-muted-soft">
                —
              </Badge>
            )}
          </div>
        </div>

        <section className="mt-6 space-y-5">
          <div>
            <p className="eyebrow text-foreground/70">What this means for you</p>
            <p
              className={cn(
                "mt-2 leading-relaxed",
                primary ? "text-[15px]" : "text-[14px]",
                status === "unclear"
                  ? "rounded-xl border border-unclear/25 bg-unclear/8 px-4 py-3 font-medium text-unclear"
                  : "text-muted"
              )}
            >
              {status === "unclear" ? <span className="font-semibold">Unclear — </span> : null}
              {reason}
            </p>
          </div>

          {waitingOn ? (
            <p className="rounded-xl border border-waiting/25 bg-waiting/8 px-4 py-3 text-[14px] font-medium text-waiting">
              Waiting on {waitingOn}
            </p>
          ) : null}

          <div
            className={cn(
              "rounded-2xl border border-accent/20 bg-accent/8",
              primary ? "px-6 py-5" : "px-5 py-4"
            )}
          >
            <p className="eyebrow text-accent">What to do now</p>
            <p
              className={cn(
                "mt-2 font-medium leading-snug",
                primary ? "text-[17px]" : "text-[15px]"
              )}
            >
              {nextAction}
            </p>
          </div>

          <div>
            <p className="eyebrow">Done when</p>
            {doneCriteria.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {doneCriteria.map((label) => (
                  <li key={label} className="flex items-start gap-3 text-[14px] leading-relaxed">
                    <span
                      className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-soft"
                      aria-hidden
                    />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[14px] font-medium text-danger">
                No done criteria — define what &ldquo;done&rdquo; means before starting.
              </p>
            )}
          </div>

          <div>
            <EvidencePanel items={evidence} defaultOpen={primary} />
          </div>

          <TaskWorkContext
            taskId={id}
            figmaFrameUrl={figmaFrameUrl}
            localRepoPath={localRepoPath}
            githubRepo={githubRepo}
            latestSyncReviewReport={latestSyncReviewReport}
          />

          {(owner || dueDate) ? (
            <p className="text-[13px] text-muted">
              {owner ? `Owner: ${owner}` : null}
              {owner && dueDate ? " · " : null}
              {dueDate ? `Due ${new Date(dueDate).toLocaleDateString()}` : null}
            </p>
          ) : null}

          <TaskActionButtons
            taskId={id}
            linkedJiraKey={linkedJiraKey}
            latestVerificationReport={latestVerificationReport}
            latestSyncReviewReport={latestSyncReviewReport}
          />
        </section>
      </CardContent>
    </Card>
  );
}
