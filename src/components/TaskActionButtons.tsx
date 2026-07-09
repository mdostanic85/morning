"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  useEffect(() => {
    setVerificationReport(latestVerificationReport);
  }, [latestVerificationReport]);

  useEffect(() => {
    setSyncReviewReport(latestSyncReviewReport);
  }, [latestSyncReviewReport]);

  const jiraKey = linkedJiraKey?.trim().toUpperCase() ?? null;
  const effectiveTaskId = taskId ?? resolvedTaskId;
  const isLoading = pendingAction !== null || ensurePending;
  const hasJira = Boolean(jiraKey);
  const hasTask = effectiveTaskId != null;

  const isFocusLayout = layout === "focus";
  const embeddedBtnClass = embedded && !isFocusLayout ? "min-w-[9.5rem] flex-1 basis-0" : "";
  const buttonSize = isFocusLayout ? "default" : embedded ? "sm" : "default";
  const focusSeedKey = focusTaskSeed
    ? `${focusTaskSeed.title}\n${focusTaskSeed.reason}\n${focusTaskSeed.nextAction}\n${focusTaskSeed.doneCriteria.join("\n")}`
    : null;

  useEffect(() => {
    if (taskId != null) {
      setResolvedTaskId(null);
      return;
    }
    if (!isFocusLayout || !jiraKey || !focusTaskSeed || !focusSeedKey) return;

    let cancelled = false;
    setEnsurePending(true);

    void (async () => {
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
          toast.error(err instanceof Error ? err.message : "Could not link Jira issue to local task.");
        }
      } finally {
        if (!cancelled) setEnsurePending(false);
      }
    })();

    return () => {
      cancelled = true;
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
      toast.success("Task updated.");
      router.refresh();
    } catch {
      toast.error("Could not update task. Try again.");
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
      toast.success("Task removed.");
      router.refresh();
    } catch {
      toast.error("Could not delete task. Try again.");
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
      toast.success("Delivery check complete.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
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

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {hasTask ? (
              <Button
                type="button"
                size="lg"
                onClick={() => setDoneConfirmOpen(true)}
                disabled={isLoading}
                className="h-12 w-full text-[15px] border border-good/40 bg-good/[0.12] text-good hover:border-good/60 hover:bg-good/20"
              >
                {pendingAction === "done" ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : null}
                Mark done
              </Button>
            ) : null}

            {hasJira && jiraKey ? (
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

          {hasTask ? (
            <div className="flex justify-end border-t border-border/50 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-soft hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isLoading}
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
                disabled={isLoading}
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
                disabled={isLoading}
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
              disabled={isLoading}
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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => runStatusAction("skip")}
                      disabled={isLoading}
                    >
                      Skip
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move to Later — not for today, keep in queue</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => runStatusAction("snooze")}
                      disabled={isLoading}
                    >
                      Snooze
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Move to Tomorrow</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => runStatusAction("waiting")}
                      disabled={isLoading}
                      className="hover:text-waiting"
                    >
                      Waiting
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Blocked on someone else</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={isLoading}
                    >
                      Delete
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove this task and its evidence</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          ) : null}
        </div>
      )}

      <AlertDialog open={doneConfirmOpen} onOpenChange={setDoneConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as done?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the task out of your queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runStatusAction("done")}
              className="border border-good/40 bg-good/15 text-good hover:bg-good/25"
            >
              Mark done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task and its linked evidence from your queue. Source items stay in
              the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => runDelete()}
              disabled={isLoading}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check if done</DialogTitle>
            <DialogDescription>
              Compares your done criteria against git activity and optional notes. Does not write
              to external systems.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="text-xs font-medium text-foreground">What you shipped (optional)</span>
            <Textarea
              value={deliveryNotes}
              onChange={(event) => setDeliveryNotes(event.target.value)}
              rows={4}
              placeholder="PR link, file changed, decision made…"
              className="mt-1.5 text-sm"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setVerifyOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => runVerify()} disabled={isLoading}>
              {pendingAction === "verify" ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
              ) : null}
              Run check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
