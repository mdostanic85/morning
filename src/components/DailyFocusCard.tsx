"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, ExternalLinkIcon, UserRoundIcon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import type { WorkTaskStatus } from "@/domain/workTask";
import { Button } from "@heroui/react/button";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "./EvidencePanel";
import {
 AIExplanationDrawer,
 type AIExplanationSection,
} from "./AIExplanationDrawer";
import { TaskActionButtons } from "./TaskActionButtons";
import { TaskWorkContext } from "./TaskWorkContext";
import { LinkifiedText, resolveJiraUrl } from "./LinkifiedText";
import { ReasonText } from "./ReasonText";
import { FocusExecution } from "./FocusExecution";
import { DecisionTrail } from "./DecisionTrail";
import { BlockersCard, buildBlockerEntries, type BlockerEntry } from "./BlockersCard";
import { ConfidenceBadge } from "./ConfidenceBadge";
import {
 resolveFocusPrimaryCta,
 resolveFocusSecondaryActions,
} from "@/lib/tasks/focusPrimaryCta";
import type { TaskProgressState } from "@/domain/taskProgress";
import { useTaskPlanProgress } from "@/lib/tasks/useTaskPlanProgress";
import { burstSparklesFromElement } from "@/lib/motion/sparkles";
import { priorityExplanationForDisplay } from "@/lib/tasks/priorityExplanation";

export interface DailyFocusData {
 title: string;
 reason: string;
 nextAction: string;
 actionSteps?: string[];
 todayWorkSummary?: string[];
 referenceLinks?: { label: string; url: string }[];
 doneCriteria: string[];
 evidence: EvidenceItem[];
 linkedTaskId?: number | null;
 linkedJiraKey?: string | null;
 linkedJiraUrl?: string | null;
 priorityExplanation?: string;
 latestVerificationReport?: VerificationReport | null;
 latestSyncReviewReport?: SyncReviewReport | null;
 figmaFrameUrl?: string | null;
 localRepoPath?: string | null;
 githubRepo?: string | null;
 status?: WorkTaskStatus;
 projectName?: string | null;
 waitingOn?: string | null;
 owner?: string | null;
 dueDate?: string | null;
 briefingWaitingOn?: string[];
 briefingRisks?: string[];
 confidence?: number | null;
 taskProgress?: TaskProgressState[];
}

function linkifyOptions(item: DailyFocusData) {
 return {
 referenceLinks: item.referenceLinks,
 jiraKey: item.linkedJiraKey,
 jiraUrl: resolveJiraUrl(item),
 };
}

function formatStatus(status: WorkTaskStatus | undefined): string | null {
 if (!status) return null;
 return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function dueDateLabel(value: string | null | undefined): string | null {
 if (!value) return null;
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const QUICK_ICON_TONES = [
 "bg-accent/10 text-accent-strong",
 "bg-sky-soft text-sky-foreground",
 "bg-mint-soft text-mint-foreground",
 "bg-pink-soft text-pink-foreground",
];

/** Gradient AI-conclusion block — confidence lives next to evidence, not here. */
function PriorityConclusion({ item }: { item: DailyFocusData }) {
 const explanation = priorityExplanationForDisplay(
 item.priorityExplanation || item.reason
 );
 return (
 <div className="accent-soft-gradient relative z-1 mt-6 overflow-hidden rounded-2xl border border-border-strong p-5">
 <strong className="block text-[16px] font-semibold text-foreground">Why this first</strong>
 <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
 {explanation}
 </p>
 </div>
 );
}

/** Reference "current action" block: number chip, active step, Mark complete. */
function CurrentAction({
 item,
 stepIndex,
 stepText,
 supportingText,
 pending,
 onComplete,
}: {
 item: DailyFocusData;
 stepIndex: number;
 stepText: string | null;
 supportingText: string | null;
 pending: boolean;
 onComplete: (element: Element) => void;
}) {
 const allDone = stepText == null;
 const canPersist = item.linkedTaskId != null;

 return (
 <div className="current-action-gradient group relative z-1 mt-5 grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-border-strong p-5 transition-[transform,border-color,box-shadow] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[3px] hover:border-accent hover:shadow-[var(--panel-hover-shadow)] sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
 <span className="chip-spring flex size-13 items-center justify-center rounded-[17px] bg-accent font-mono text-[17px] font-bold text-accent-contrast sm:size-14">
 {String(stepIndex + 1).padStart(2, "0")}
 </span>
 <div className="min-w-0">
 <p className="eyebrow text-accent">Current next action</p>
 <strong className="mt-1 block break-words text-[18px] font-semibold leading-snug text-foreground">
 {allDone ? (
 "All plan steps are complete"
 ) : (
 <LinkifiedText text={stepText} {...linkifyOptions(item)} />
 )}
 </strong>
 {allDone ? (
 <p className="mt-1 text-[14px] leading-relaxed text-muted">
 Check the definition of done below, then complete the task.
 </p>
 ) : supportingText && supportingText !== stepText ? (
 <p className="mt-1 break-words text-[14px] leading-relaxed text-muted">
 <LinkifiedText text={supportingText} {...linkifyOptions(item)} />
 </p>
 ) : null}
 </div>
 {canPersist ? (
 <Button
 type="button"
 variant="outline"
 className="col-span-2 mt-1 w-full border-accent/30 bg-surface text-accent-strong sm:col-span-1 sm:mt-0 sm:w-auto"
 isDisabled={allDone || pending}
 onClick={(event) => onComplete(event.currentTarget as Element)}
 >
 {allDone ? "Plan complete" : "Mark complete"}
 </Button>
 ) : null}
 </div>
 );
}

function FocusPrimaryControls({
 item,
 onOpenExplanation,
 onOpenEvidence,
 onOpenWork,
}: {
 item: DailyFocusData;
 onOpenExplanation: () => void;
 onOpenEvidence: () => void;
 onOpenWork: () => void;
}) {
 const primaryCta = resolveFocusPrimaryCta({
 status: item.status,
 figmaFrameUrl: item.figmaFrameUrl,
 githubRepo: item.githubRepo,
 linkedJiraUrl: resolveJiraUrl(item),
 referenceLinks: item.referenceLinks,
 });
 const secondaryLinks = resolveFocusSecondaryActions({
 linkedJiraUrl: resolveJiraUrl(item),
 figmaFrameUrl: item.figmaFrameUrl,
 githubRepo: item.githubRepo,
 referenceLinks: item.referenceLinks,
 });

 return (
 <div className="relative z-1 mt-6 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
 {primaryCta.href ? (
 <a
 href={primaryCta.href}
 target="_blank"
 rel="noopener noreferrer"
 onClick={onOpenWork}
 className="link-btn-primary link-btn-lg motion-btn col-span-2 w-full sm:w-auto"
 >
 Open work and start
 <ExternalLinkIcon className="size-4" aria-hidden />
 </a>
 ) : (
 <Button
 type="button"
 variant="primary"
 size="lg"
 className="col-span-2 w-full sm:w-auto"
 onClick={() => {
 onOpenWork();
 const target = document.getElementById(primaryCta.scrollTargetId ?? "redosled");
 target?.scrollIntoView({ behavior: "smooth", block: "start" });
 }}
 >
 {primaryCta.label}
 </Button>
 )}

 <Button
 type="button"
 variant="outline"
 size="lg"
 className="w-full sm:w-auto"
 onClick={onOpenExplanation}
 >
 Why this first?
 </Button>

 <Button
 type="button"
 variant="secondary"
 size="lg"
 className="accent-soft-gradient w-full border border-border-strong text-accent-strong sm:w-auto"
 onClick={onOpenEvidence}
 >
 View evidence
 </Button>

 {item.confidence != null ? <ConfidenceBadge level={item.confidence} /> : null}

 {secondaryLinks.map((link) => (
 <a
 key={link.href}
 href={link.href}
 target="_blank"
 rel="noopener noreferrer"
 className="link-btn-outline link-btn-lg motion-btn w-full sm:w-auto"
 >
 {link.label}
 </a>
 ))}
 </div>
 );
}

/** Side panel 1 — "Check before work": criteria the AI should not decide alone. */
function VerifyQuickPanel({
 item,
 onExplain,
}: {
 item: DailyFocusData;
 onExplain: () => void;
}) {
 const checks = item.doneCriteria.slice(0, 3);
 if (checks.length === 0) return null;

 return (
 <section className="surface-gradient quick-panel panel-lift heading-host rounded-[20px] border border-border p-6">
 <h2 className="heading-accent font-display text-[21px] font-semibold tracking-tight">
 Check before work
 </h2>
 <p className="mt-2 mb-4 text-sm text-muted">
 Things the AI should not decide for you.
 </p>
 {checks.map((check, index) => (
 <div
 key={check}
 className="grid grid-cols-[2.125rem_minmax(0,1fr)_auto] items-start gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0"
 >
 <span
 className={cn(
 "chip-spring flex size-8 items-center justify-center rounded-[10px] text-sm font-bold",
 QUICK_ICON_TONES[index % QUICK_ICON_TONES.length]
 )}
 >
 {index + 1}
 </span>
 <p className="min-w-0 pt-1 text-[14px] leading-relaxed text-foreground">
 <LinkifiedText text={check} {...linkifyOptions(item)} />
 </p>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onPress={onExplain}
 className="self-center px-1 text-accent-strong"
 >
 Explain
 </Button>
 </div>
 ))}
 </section>
 );
}

/** Side panel 2 — "Waiting on others": people/things that affect completion. */
function WaitingQuickPanel({ blockers }: { blockers: BlockerEntry[] }) {
 const waiting = blockers.slice(0, 3);
 if (waiting.length === 0) return null;

 return (
 <section className="focus-soft-gradient quick-panel panel-lift heading-host rounded-[20px] border border-border p-6">
 <h2 className="heading-accent font-display text-[21px] font-semibold tracking-tight">
 Waiting on others
 </h2>
 <p className="mt-2 mb-4 text-sm text-muted">
 Not your active work, but it affects completion.
 </p>
 {waiting.map((entry) => (
 <div
 key={entry.id}
 className="grid grid-cols-[2.125rem_minmax(0,1fr)] items-start gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0"
 >
 <span className="chip-spring flex size-8 items-center justify-center rounded-[10px] bg-accent/10 text-sm font-bold text-accent-strong">
 {entry.text.trim().charAt(0).toUpperCase()}
 </span>
 <div className="min-w-0 pt-0.5">
 <strong className="block text-[14px] font-semibold capitalize text-foreground">
 {entry.kind === "waiting"
 ? "Waiting"
 : entry.kind === "blocked"
 ? "Blocked"
 : entry.kind === "risk"
 ? "Risk to watch"
 : "FYI"}
 </strong>
 <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{entry.text}</p>
 </div>
 </div>
 ))}
 </section>
 );
}

/** Compact context + task-completion controls kept from the existing flow. */
function ContextQuickPanel({ item }: { item: DailyFocusData }) {
 const jiraUrl = resolveJiraUrl(item);
 const status = formatStatus(item.status);
 const dueDate = dueDateLabel(item.dueDate);
 const hasTaskActions = item.linkedTaskId != null || item.linkedJiraKey;

 return (
 <section className="quick-panel panel-lift rounded-[20px] border border-border bg-surface/96 p-6">
 <div className="flex flex-wrap gap-2">
 {item.owner ? (
 <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-soft px-3 py-1.5 text-xs text-muted">
 <UserRoundIcon className="size-3.5" aria-hidden />
 {item.owner}
 </span>
 ) : null}
 {status ? (
 <span className="inline-flex items-center rounded-full bg-sun-soft px-3 py-1.5 text-xs font-semibold text-sun-foreground">
 {status}
 </span>
 ) : null}
 {dueDate ? (
 <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-soft px-3 py-1.5 text-xs text-muted">
 <CalendarClockIcon className="size-3.5" aria-hidden />
 Due {dueDate}
 </span>
 ) : null}
 {item.projectName ? (
 <span className="inline-flex items-center rounded-full border border-border bg-surface-soft px-3 py-1.5 text-xs text-muted">
 {item.projectName}
 </span>
 ) : null}
 {item.linkedJiraKey ? (
 jiraUrl ? (
 <a
 href={jiraUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="link-underline inline-flex items-center rounded-full border border-border-strong bg-accent/8 px-3 py-1.5 font-mono text-xs font-semibold text-accent-strong"
 >
 {item.linkedJiraKey}
 </a>
 ) : (
 <span className="inline-flex items-center rounded-full border border-border bg-surface-soft px-3 py-1.5 font-mono text-xs text-muted">
 {item.linkedJiraKey}
 </span>
 )
 ) : null}
 </div>

 {hasTaskActions ? (
 <div className="mt-5 space-y-3 border-t border-border/70 pt-4">
 <p className="eyebrow text-foreground/70">Task controls</p>
 <TaskActionButtons
 taskId={item.linkedTaskId}
 linkedJiraKey={item.linkedJiraKey}
 referenceLinks={item.referenceLinks}
 latestVerificationReport={item.latestVerificationReport ?? null}
 latestSyncReviewReport={item.latestSyncReviewReport ?? null}
 layout="focus"
 showJiraStatus={false}
 showDelete={false}
 focusTaskSeed={{
 title: item.title,
 reason: item.reason,
 nextAction: item.nextAction,
 doneCriteria: item.doneCriteria,
 }}
 />
 </div>
 ) : null}
 </section>
 );
}

function FocusTodaySummary({ item }: { item: DailyFocusData }) {
 const actions = (
 item.todayWorkSummary?.length
 ? item.todayWorkSummary
 : item.actionSteps?.length
 ? item.actionSteps
 : [item.nextAction]
 ).slice(0, 5);

 if (item.evidence.length === 0) return null;

 return (
 <section aria-labelledby="today-work-summary-title" className="heading-host">
 <p id="today-work-summary-title" className="eyebrow text-foreground/70">
 What you will do today
 </p>
 <ul className="mt-3 grid gap-1">
 {actions.map((action, index) => (
 <li
 key={`${index}-${action}`}
 className="row-glide grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 rounded-lg py-1.5 text-sm leading-relaxed text-foreground"
 >
 <span className="mt-2 size-1.5 rounded-full bg-accent" aria-hidden />
 <LinkifiedText text={action} {...linkifyOptions(item)} />
 </li>
 ))}
 </ul>
 </section>
 );
}

function FocusWorkContextBlock({ item }: { item: DailyFocusData }) {
 if (item.linkedTaskId != null) {
 return (
 <TaskWorkContext
 taskId={item.linkedTaskId}
 figmaFrameUrl={item.figmaFrameUrl}
 localRepoPath={item.localRepoPath}
 githubRepo={item.githubRepo}
 latestSyncReviewReport={item.latestSyncReviewReport}
 referenceLinks={item.referenceLinks}
 />
 );
 }

 if (item.linkedJiraKey) {
 return (
 <TaskWorkContext
 taskId={null}
 linkedJiraKey={item.linkedJiraKey}
 figmaFrameUrl={item.figmaFrameUrl}
 referenceLinks={item.referenceLinks}
 latestSyncReviewReport={item.latestSyncReviewReport}
 />
 );
 }

 return null;
}

export function DailyFocusCard({ item }: { item: DailyFocusData }) {
 const router = useRouter();
 const jiraUrl = resolveJiraUrl(item);
 const [drawerOpen, setDrawerOpen] = useState(false);
 const [drawerSection, setDrawerSection] = useState<AIExplanationSection>("overview");
 const returnFocusRef = useRef<HTMLElement | null>(null);
 const heroRef = useRef<HTMLDivElement | null>(null);
 const executionSteps =
 item.actionSteps && item.actionSteps.length > 0
 ? item.actionSteps
 : [item.nextAction];
 const blockers = buildBlockerEntries({
 taskWaitingOn: item.waitingOn,
 briefingWaitingOn: item.briefingWaitingOn,
 briefingRisks: item.briefingRisks,
 });

 const progress = useTaskPlanProgress({
 taskId: item.linkedTaskId ?? null,
 steps: executionSteps,
 doneCriteria: item.doneCriteria,
 initialProgress: item.taskProgress ?? [],
 });

 const currentStepIndex = progress.firstOpenStep;
 const currentStep = currentStepIndex >= 0 ? executionSteps[currentStepIndex] : null;

 function openDrawer(section: AIExplanationSection) {
 returnFocusRef.current =
 document.activeElement instanceof HTMLElement ? document.activeElement : null;
 setDrawerSection(section);
 setDrawerOpen(true);
 }

 function handleDrawerOpenChange(open: boolean) {
 setDrawerOpen(open);
 if (!open) {
 requestAnimationFrame(() => returnFocusRef.current?.focus());
 }
 }

 function handleHeroPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
 const hero = heroRef.current;
 if (!hero || event.pointerType === "touch") return;
 const rect = hero.getBoundingClientRect();
 hero.style.setProperty("--spot-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
 hero.style.setProperty("--spot-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
 }

 function completeCurrentStep(sourceElement: Element) {
 if (currentStepIndex < 0) return;
 burstSparklesFromElement(sourceElement, 10);
 void progress.toggleItem("step", progress.stepIds[currentStepIndex], true);
 }

 async function markTaskStarted() {
 if (item.linkedTaskId == null || item.status === "now" || item.status === "done") return;
 try {
 const response = await fetch(`/api/work-tasks/${item.linkedTaskId}/status`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action: "start" }),
 });
 if (!response.ok) throw new Error("Could not start task.");
 router.refresh();
 } catch {
 Toast.toast.danger("Work opened, but the local task could not be marked as started.");
 }
 }

 return (
 <>
 <article id="prioritet" className="space-y-[var(--today-section-gap)] scroll-mt-24">
 {/* 1. Priority layout: main hero + side quick panels */}
 <div className="grid items-start gap-[var(--today-grid-gap)] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
 <div
 ref={heroRef}
 onPointerMove={handleHeroPointerMove}
 className="focus-hero-gradient focus-card relative min-w-0 overflow-hidden rounded-[28px] border border-border-strong p-7 sm:p-9 lg:p-10"
 >
 {/* Left gradient rail */}
 <span
 className="absolute inset-y-0 left-0 w-1.5 bg-[linear-gradient(180deg,var(--accent),var(--sky),var(--mint))]"
 aria-hidden
 />
 <span className="focus-blob" aria-hidden />
 <span className="focus-spotlight" aria-hidden />

 <div className="relative z-1 flex flex-wrap items-center gap-3">
 <span className="ai-mark inline-flex h-8 min-w-9.5 items-center justify-center rounded-full px-2.5 font-mono text-[14px] font-bold uppercase text-accent-contrast">
 AI
 </span>
 <p className="eyebrow text-accent-strong">Do this today</p>
 {item.linkedJiraKey ? (
 <>
 <span className="h-3 w-px bg-border" aria-hidden />
 {jiraUrl ? (
 <a
 href={jiraUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="link-underline font-mono text-sm font-bold text-foreground"
 >
 {item.linkedJiraKey}
 </a>
 ) : (
 <span className="font-mono text-sm text-muted">{item.linkedJiraKey}</span>
 )}
 </>
 ) : null}
 {formatStatus(item.status) ? (
 <span className="inline-flex min-h-7 items-center rounded-full bg-sun-soft px-2.5 text-sm font-semibold text-sun-foreground">
 {formatStatus(item.status)}
 </span>
 ) : null}
 </div>

 <h3 className="relative z-1 mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-[3.75rem]">
 {item.title}
 </h3>

 <div className="relative z-1 mt-5 max-w-3xl text-[17px] leading-[1.65] text-foreground/80">
 <ReasonText text={item.reason} {...linkifyOptions(item)} />
 </div>

 <PriorityConclusion item={item} />

 <CurrentAction
 item={item}
 stepIndex={Math.max(currentStepIndex, 0)}
 stepText={currentStep}
 supportingText={item.nextAction}
 pending={progress.pendingKey != null}
 onComplete={completeCurrentStep}
 />

 <FocusPrimaryControls
 item={item}
 onOpenExplanation={() => openDrawer("overview")}
 onOpenEvidence={() => openDrawer("evidence")}
 onOpenWork={() => void markTaskStarted()}
 />
 </div>

 <aside
 aria-label="Current task context"
 className="grid min-w-0 content-start gap-[var(--today-grid-gap)] sm:grid-cols-2 lg:grid-cols-1"
 >
 <VerifyQuickPanel item={item} onExplain={() => openDrawer("overview")} />
 <WaitingQuickPanel blockers={blockers} />
 <ContextQuickPanel item={item} />
 </aside>
 </div>

 {/* 2. Finish this task: work order + definition of done */}
 <section id="redosled" className="scroll-mt-24">
 <FocusExecution
 steps={executionSteps}
 doneCriteria={item.doneCriteria}
 evidence={item.evidence}
 verificationReport={item.latestVerificationReport}
 syncReviewReport={item.latestSyncReviewReport}
 linkifyOptions={linkifyOptions(item)}
 onViewEvidence={() => openDrawer("evidence")}
 taskId={item.linkedTaskId ?? null}
 progress={progress}
 />
 </section>

 {/* 3. Today summary + blockers */}
 <section className="grid gap-[var(--today-grid-gap)] lg:grid-cols-12">
 <div className="heading-host panel-lift rounded-today-card border border-border bg-surface p-6 sm:p-8 lg:col-span-7">
 <FocusTodaySummary item={item} />
 </div>
 <BlockersCard entries={blockers} />
 </section>

 {/* 4. Why the AI decided this way */}
 <DecisionTrail
 conflicts={item.latestSyncReviewReport?.conflicts ?? []}
 onOpenExplanation={() => openDrawer("overview")}
 />
 </article>

 <AIExplanationDrawer
 open={drawerOpen}
 onOpenChange={handleDrawerOpenChange}
 initialSection={drawerSection}
 title={item.title}
 subtitle={
 [item.linkedJiraKey, item.projectName, item.status].filter(Boolean).join(" · ") ||
 "Current daily priority"
 }
 conclusion={priorityExplanationForDisplay(item.priorityExplanation || item.reason)}
 reasoning={item.reason}
 evidence={item.evidence}
 verifyItems={item.doneCriteria}
 confidence={item.confidence}
 conflicts={item.latestSyncReviewReport?.conflicts ?? []}
 footer={<FocusWorkContextBlock item={item} />}
 />
 </>
 );
}
