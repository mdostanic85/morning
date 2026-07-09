"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Menu } from "@base-ui/react/menu";
import { buttonVariants } from "@/components/ui/button";
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
import { jiraStatusVisual } from "@/lib/connectors/jiraStatusVisual";
import { cn } from "@/lib/utils";

interface JiraTransitionOption {
  id: string;
  name: string;
  toStatus: string;
}

interface JiraStatusDropdownProps {
  taskId?: number | null;
  linkedJiraKey: string;
  disabled?: boolean;
  embedded?: boolean;
  buttonSize?: "sm" | "default";
  className?: string;
}

export function JiraStatusDropdown({
  taskId = null,
  linkedJiraKey,
  disabled = false,
  embedded = false,
  buttonSize,
  className,
}: JiraStatusDropdownProps) {
  const router = useRouter();
  const [jiraStatus, setJiraStatus] = useState<string | null>(null);
  const [jiraTransitions, setJiraTransitions] = useState<JiraTransitionOption[]>([]);
  const [selectedTransition, setSelectedTransition] = useState<JiraTransitionOption | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingMove, setPendingMove] = useState(false);

  const hasTask = taskId != null;
  const jiraKey = linkedJiraKey.trim().toUpperCase();

  const transitionsUrl = hasTask
    ? `/api/work-tasks/${taskId}/jira-transitions`
    : `/api/jira/${encodeURIComponent(jiraKey)}/transitions`;

  const transitionUrl = hasTask
    ? `/api/work-tasks/${taskId}/jira-transition`
    : `/api/jira/${encodeURIComponent(jiraKey)}/transition`;

  const loadTransitions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(transitionsUrl);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not load Jira status.");
      }
      setJiraStatus(data.status ?? null);
      setJiraTransitions(data.transitions ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load Jira status.");
    } finally {
      setLoading(false);
    }
  }, [transitionsUrl]);

  useEffect(() => {
    void loadTransitions();
  }, [loadTransitions]);

  async function runTransition() {
    if (!selectedTransition) return;
    setPendingMove(true);
    setConfirmOpen(false);
    try {
      const res = await fetch(transitionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitionId: selectedTransition.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Jira move failed.");
      }
      setJiraStatus(data.toStatus ?? selectedTransition.toStatus);
      toast.success(`${jiraKey} moved to ${data.toStatus ?? selectedTransition.toStatus}.`);
      setSelectedTransition(null);
      await loadTransitions();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Jira move failed.");
    } finally {
      setPendingMove(false);
    }
  }

  const visual = jiraStatusVisual(loading ? null : jiraStatus);
  const size = buttonSize ?? (embedded ? "sm" : "default");
  const isBusy = loading || pendingMove || disabled;

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={isBusy}
          className={cn(
            buttonVariants({ variant: "outline", size }),
            "w-full justify-between gap-2",
            visual.triggerClassName,
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {loading || pendingMove ? (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <span
                className={cn("size-2 shrink-0 rounded-full", visual.dotClassName)}
                aria-hidden
              />
            )}
            <span className="truncate">{loading ? "Loading…" : visual.label}</span>
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
            <Menu.Popup className="min-w-(--anchor-width) origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              {jiraTransitions.length > 0 ? (
                jiraTransitions.map((transition) => {
                  const targetVisual = jiraStatusVisual(transition.toStatus);
                  const TargetIcon = targetVisual.icon;
                  return (
                    <Menu.Item
                      key={transition.id}
                      className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                      onClick={() => {
                        setSelectedTransition(transition);
                        setConfirmOpen(true);
                      }}
                    >
                      <span
                        className={cn("size-2 shrink-0 rounded-full", targetVisual.dotClassName)}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{transition.toStatus}</span>
                      <TargetIcon className="size-3.5 shrink-0 opacity-60" aria-hidden />
                    </Menu.Item>
                  );
                })
              ) : (
                <p className="px-2 py-2 text-sm text-muted">No moves available from this status.</p>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {jiraKey} on Jira?</AlertDialogTitle>
            <AlertDialogDescription>
              This will transition{" "}
              <span className="font-mono font-medium text-foreground">{jiraKey}</span>
              {jiraStatus ? (
                <>
                  {" "}
                  from <span className="font-medium text-foreground">{jiraStatus}</span>
                </>
              ) : null}{" "}
              to{" "}
              <span className="font-medium text-foreground">
                {selectedTransition?.toStatus ?? selectedTransition?.name}
              </span>{" "}
              on your Jira board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runTransition()} disabled={pendingMove}>
              Move on Jira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
