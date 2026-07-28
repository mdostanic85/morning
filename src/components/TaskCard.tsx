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
import { Card } from "@heroui/react/card";
import { Tooltip } from "@heroui/react/tooltip";
import { AppBadge } from "./AppBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { DailyFocusCard } from "./DailyFocusCard";
import { EvidencePanel, type EvidenceItem } from "./EvidencePanel";
import { ReasonText } from "./ReasonText";
import { LinkifiedText } from "./LinkifiedText";
import { SourceBadge } from "./SourceBadge";
import { TaskActionButtons } from "./TaskActionButtons";
import { TaskWorkContext } from "./TaskWorkContext";
import { cn } from "@/lib/utils";
import { humanizeReason } from "@/lib/tasks/humanizeReason";
import { Heading, type HeadingLevel } from "./Heading";

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
 headingLevel?: HeadingLevel;
}

const STATUS_DESCRIPTION: Record<WorkTaskStatus, string> = {
 now: "In focus. You are actively working on this.",
 next: "Up next when your current focus clears",
 later: "On the radar but not for today",
 waiting: "Blocked. Waiting on someone else.",
 tomorrow: "Scheduled for tomorrow",
 unclear: "Needs your input before work can begin",
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
 now: "border-now/45 bg-now/10 text-now",
 next: "border-accent/40 bg-accent/8 text-accent-strong",
 later: "border-border bg-surface-soft text-muted",
 waiting: "border-waiting/40 bg-waiting/8 text-waiting",
 tomorrow: "border-tomorrow/40 bg-tomorrow/8 text-tomorrow",
 unclear: "border-unclear/40 bg-unclear/8 text-unclear",
 done: "border-good/40 bg-good/8 text-good",
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
 headingLevel = 2,
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
 confidence,
 }}
 />
 );
 }

 const linkedJiraKey = title.match(/^([A-Z][A-Z0-9]+-\d+)\b/)?.[1] ?? null;
 const linkedJiraUrl =
 evidence.find((entry) => entry.sourceType === "jira" && entry.sourceUrl)?.sourceUrl ?? null;
 const linkifyOptions = { jiraKey: linkedJiraKey, jiraUrl: linkedJiraUrl };
 const displayReason = humanizeReason(reason, title);

 return (
      <Card
        className={cn(
          "task-card overflow-hidden rounded-surface border ring-0",
 primary
 ? "border-[var(--card-shell-warning-border)] bg-surface-raised"
 : status === "unclear"
 ? "border-[var(--card-shell-danger-border)] bg-unclear/[0.04] shadow-none"
 : "border-[var(--card-shell-border)] bg-surface/90"
 )}
 >
 {primary ? <div className="horizon" aria-hidden /> : null}

 <Card.Content className={cn(primary ? "p-7 sm:p-9" : "p-6 sm:p-7")}>
 <div className="flex items-start justify-between gap-5">
 <div className="min-w-0 flex-1">
 <Heading level={headingLevel} visualLevel={primary ? 2 : 4}>
 {title}
 </Heading>

 <div className="mt-3 flex flex-wrap items-center gap-2">
 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <AppBadge
 className={cn("capitalize font-normal", STATUS_BADGE[status])}
 icon={(() => {
 const Icon = STATUS_ICON[status];
 return <Icon className="size-3.5" aria-hidden />;
 })()}
 >
 {status}
 </AppBadge>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-sm text-background">
 <Tooltip.Arrow />
 {STATUS_DESCRIPTION[status]}
 </Tooltip.Content>
 </Tooltip>
 {sourceTypes.map((sourceType) => (
 <SourceBadge key={sourceType} sourceType={sourceType} />
 ))}
 {projectName ? (
 <span className="text-sm text-muted">{projectName}</span>
 ) : (
 <span className="text-sm font-medium text-waiting">Unassigned project</span>
 )}
 {priorityScore != null ? (
 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <span className="cursor-default font-utility text-sm text-muted-soft">
 {priorityScore.toFixed(2)}
 </span>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-sm text-background">
 <Tooltip.Arrow />
 Priority score. A higher score means the task is more urgent.
 </Tooltip.Content>
 </Tooltip>
 ) : null}
 </div>
 </div>
 </div>

 <section className="mt-6 space-y-5">
 <div>
 <p className="eyebrow text-foreground/70">Why this matters</p>
 {status === "unclear" ? (
 <p className="mt-2 rounded-xl border border-unclear/25 bg-unclear/8 px-4 py-3 text-[14px] font-medium leading-relaxed text-unclear">
 <span className="font-semibold">Unclear. </span>
 <ReasonText text={displayReason} className="inline" />
 </p>
 ) : (
 <ReasonText
 text={displayReason}
 className={cn("mt-2 leading-relaxed", primary ? "text-[15px]" : "text-[14px]", "text-muted")}
 />
 )}
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
 <p className="eyebrow text-accent">Next action</p>
 <p
 className={cn(
 "mt-2 font-medium leading-snug",
 primary ? "text-[17px]" : "text-[15px]"
 )}
 >
 <LinkifiedText text={nextAction} {...linkifyOptions} />
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
 <span>
 <LinkifiedText text={label} {...linkifyOptions} />
 </span>
 </li>
 ))}
 </ul>
 ) : (
 <p className="mt-3 text-[14px] font-medium text-danger">
 No done criteria. Define what &ldquo;done&rdquo; means before starting.
 </p>
 )}
 </div>

 <div className="space-y-2">
 {confidence != null ? (
 <div className="flex justify-end">
 <ConfidenceBadge level={confidence} />
 </div>
 ) : null}
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
 <p className="text-[14px] text-muted">
 {owner ? `Owner: ${owner}` : null}
 {owner && dueDate ? " · " : null}
 {dueDate ? `Due ${new Date(dueDate).toLocaleDateString()}` : null}
 </p>
 ) : null}

 <TaskActionButtons
 taskId={id}
 linkedJiraKey={linkedJiraKey}
 latestVerificationReport={latestVerificationReport}
 />
 </section>
 </Card.Content>
 </Card>
 );
}
