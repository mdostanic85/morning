"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Toast } from "@heroui/react/toast";
import { Loader2Icon, ChevronDownIcon } from "lucide-react";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";
import { AlertDialog } from "@heroui/react/alert-dialog";
import type { VerificationReport } from "@/domain/verificationReport";
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
  embedded?: boolean;
  layout?: "stack" | "focus";
  focusExtras?: ReactNode;
  focusTaskSeed?: FocusTaskSeed | null;
  showDelete?: boolean;
}

const VERDICT_LABEL: Record<string, string> = {
  done: "Done",
  mostly_done: "Mostly done",
  missing_work: "Missing work",
  cannot_verify: "Cannot verify",
};

type StatusMenuAction = "done" | "snooze" | "waiting";

export function TaskActionButtons({
  taskId = null,
  linkedJiraKey = null,
  referenceLinks = [],
  latestVerificationReport = null,
  embedded = false,
  layout = "stack",
  focusExtras = null,
  focusTaskSeed = null,
  showDelete = true,
}: TaskActionButtonsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [resolvedTaskId, setResolvedTaskId] = useState<number | null>(null);
  const [ensurePending, setEnsurePending] = useState(false);
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(
    latestVerificationReport
  );
  // Follow the server-provided report when it changes. Render-time
  // adjustment instead of effects to avoid cascading re-renders.
  const [prevVerificationReport, setPrevVerificationReport] = useState(latestVerificationReport);
  if (prevVerificationReport !== latestVerificationReport) {
    setPrevVerificationReport(latestVerificationReport);
    setVerificationReport(latestVerificationReport);
  }

  const jiraKey = linkedJiraKey?.trim().toUpperCase() ?? null;
  const effectiveTaskId = taskId ?? resolvedTaskId;
  const isLoading = pendingAction !== null || ensurePending;
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
          Toast.toast.danger(
            err instanceof Error ? err.message : "Could not link Jira issue to local task."
          );
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

  function onStatusMenuAction(action: StatusMenuAction) {
    if (action === "done") {
      setDoneConfirmOpen(true);
      return;
    }
    void runStatusAction(action);
  }

  const statusMenu = hasTask ? (
    <Dropdown>
      <Dropdown.Trigger
        isDisabled={isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background/70 font-semibold text-sm",
          buttonSize === "sm" ? "h-11 px-3" : "h-11 px-4",
          embeddedBtnClass,
          isFocusLayout && "h-12 w-full text-[15px]"
        )}
      >
        Update status
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Popover
        placement="bottom start"
        offset={6}
        className="min-w-(--trigger-width) rounded-lg border border-border bg-overlay p-1 text-overlay-foreground"
      >
        <Dropdown.Menu aria-label="Update task status">
          <Dropdown.Item
            id="done"
            textValue="Mark done"
            className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none"
            onAction={() => onStatusMenuAction("done")}
          >
            Mark done
          </Dropdown.Item>
          <Dropdown.Item
            id="snooze"
            textValue="Not today"
            className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none"
            onAction={() => onStatusMenuAction("snooze")}
          >
            Not today
          </Dropdown.Item>
          <Dropdown.Item
            id="waiting"
            textValue="Waiting on someone"
            className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none"
            onAction={() => onStatusMenuAction("waiting")}
          >
            Waiting on someone
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  ) : null;

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
              hasTask && statusMenu && "sm:grid-cols-2"
            )}
          >
            {hasTask ? (
              <Button
                type="button"
                size="lg"
                variant="primary"
                onClick={() => void runStatusAction("start")}
                isDisabled={isLoading}
                className="h-12 w-full text-[15px]"
              >
                {pendingAction === "start" ? (
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                ) : null}
                Start working
              </Button>
            ) : null}

            {statusMenu}
          </div>

          {focusExtras ? <div>{focusExtras}</div> : null}

          {hasTask && showDelete ? (
            <div className="flex justify-end border-t border-border/50 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 text-muted-soft hover:bg-danger/10 hover:text-danger"
                onClick={() => setDeleteConfirmOpen(true)}
                isDisabled={isLoading}
              >
                Remove task
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className={cn("flex flex-wrap items-center gap-2", embedded && "w-full")}>
          {hasTask ? (
            <Button
              type="button"
              size={buttonSize}
              variant="primary"
              className={cn("min-h-11", embeddedBtnClass)}
              onClick={() => runStatusAction("start")}
              isDisabled={isLoading}
            >
              {pendingAction === "start" ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
              ) : null}
              Start working
            </Button>
          ) : null}

          {statusMenu}

          {hasTask && showDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 text-muted-soft hover:bg-danger/10 hover:text-danger"
              onClick={() => setDeleteConfirmOpen(true)}
              isDisabled={isLoading}
            >
              Remove
            </Button>
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
              <p slot="description" className="text-sm text-pretty text-muted">
                This will move the task out of your queue.
              </p>
              <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
                <Button slot="close" variant="outline">
                  Cancel
                </Button>
                <Button
                  slot="close"
                  variant="primary"
                  onClick={() => runStatusAction("done")}
                  className="border border-good/40 bg-good/15 text-good hover:bg-good/25"
                >
                  Mark done
                </Button>
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
                <AlertDialog.Heading className="text-base font-medium">Remove this task?</AlertDialog.Heading>
              </AlertDialog.Header>
              <p slot="description" className="text-sm text-pretty text-muted">
                This removes the task and its linked evidence from your queue. Source items stay in
                the app.
              </p>
              <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
                <Button slot="close" variant="outline">
                  Cancel
                </Button>
                <Button
                  slot="close"
                  variant="danger-soft"
                  onClick={() => runDelete()}
                  isDisabled={isLoading}
                >
                  Remove task
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

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
          <span className="text-metadata opacity-60">
            {Math.round(report.confidence * 100)}% source confidence
          </span>
        ) : null}
      </div>
      {report.matches.length > 0 ? <ReportList title="Matches" items={report.matches} /> : null}
      {report.missing.length > 0 ? <ReportList title="Missing" items={report.missing} /> : null}
      {report.risks.length > 0 ? <ReportList title="Risks" items={report.risks} /> : null}
      {report.recommendedNextAction ? (
        <div>
          <p className="mb-1 text-metadata font-semibold uppercase tracking-wide opacity-50">
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
      <p className={`mb-1.5 text-metadata font-semibold uppercase tracking-wide ${titleClass}`}>
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
