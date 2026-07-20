"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toast } from "@heroui/react/toast";
import { Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@heroui/react/button";
import { TextArea } from "@heroui/react/textarea";
import { Tooltip } from "@heroui/react/tooltip";
import { AlertDialog } from "@heroui/react/alert-dialog";
import { Modal } from "@heroui/react/modal";
import type { VerificationReport } from "@/domain/verificationReport";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { JiraStatusDropdown } from "@/components/JiraStatusDropdown";
import { cn } from "@/lib/utils";

interface FocusTaskSeed {
 title: string;
 reason: string;
 nextAction: string;
 doneCriteria: string[];
}

interface TaskActionButtonsProps {
 taskId?: number | null;
 linkedJiraKey?: string | null;
 referenceLinks?: { label: string; url: string }[];
 latestVerificationReport?: VerificationReport | null;
 latestSyncReviewReport?: SyncReviewReport | null;
 embedded?: boolean;
 layout?: "stack" | "focus";
 focusExtras?: ReactNode;
 focusTaskSeed?: FocusTaskSeed | null;
 showJiraStatus?: boolean;
 showDelete?: boolean;
}

const VERDICT_LABEL: Record<string, string> = {
 done: "Done",
 mostly_done: "Mostly done",
 missing_work: "Missing work",
 cannot_verify: "Cannot verify",
};

export function TaskActionButtons({
 taskId = null,
 linkedJiraKey = null,
 referenceLinks = [],
 latestVerificationReport = null,
 latestSyncReviewReport = null,
 embedded = false,
 layout = "stack",
 focusExtras = null,
 focusTaskSeed = null,
 showJiraStatus = true,
 showDelete = true,
}: TaskActionButtonsProps) {
 const router = useRouter();
 const [pendingAction, setPendingAction] = useState<string | null>(null);
 const [resolvedTaskId, setResolvedTaskId] = useState<number | null>(null);
 const [ensurePending, setEnsurePending] = useState(false);
 const [doneConfirmOpen, setDoneConfirmOpen] = useState(false);
 const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
 const [verifyOpen, setVerifyOpen] = useState(false);
 const [deliveryNotes, setDeliveryNotes] = useState("");
 const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(
 latestVerificationReport
 );
 const [syncReviewReport, setSyncReviewReport] = useState<SyncReviewReport | null>(
 latestSyncReviewReport
 );
 // Follow the server-provided reports when they change. Render-time
 // adjustment instead of effects to avoid cascading re-renders.
 const [prevVerificationReport, setPrevVerificationReport] = useState(latestVerificationReport);
 if (prevVerificationReport !== latestVerificationReport) {
 setPrevVerificationReport(latestVerificationReport);
 setVerificationReport(latestVerificationReport);
 }

 const [prevSyncReviewReport, setPrevSyncReviewReport] = useState(latestSyncReviewReport);
 if (prevSyncReviewReport !== latestSyncReviewReport) {
 setPrevSyncReviewReport(latestSyncReviewReport);
 setSyncReviewReport(latestSyncReviewReport);
 }

 const jiraKey = linkedJiraKey?.trim().toUpperCase() ?? null;
 const effectiveTaskId = taskId ?? resolvedTaskId;
 const isLoading = pendingAction !== null || ensurePending;
 const hasJira = Boolean(jiraKey);
 const hasJiraStatusControl = hasJira && showJiraStatus;
 const hasTask = effectiveTaskId != null;

 const isFocusLayout = layout === "focus";
 const embeddedBtnClass = embedded && !isFocusLayout ? "min-w-[9.5rem] flex-1 basis-0" : "";
 const buttonSize = isFocusLayout ? "md" : embedded ? "sm" : "md";
 const focusSeedKey = focusTaskSeed
 ? `${focusTaskSeed.title}\n${focusTaskSeed.reason}\n${focusTaskSeed.nextAction}\n${focusTaskSeed.doneCriteria.join("\n")}`
 : null;

 // A concrete taskId supersedes any previously resolved one. Render-time
 // adjustment instead of setting state inside the ensure-task effect.
 if (taskId != null && resolvedTaskId != null) {
 setResolvedTaskId(null);
 }

 useEffect(() => {
 if (taskId != null) return;
 if (!isFocusLayout || !jiraKey || !focusTaskSeed || !focusSeedKey) return;

 let cancelled = false;

 // Defer so the ensure-task state updates don't run synchronously inside
 // the effect body (avoids cascading renders).
 const timer = setTimeout(() => void (async () => {
 setEnsurePending(true);
 try {
 const res = await fetch(`/api/jira/${encodeURIComponent(jiraKey)}/ensure-task`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(focusTaskSeed),
 });
 const data = await res.json();
 if (!res.ok) {
 throw new Error(data.error ?? "Could not link Jira issue to local task.");
 }
 if (!cancelled && typeof data.taskId === "number") {
 setResolvedTaskId(data.taskId);
 }
 } catch (err) {
 if (!cancelled) {
 Toast.toast.danger(err instanceof Error ? err.message : "Could not link Jira issue to local task.");
 }
 } finally {
 if (!cancelled) setEnsurePending(false);
 }
 })(), 0);

 return () => {
 cancelled = true;
 clearTimeout(timer);
 };
 }, [taskId, isFocusLayout, jiraKey, focusSeedKey, focusTaskSeed]);

 async function runStatusAction(action: string) {
 if (effectiveTaskId == null) return;
 setPendingAction(action);
 setDoneConfirmOpen(false);
 try {
 const res = await fetch(`/api/work-tasks/${effectiveTaskId}/status`, {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ action }),
 });
 if (!res.ok) throw new Error("Task action failed.");
 Toast.toast.success("Task updated.");
 router.refresh();
 } catch {
 Toast.toast.danger("Could not update task. Try again.");
 } finally {
 setPendingAction(null);
 }
 }

 async function runDelete() {
 if (effectiveTaskId == null) return;
 setPendingAction("delete");
 setDeleteConfirmOpen(false);
 try {
 const res = await fetch(`/api/work-tasks/${effectiveTaskId}`, { method: "DELETE" });
 if (!res.ok) throw new Error("Delete failed.");
 Toast.toast.success("Task removed.");
 router.refresh();
 } catch {
 Toast.toast.danger("Could not delete task. Try again.");
 } finally {
 setPendingAction(null);
 }
 }

 async function runVerify() {
 if (effectiveTaskId == null) return;
 setPendingAction("verify");
 try {
 const res = await fetch(`/api/work-tasks/${effectiveTaskId}/verify`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ deliveryNotes: deliveryNotes.trim() }),
 });
 const data = await res.json();
 if (!res.ok) {
 throw new Error(data.error ?? "Verification failed.");
 }
 setVerificationReport(data.report);
 setVerifyOpen(false);
 setDeliveryNotes("");
 Toast.toast.success("Delivery check complete.");
 router.refresh();
 } catch (err) {
 Toast.toast.danger(err instanceof Error ? err.message : "Verification failed.");
 } finally {
 setPendingAction(null);
 }
 }

 return (
 <div
 className={
 isFocusLayout
 ? "space-y-4"
 : embedded
 ? "min-w-0 flex-1 basis-0"
 : "mt-6 space-y-4 border-t border-border/50 pt-5"
 }
 >
 {isFocusLayout ? (
 <div className="space-y-3">
 {ensurePending && !hasTask ? (
 <div className="flex h-12 items-center justify-center rounded-lg border border-border/70 bg-surface-soft/40 text-sm text-muted">
 <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
 Linking local task…
 </div>
 ) : null}

 <div
 className={cn(
 "grid grid-cols-1 gap-2.5",
 hasTask && hasJiraStatusControl && "sm:grid-cols-2"
 )}
 >
 {hasTask ? (
 <Button
 type="button"
 size="lg"
 onClick={() => setDoneConfirmOpen(true)}
 isDisabled={isLoading}
 className="h-12 w-full text-[15px] border border-good/40 bg-good/[0.12] text-good hover:border-good/60 hover:bg-good/20"
 >
 {pendingAction === "done" ? (
 <Loader2Icon className="size-4 animate-spin" aria-hidden />
 ) : null}
 Mark done
 </Button>
 ) : null}

 {hasJiraStatusControl && jiraKey ? (
 <JiraStatusDropdown
 taskId={effectiveTaskId}
 linkedJiraKey={jiraKey}
 disabled={isLoading}
 embedded
 buttonSize="default"
 className="h-12 w-full text-[15px]"
 />
 ) : null}
 </div>

 {focusExtras ? <div>{focusExtras}</div> : null}

 {hasTask && showDelete ? (
 <div className="flex justify-end border-t border-border/50 pt-3">
 <Button
 type="button"
 variant="ghost"
 size="sm"
 className="text-muted-soft hover:bg-danger/10 hover:text-danger"
 onClick={() => setDeleteConfirmOpen(true)}
 isDisabled={isLoading}
 >
 Delete task
 </Button>
 </div>
 ) : null}
 </div>
 ) : (
 <div className={cn("flex flex-wrap items-center gap-2", embedded && "w-full")}>
 {hasTask ? (
 <>
 <Button
 type="button"
 size={buttonSize}
 className={embeddedBtnClass}
 onClick={() => runStatusAction("start")}
 isDisabled={isLoading}
 >
 {pendingAction === "start" ? (
 <Loader2Icon className="size-4 animate-spin" aria-hidden />
 ) : null}
 Start
 </Button>

 <Button
 type="button"
 variant="outline"
 size={buttonSize}
 onClick={() => setDoneConfirmOpen(true)}
 isDisabled={isLoading}
 className={cn(
 "border-good/40 bg-good/[0.08] text-good hover:border-good/60 hover:bg-good/15",
 embeddedBtnClass
 )}
 >
 {pendingAction === "done" ? (
 <Loader2Icon className="size-4 animate-spin" aria-hidden />
 ) : null}
 Done
 </Button>
 </>
 ) : null}

 {hasTask ? (
 <Button
 type="button"
 variant="outline"
 size={buttonSize}
 className={embeddedBtnClass}
 onClick={() => setVerifyOpen(true)}
 isDisabled={isLoading}
 >
 Check if done
 </Button>
 ) : null}

 {hasJira && jiraKey ? (
 <JiraStatusDropdown
 taskId={taskId}
 linkedJiraKey={jiraKey}
 disabled={isLoading}
 embedded={embedded}
 className={embeddedBtnClass}
 />
 ) : null}

 {hasTask ? (
 <>
 <span className="mx-1.5 hidden h-5 w-px bg-border sm:inline-block" aria-hidden />

 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <Button
 type="button"
 variant="ghost"
 onClick={() => runStatusAction("skip")}
 isDisabled={isLoading}
 >
 Skip
 </Button>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
 Move to Later — not for today, keep in queue
 <Tooltip.Arrow />
 </Tooltip.Content>
 </Tooltip>

 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <Button
 type="button"
 variant="ghost"
 onClick={() => runStatusAction("snooze")}
 isDisabled={isLoading}
 >
 Snooze
 </Button>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
 Move to Tomorrow
 <Tooltip.Arrow />
 </Tooltip.Content>
 </Tooltip>

 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <Button
 type="button"
 variant="ghost"
 onClick={() => runStatusAction("waiting")}
 isDisabled={isLoading}
 className="hover:text-waiting"
 >
 Waiting
 </Button>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
 Blocked on someone else
 <Tooltip.Arrow />
 </Tooltip.Content>
 </Tooltip>

 <Tooltip delay={400}>
 <Tooltip.Trigger>
 <Button
 type="button"
 variant="danger-soft"
 size="sm"
 onClick={() => setDeleteConfirmOpen(true)}
 isDisabled={isLoading}
 >
 Delete
 </Button>
 </Tooltip.Trigger>
 <Tooltip.Content placement="top" showArrow className="max-w-xs bg-foreground px-3 py-1.5 text-xs text-background">
 Remove this task and its evidence
 <Tooltip.Arrow />
 </Tooltip.Content>
 </Tooltip>
 </>
 ) : null}
 </div>
 )}

 <AlertDialog isOpen={doneConfirmOpen} onOpenChange={setDoneConfirmOpen}>
 <AlertDialog.Backdrop variant="blur" isDismissable={false} className="bg-background/75">
 <AlertDialog.Container placement="center" size="xs" className="w-full max-w-none px-4">
 <AlertDialog.Dialog className="w-full max-w-sm rounded-surface border border-border bg-overlay p-5 text-foreground outline-none">
 <AlertDialog.Header className="flex flex-col items-start gap-1.5 text-left">
 <AlertDialog.Heading className="text-base font-medium">Mark as done?</AlertDialog.Heading>
 </AlertDialog.Header>
 <p slot="description" className="text-sm text-pretty text-muted">This will move the task out of your queue.</p>
 <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
 <Button slot="close" variant="outline">Cancel</Button>
 <Button slot="close" variant="primary" onClick={() => runStatusAction("done")} className="border border-good/40 bg-good/15 text-good hover:bg-good/25">Mark done</Button>
 </AlertDialog.Footer>
 </AlertDialog.Dialog>
 </AlertDialog.Container>
 </AlertDialog.Backdrop>
 </AlertDialog>

 <AlertDialog isOpen={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
 <AlertDialog.Backdrop variant="blur" isDismissable={false} className="bg-background/75">
 <AlertDialog.Container placement="center" size="xs" className="w-full max-w-none px-4">
 <AlertDialog.Dialog className="w-full max-w-sm rounded-surface border border-border bg-overlay p-5 text-foreground outline-none">
 <AlertDialog.Header className="flex flex-col items-start gap-1.5 text-left">
 <AlertDialog.Heading className="text-base font-medium">Delete this task?</AlertDialog.Heading>
 </AlertDialog.Header>
 <p slot="description" className="text-sm text-pretty text-muted">This removes the task and its linked evidence from your queue. Source items stay in the app.</p>
 <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
 <Button slot="close" variant="outline">Cancel</Button>
 <Button slot="close" variant="danger-soft" onClick={() => runDelete()} isDisabled={isLoading}>Delete task</Button>
 </AlertDialog.Footer>
 </AlertDialog.Dialog>
 </AlertDialog.Container>
 </AlertDialog.Backdrop>
 </AlertDialog>

 <Modal isOpen={verifyOpen} onOpenChange={setVerifyOpen}>
 <Modal.Backdrop variant="blur" isDismissable className="bg-background/75">
 <Modal.Container placement="center" size="sm" className="w-full max-w-none px-4">
 <Modal.Dialog className="relative grid w-full max-w-sm gap-4 rounded-surface border border-border bg-overlay p-5 text-sm text-foreground outline-none">
 <Modal.CloseTrigger className="absolute top-2 right-2 size-9 rounded-lg text-muted transition-colors hover:bg-surface-soft hover:text-foreground">
 <XIcon className="size-4" />
 <span className="sr-only">Close</span>
 </Modal.CloseTrigger>
 <Modal.Header className="flex flex-col gap-2">
 <Modal.Heading className="text-base font-medium">Check if done</Modal.Heading>
 <p slot="description" className="text-sm text-muted">Compares your done criteria against git activity and optional notes. Does not write to external systems.</p>
 </Modal.Header>
 <label className="block">
 <span className="text-xs font-medium text-foreground">What you shipped (optional)</span>
 <TextArea
 value={deliveryNotes}
 onChange={(event) => setDeliveryNotes(event.target.value)}
 rows={4}
 placeholder="PR link, file changed, decision made…"
 className="mt-1.5 text-sm"
 />
 </label>
 <Modal.Footer className="-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
 <Button type="button" variant="ghost" onClick={() => setVerifyOpen(false)}>Cancel</Button>
 <Button type="button" variant="primary" onClick={() => runVerify()} isDisabled={isLoading}>
 {pendingAction === "verify" ? (
 <Loader2Icon className="size-4 animate-spin" aria-hidden />
 ) : null}
 Run check
 </Button>
 </Modal.Footer>
 </Modal.Dialog>
 </Modal.Container>
 </Modal.Backdrop>
 </Modal>

 <AnimatePresence>
 {syncReviewReport ? (
 <motion.div
 key="sync-review-report"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 8 }}
 transition={{ duration: 0.2 }}
 >
 <SyncReviewSummary report={syncReviewReport} />
 </motion.div>
 ) : null}
 </AnimatePresence>

 <AnimatePresence>
 {verificationReport ? (
 <motion.div
 key="verification-report"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: 8 }}
 transition={{ duration: 0.2 }}
 >
 <VerificationReportSummary report={verificationReport} />
 </motion.div>
 ) : null}
 </AnimatePresence>
 </div>
 );
}

function SyncReviewSummary({ report }: { report: SyncReviewReport }) {
 return (
 <section className="space-y-4 rounded-xl border border-border/70 bg-surface-soft/60 p-4 text-sm">
 <div>
 <p className="eyebrow text-foreground/70">Sync review</p>
 <p className="mt-2 leading-relaxed text-foreground">{report.summary}</p>
 {report.githubBranch || report.figmaUrl ? (
 <p className="mt-2 text-xs text-muted">
 {report.githubBranch ? `Branch: ${report.githubBranch}` : null}
 {report.githubBranch && report.figmaUrl ? " · " : null}
 {report.figmaUrl ? "Figma frame checked" : null}
 </p>
 ) : null}
 </div>
 {report.ok.length > 0 ? <ReportList title="OK" items={report.ok} tone="good" /> : null}
 {report.notOk.length > 0 ? <ReportList title="Not OK" items={report.notOk} tone="warm" /> : null}
 {report.conflicts.length > 0 ? (
 <ReportList title="Conflicts" items={report.conflicts} tone="unclear" />
 ) : null}
 {report.recommendedNextAction ? (
 <div>
 <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
 Recommended next action
 </p>
 <p className="leading-relaxed text-foreground">{report.recommendedNextAction}</p>
 </div>
 ) : null}
 </section>
 );
}

function VerificationReportSummary({ report }: { report: VerificationReport }) {
 const verdictStyle =
 report.verdict === "done" || report.verdict === "mostly_done"
 ? "border-good/35 bg-good/[0.06] text-good"
 : report.verdict === "missing_work"
 ? "border-warm/35 bg-warm/[0.06] text-warm"
 : "border-border bg-surface-soft text-muted";

 return (
 <section className={`space-y-3 rounded-xl border p-4 text-sm ${verdictStyle}`}>
 <div className="flex flex-wrap items-baseline gap-3">
 <p className="font-semibold">{VERDICT_LABEL[report.verdict] ?? report.verdict}</p>
 {report.confidence != null ? (
 <span className="text-xs opacity-60">
 {Math.round(report.confidence * 100)}% confidence
 </span>
 ) : null}
 </div>
 {report.matches.length > 0 ? (
 <ReportList title="Matches" items={report.matches} />
 ) : null}
 {report.missing.length > 0 ? (
 <ReportList title="Missing" items={report.missing} />
 ) : null}
 {report.risks.length > 0 ? <ReportList title="Risks" items={report.risks} /> : null}
 {report.recommendedNextAction ? (
 <div>
 <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-50">
 Recommended next action
 </p>
 <p className="leading-relaxed">{report.recommendedNextAction}</p>
 </div>
 ) : null}
 </section>
 );
}

function ReportList({
 title,
 items,
 tone,
}: {
 title: string;
 items: string[];
 tone?: "good" | "warm" | "unclear";
}) {
 const titleClass =
 tone === "good"
 ? "text-good"
 : tone === "warm"
 ? "text-warm"
 : tone === "unclear"
 ? "text-unclear"
 : "opacity-50";

 return (
 <div>
 <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${titleClass}`}>
 {title}
 </p>
 <ul className="space-y-1.5">
 {items.map((item) => (
 <li key={item} className="flex gap-2 leading-relaxed text-foreground">
 <span className="mt-0.5 select-none text-muted-soft">–</span>
 <span>{item}</span>
 </li>
 ))}
 </ul>
 </div>
 );
}
