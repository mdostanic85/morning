"use client";

import { useMemo, useState } from "react";
import {
 CheckIcon,
 CircleDotIcon,
 LockIcon,
 TriangleAlertIcon,
 ChevronDownIcon,
} from "lucide-react";
import { Button } from "@heroui/react/button";
import type { EvidenceItem } from "@/domain/evidenceItem";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { isExternalApprovalCriterion } from "@/lib/tasks/taskPlanVersion";
import type { TaskPlanProgress } from "@/lib/tasks/useTaskPlanProgress";
import { burstSparklesFromElement } from "@/lib/motion/sparkles";
import { cn } from "@/lib/utils";
import { LinkifiedText, type LinkifyOptions } from "./LinkifiedText";
import { SourceBadge } from "./SourceBadge";
import { Heading } from "./Heading";

function criterionState(
 criterion: string,
 report: VerificationReport | null | undefined,
 completed: boolean
): "matched" | "missing" | "unchecked" | "completed" {
 if (completed) return "completed";
 if (!report) return "unchecked";
 const normalized = criterion.toLowerCase();
 if (report.matches.some((value) => normalized.includes(value.toLowerCase()) || value.toLowerCase().includes(normalized))) {
 return "matched";
 }
 if (report.missing.some((value) => normalized.includes(value.toLowerCase()) || value.toLowerCase().includes(normalized))) {
 return "missing";
 }
 return "unchecked";
}

function sourceForStep(step: string, evidence: EvidenceItem[]): EvidenceItem | null {
 const words = new Set(
 step
 .toLowerCase()
 .split(/\W+/)
 .filter((word) => word.length > 4)
 );
 return (
 evidence.find((item) => {
 const haystack = `${item.sourceTitle ?? ""} ${item.quote} ${item.summary ?? ""}`.toLowerCase();
 return [...words].some((word) => haystack.includes(word));
 }) ??
 evidence[0] ??
 null
 );
}

export function FocusExecution({
 steps,
 doneCriteria,
 evidence,
 verificationReport,
 syncReviewReport,
 linkifyOptions,
 onViewEvidence,
 taskId = null,
 progress,
}: {
 steps: string[];
 doneCriteria: string[];
 evidence: EvidenceItem[];
 verificationReport?: VerificationReport | null;
 syncReviewReport?: SyncReviewReport | null;
 linkifyOptions: LinkifyOptions;
 onViewEvidence: () => void;
 taskId?: number | null;
 progress: TaskPlanProgress;
}) {
 const [selectedStep, setSelectedStep] = useState(0);
 const {
 stepIds,
 criterionIds,
 stepCompleted,
 criterionCompleted,
 completedStepCount,
 firstOpenStep,
 pendingKey,
 toggleItem,
 } = progress;

 const completedCriteriaCount = criterionCompleted.filter(Boolean).length;
 const selectedSource = useMemo(
 () => sourceForStep(steps[selectedStep] ?? "", evidence),
 [evidence, selectedStep, steps]
 );
 const conflicts = syncReviewReport?.conflicts ?? [];

 function handleStepToggle(element: Element, index: number, nextCompleted: boolean) {
 if (nextCompleted) burstSparklesFromElement(element, 10);
 void toggleItem("step", stepIds[index], nextCompleted);
 }

 function handleCriterionToggle(element: Element, index: number, nextCompleted: boolean) {
 if (nextCompleted) burstSparklesFromElement(element, 10);
 void toggleItem("done_criterion", criterionIds[index], nextCompleted);
 }

 return (
 <div>
 <div className="flex flex-wrap items-end justify-between gap-4">
 <div>
 <Heading level={2} visualLevel={3} className="heading-accent">
 Finish this task
 </Heading>
 <p className="mt-2.5 text-sm text-muted">
 Work the steps in order, then verify the completion criteria.
 </p>
 </div>
 <p className="text-sm whitespace-nowrap text-muted">
 <strong className="font-semibold text-foreground">
 {completedStepCount} of {steps.length}
 </strong>{" "}
 steps complete
 </p>
 </div>

 <div className="mt-5 grid items-start gap-[2.125rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
 {/* Work order */}
 <section
 aria-labelledby="execution-plan-title"
 className="heading-host rounded-[22px] border border-border bg-surface/94 p-6 sm:p-7"
 >
 <Heading level={3} visualLevel={4} id="execution-plan-title" className="heading-accent">
 Work order
 </Heading>
 <p className="mt-2.5 mb-4 text-sm text-muted">
 The first unfinished step stays visually active.
 </p>

 <ol className="border-t border-border">
 {steps.map((step, index) => {
 const isComplete = stepCompleted[index];
 const isCurrent = !isComplete && index === firstOpenStep;
 const active = index === selectedStep;
 const key = `step:${stepIds[index]}`;
 return (
 <li
 key={`${index}-${step}`}
 className={cn(
 "row-glide relative border-b border-border",
 isComplete && "opacity-55",
 isCurrent &&
 "focus-soft-gradient pl-3"
 )}
 >
 {isCurrent ? <span className="active-step-glow" aria-hidden /> : null}
 {isCurrent ? (
 <span
 className="absolute top-4 bottom-4 left-0 w-1 rounded-full bg-accent"
 aria-hidden
 />
 ) : null}
 <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3.5 py-5">
 <button
 type="button"
 disabled={taskId == null || pendingKey === key}
 onClick={(event) =>
 handleStepToggle(event.currentTarget, index, !isComplete)
 }
 aria-pressed={isComplete}
 aria-label={
 isComplete
 ? `Mark step ${index + 1} incomplete`
 : `Mark step ${index + 1} complete`
 }
 className={cn(
 "chip-spring flex size-8 items-center justify-center rounded-[10px] font-utility text-sm font-bold",
 isComplete
 ? "bg-good text-success-foreground"
 : isCurrent
 ? "bg-accent text-accent-contrast"
 : "bg-accent/10 text-accent-strong"
 )}
 >
 {isComplete ? <CheckIcon className="size-4" /> : index + 1}
 </button>
 <button
 type="button"
 onClick={() => setSelectedStep(index)}
 className="min-w-0 cursor-pointer bg-transparent pt-1 text-left"
 >
 <span
 className={cn(
 "block text-[15px] leading-relaxed",
 isCurrent || isComplete
 ? "font-semibold text-foreground"
 : "text-muted"
 )}
 >
 <LinkifiedText text={step} {...linkifyOptions} />
 </span>
 </button>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onPress={() => {
 setSelectedStep(index);
 onViewEvidence();
 }}
 className="self-center px-1 text-accent-strong"
 >
 Why
 </Button>
 </div>
 {active && selectedSource ? (
 <div className="grid gap-3 rounded-xl border border-accent/15 bg-accent/[0.035] px-4 py-3.5 mb-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
 {selectedSource.sourceType ? (
 <SourceBadge sourceType={selectedSource.sourceType} />
 ) : null}
 <div className="min-w-0">
 <p className="text-sm font-semibold text-foreground">
 {selectedSource.sourceTitle ?? "Supporting source"}
 </p>
 <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
 &ldquo;{selectedSource.quote}&rdquo;
 </p>
 </div>
 <Button
 type="button"
 variant="ghost"
 size="sm"
 onPress={onViewEvidence}
 className="px-1 text-accent-strong"
 >
 View evidence
 </Button>
 </div>
 ) : null}
 </li>
 );
 })}
 </ol>
 <p className="mt-3 text-sm text-muted-soft">
 {taskId
 ? "Step completion is saved in your local database and resets when the plan changes."
 : "Link this focus to a task to persist step completion."}
 </p>
 </section>

 {/* Done means */}
 <section
 id="done"
 aria-labelledby="definition-done-title"
 className="focus-soft-gradient heading-host scroll-mt-24 rounded-[22px] border border-border-strong p-6 sm:p-7"
 >
 <div className="flex items-baseline justify-between gap-3">
 <Heading level={3} visualLevel={4} id="definition-done-title" className="heading-accent">
 Done means
 </Heading>
 {doneCriteria.length > 0 ? (
 <span className="text-sm text-muted">
 {completedCriteriaCount} of {doneCriteria.length}
 </span>
 ) : null}
 </div>
 <p className="mt-2.5 mb-4 text-sm text-muted">
 Verify these yourself before any final human approval.
 </p>

 {doneCriteria.length > 0 ? (
 <ul className="border-t border-border/70">
 {doneCriteria.map((criterion, index) => {
 const external = isExternalApprovalCriterion(criterion);
 const checked = criterionCompleted[index];
 const state = criterionState(criterion, verificationReport, checked);
 const key = `done_criterion:${criterionIds[index]}`;
 return (
 <li
 key={criterion}
 className={cn(
 "row-glide grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border/70 py-4",
 state === "completed" && "opacity-70"
 )}
 >
 {external ? (
 <span className="flex size-8 items-center justify-center rounded-full border border-waiting/30 bg-waiting/10 text-waiting">
 <LockIcon className="size-4" aria-hidden />
 </span>
 ) : (
 <button
 type="button"
 disabled={taskId == null || pendingKey === key}
 onClick={(event) =>
 handleCriterionToggle(event.currentTarget, index, !checked)
 }
 aria-pressed={checked}
 aria-label={
 checked ? "Mark criterion incomplete" : "Mark criterion complete"
 }
 className={cn(
 "chip-spring flex size-8 items-center justify-center rounded-full border transition-[background-color,border-color,color] duration-150",
 checked
 ? "border-good bg-good text-success-foreground"
 : state === "matched"
 ? "border-good/50 bg-good/10 text-good"
 : state === "missing"
 ? "border-warm/50 bg-warm/10 text-warm"
 : "border-border bg-surface text-muted hover:border-accent/50"
 )}
 >
 {checked || state === "matched" ? (
 <CheckIcon className="size-4" />
 ) : (
 <span className="size-2 rounded-full bg-current opacity-40" aria-hidden />
 )}
 </button>
 )}
 <div className="min-w-0 pt-0.5">
 <p
 className={cn(
 "text-[15px] font-medium leading-relaxed text-foreground",
 checked && "text-muted"
 )}
 >
 <LinkifiedText text={criterion} {...linkifyOptions} />
 </p>
 <p className="mt-0.5 text-sm text-muted">
 {external
 ? "External approval. This cannot be checked off manually."
 : state === "matched"
 ? "Matched by latest delivery check"
 : state === "missing"
 ? "Missing in latest delivery check"
 : checked
 ? "Marked complete by you"
 : "Not checked yet"}
 </p>
 </div>
 </li>
 );
 })}
 </ul>
 ) : (
 <p className="rounded-2xl border border-danger/25 bg-danger/5 px-4 py-4 text-sm font-medium text-danger">
 No done criteria recorded. Resolve this before starting work.
 </p>
 )}

 {verificationReport ? (
 <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface/75 px-4 py-3">
 <CircleDotIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
 <p className="text-sm leading-relaxed text-muted">
 Latest check:{" "}
 <span className="font-semibold capitalize text-foreground">
 {verificationReport.verdict.replaceAll("_", " ")}
 </span>
 . {verificationReport.recommendedNextAction}
 </p>
 </div>
 ) : null}
 </section>
 </div>

 {conflicts.length > 0 ? (
 <details
 id="konflikti"
 className="group mt-6 scroll-mt-24 rounded-[14px] border border-warm/30 bg-surface/75"
 >
 <summary className="warm-hover-gradient flex cursor-pointer list-none items-center gap-3 rounded-[14px] px-5 py-4 text-sm font-semibold text-warm transition-[background-color,padding-left] duration-[280ms] hover:pl-7">
 <TriangleAlertIcon className="size-4" aria-hidden />
 {conflicts.length} source conflict{conflicts.length === 1 ? "" : "s"} affect this work
 <ChevronDownIcon
 className="ml-auto size-4 transition-transform duration-[280ms] ease-[cubic-bezier(0.16,1.35,0.3,1)] group-open:rotate-180"
 aria-hidden
 />
 </summary>
 <ul className="space-y-2 border-t border-warm/20 px-5 py-4">
 {conflicts.map((conflict) => (
 <li key={conflict} className="text-sm leading-relaxed text-muted">
 {conflict}
 </li>
 ))}
 </ul>
 </details>
 ) : null}
 </div>
 );
}
