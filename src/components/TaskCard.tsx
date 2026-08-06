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
import { AppBadge } from "./AppBadge";
import { AppTooltip } from "./AppTooltip";
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

/**
 * Only the buckets whose one-word label leaves the boundary ambiguous get an
 * explainer. `now` and `done` say everything already.
 */
const STATUS_DESCRIPTION: Partial<Record<WorkTaskStatus, string>> = {
  next: "Queued behind your current focus, still for today.",
  later: "On the radar, with no day assigned yet.",
  waiting: "Someone else has to move before you can continue.",
  tomorrow: "Deliberately pushed out of today.",
  unclear: "Ownership or the requirement is ambiguous — resolve it before starting.",
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

function StatusBadge({ status }: { status: WorkTaskStatus }) {
 const Icon = STATUS_ICON[status];
 const description = STATUS_DESCRIPTION[status];
 const badge = (
 <AppBadge
 className={cn("capitalize font-normal", STATUS_BADGE[status])}
 icon={<Icon className="size-3.5" aria-hidden />}
 >
 {status}
 </AppBadge>
 );

 if (!description) return badge;

 return <AppTooltip content={description}>{badge}</AppTooltip>;
}

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
 <StatusBadge status={status} />
 {sourceTypes.map((sourceType) => (
 <SourceBadge key={sourceType} sourceType={sourceType} />
 ))}
 {projectName ? (
 <span className="text-sm text-muted">{projectName}</span>
 ) : (
 <span className="text-sm font-medium text-waiting">Unassigned project</span>
 )}
 {priorityScore != null ? (
 <AppTooltip content="Priority score, 0 to 1. Higher means Worklight ranked it more urgent.">
 <span className="cursor-default font-utility text-sm text-muted-soft">
 {priorityScore.toFixed(2)}
 </span>
 </AppTooltip>
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
