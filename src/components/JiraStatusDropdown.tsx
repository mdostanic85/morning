"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { Toast } from "@heroui/react/toast";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";
import { AlertDialog } from "@heroui/react/alert-dialog";
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

 // Show the loading state whenever the transitions endpoint changes.
 // Render-time adjustment instead of setting state inside the load effect.
 const [prevTransitionsUrl, setPrevTransitionsUrl] = useState(transitionsUrl);
 if (prevTransitionsUrl !== transitionsUrl) {
 setPrevTransitionsUrl(transitionsUrl);
 setLoading(true);
 }

 const loadTransitions = useCallback(async () => {
 try {
 const res = await fetch(transitionsUrl);
 const data = await res.json();
 if (!res.ok) {
 throw new Error(data.error ?? "Could not load Jira status.");
 }
 setJiraStatus(data.status ?? null);
 setJiraTransitions(data.transitions ?? []);
 } catch (err) {
 Toast.toast.danger(err instanceof Error ? err.message : "Could not load Jira status.");
 } finally {
 setLoading(false);
 }
 }, [transitionsUrl]);

 useEffect(() => {
 // Defer so the load's state updates don't run synchronously inside the
 // effect body (avoids cascading renders).
 const timer = setTimeout(() => void loadTransitions(), 0);
 return () => clearTimeout(timer);
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
 Toast.toast.success(`${jiraKey} moved to ${data.toStatus ?? selectedTransition.toStatus}.`);
 setSelectedTransition(null);
 await loadTransitions();
 router.refresh();
 } catch (err) {
 Toast.toast.danger(err instanceof Error ? err.message : "Jira move failed.");
 } finally {
 setPendingMove(false);
 }
 }

 const visual = jiraStatusVisual(loading ? null : jiraStatus);
 const size = buttonSize ?? (embedded ? "sm" : "default");
 const isBusy = loading || pendingMove || disabled;
 const triggerBaseClass =
 size === "sm"
 ? "inline-flex items-center justify-center gap-2 rounded-full font-semibold border border-border bg-background/70 text-sm h-9 px-3"
 : "inline-flex items-center justify-center gap-2 rounded-full font-semibold border border-border bg-background/70 text-sm h-11 px-4";

 return (
 <>
 <Dropdown>
 <Dropdown.Trigger
 isDisabled={isBusy}
 className={cn(
 triggerBaseClass,
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
 </Dropdown.Trigger>

 <Dropdown.Popover
 placement="bottom start"
 offset={6}
 className="min-w-(--trigger-width) rounded-lg border border-border bg-overlay p-1 text-overlay-foreground"
 >
 <Dropdown.Menu aria-label={`Move ${jiraKey} on Jira`}>
 {jiraTransitions.length > 0 ? (
 jiraTransitions.map((transition) => {
 const targetVisual = jiraStatusVisual(transition.toStatus);
 const TargetIcon = targetVisual.icon;
 return (
 <Dropdown.Item
 id={transition.id}
 key={transition.id}
 textValue={transition.toStatus}
 className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none"
 onAction={() => {
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
 </Dropdown.Item>
 );
 })
 ) : (
 <p className="px-2 py-2 text-sm text-muted">No moves available from this status.</p>
 )}
 </Dropdown.Menu>
 </Dropdown.Popover>
 </Dropdown>

 <AlertDialog isOpen={confirmOpen} onOpenChange={setConfirmOpen}>
 <AlertDialog.Backdrop variant="blur" isDismissable={false} className="bg-background/75">
 <AlertDialog.Container placement="center" size="xs" className="w-full max-w-none px-4">
 <AlertDialog.Dialog className="w-full max-w-sm rounded-surface border border-border bg-overlay p-5 text-foreground outline-none">
 <AlertDialog.Header className="flex flex-col items-start gap-1.5 text-left">
 <AlertDialog.Heading className="text-base font-medium">Move {jiraKey} on Jira?</AlertDialog.Heading>
 </AlertDialog.Header>
 <p slot="description" className="text-sm text-pretty text-muted">
 This will transition{" "}
 <span className="font-utility font-medium text-foreground">{jiraKey}</span>
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
 </p>
 <AlertDialog.Footer className="-mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 rounded-b-surface border-t border-border/70 bg-surface-soft/60 p-5 sm:flex-row sm:justify-end">
 <Button slot="close" variant="outline">Cancel</Button>
 <Button slot="close" variant="primary" onClick={() => runTransition()} isDisabled={pendingMove}>Move on Jira</Button>
 </AlertDialog.Footer>
 </AlertDialog.Dialog>
 </AlertDialog.Container>
 </AlertDialog.Backdrop>
 </AlertDialog>
 </>
 );
}
