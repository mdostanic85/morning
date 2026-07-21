"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@heroui/react";
import type { ValidationRun } from "@/lib/tasks/figmaValidationRun";

interface Props {
 taskId: number;
 taskTitle: string;
 hasJiraEvidence: boolean;
}

type RunState = ValidationRun & { _lastFetched?: number };

const POLL_INTERVAL_MS = 1200;

function StepIcon({ status }: { status: string }) {
 if (status === "done") {
 return (
 <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-good" fill="none" strokeWidth="2">
 <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 );
 }
 if (status === "error") {
 return (
 <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-danger" fill="none" strokeWidth="2">
 <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" />
 </svg>
 );
 }
 if (status === "running") {
 return (
 <span className="size-4 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin inline-block" />
 );
 }
 if (status === "skipped") {
 return <span className="size-4 shrink-0 rounded-full border border-border-strong/40 inline-block" />;
 }
 // pending
 return <span className="size-4 shrink-0 rounded-full border border-border-strong/30 inline-block" />;
}

function FindingRow({ text, kind, index }: { text: string; kind: "ok" | "notOk" | "conflict"; index: number }) {
 const color =
 kind === "ok"
 ? "text-good"
 : kind === "notOk"
 ? "text-danger"
 : "text-warm";

 const icon =
 kind === "ok" ? (
 <svg viewBox="0 0 16 16" className={`size-3.5 shrink-0 mt-0.5 ${color}`} fill="none" strokeWidth="2.2">
 <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 ) : kind === "notOk" ? (
 <svg viewBox="0 0 16 16" className={`size-3.5 shrink-0 mt-0.5 ${color}`} fill="none" strokeWidth="2.2">
 <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" />
 </svg>
 ) : (
 <svg viewBox="0 0 16 16" className={`size-3.5 shrink-0 mt-0.5 ${color}`} fill="none" strokeWidth="2">
 <path d="M8 3v6M8 11v1.5" stroke="currentColor" strokeLinecap="round" />
 <path d="M2 13 8 3l6 10H2Z" stroke="currentColor" strokeLinejoin="round" />
 </svg>
 );

 return (
 <li
 className="flex items-start gap-2 py-2"
 style={{ animationDelay: `${index * 80}ms` }}
 >
 {icon}
 <span className="text-[14px] leading-snug">{text}</span>
 </li>
 );
}

export function FigmaValidateButton({ taskId, taskTitle, hasJiraEvidence }: Props) {
 const [open, setOpen] = useState(false);
 const [run, setRun] = useState<RunState | null>(null);
 const [starting, setStarting] = useState(false);
 const [showConfirm, setShowConfirm] = useState(false);
 const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

 const stopPoller = useCallback(() => {
 if (pollerRef.current != null) {
 clearInterval(pollerRef.current);
 pollerRef.current = null;
 }
 }, []);

 const pollRun = useCallback(async (runId: string) => {
 try {
 const res = await fetch(`/api/work-tasks/${taskId}/figma-validate/${runId}`);
 if (!res.ok) return;
 const data = (await res.json()) as RunState;
 setRun(data);
 if (data.status !== "running") stopPoller();
 } catch {
 // network error during poll — keep trying
 }
 }, [taskId, stopPoller]);

 const startRun = useCallback(async () => {
 setStarting(true);
 setShowConfirm(false);
 try {
 const res = await fetch(`/api/work-tasks/${taskId}/figma-validate`, { method: "POST" });
 const { runId } = (await res.json()) as { runId: string };
 // Seed the run state immediately
 setRun({
 id: runId,
 taskId,
 status: "running",
 steps: [
 { label: "Loading task and sources", status: "running" },
 { label: "Finding Figma link", status: "pending" },
 { label: "Fetching Figma frame", status: "pending" },
 { label: "Running delivery validation", status: "pending" },
 { label: "Saving report", status: "pending" },
 ],
 cancelRequested: false,
 startedAt: new Date().toISOString(),
 });
 pollerRef.current = setInterval(() => void pollRun(runId), POLL_INTERVAL_MS);
 } finally {
 setStarting(false);
 }
 }, [taskId, pollRun]);

 const handleCancel = useCallback(async () => {
 if (!run?.id) return;
 await fetch(`/api/work-tasks/${taskId}/figma-validate/${run.id}`, { method: "DELETE" });
 // Poll once more to get updated state
 await pollRun(run.id);
 stopPoller();
 }, [run, taskId, pollRun, stopPoller]);

 const handleClose = useCallback(() => {
 stopPoller();
 setOpen(false);
 // Keep run in state so re-opening shows last result
 }, [stopPoller]);

 useEffect(() => () => stopPoller(), [stopPoller]);

 const isRunning = run?.status === "running";
 const isDone = run?.status === "done";
 const isCancelled = run?.status === "cancelled";
 const isError = run?.status === "error";

 if (!hasJiraEvidence) return null;

 return (
 <>
 <Button
 size="sm"
 variant="ghost"
 className="text-accent hover:bg-accent/10"
 onPress={() => {
 setOpen(true);
 if (!run) setShowConfirm(true);
 }}
 >
 <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" strokeWidth="1.8">
 <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" />
 <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" />
 <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" />
 <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" />
 </svg>
 Validate in Figma
 </Button>

 {open ? (
 <div
 className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
 aria-modal="true"
 role="dialog"
 aria-label="Figma delivery validation"
 >
 <div
 className="absolute inset-0 bg-black/40 backdrop-blur-sm"
 onClick={!isRunning ? handleClose : undefined}
 />
 <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface">
 {/* Header */}
 <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
 <div>
 <p className="text-sm font-bold uppercase tracking-[0.07em] text-muted">
 Figma delivery validation
 </p>
 <p className="mt-0.5 text-[15px] font-semibold leading-snug line-clamp-2">{taskTitle}</p>
 </div>
 {!isRunning ? (
 <button
 onClick={handleClose}
 className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-soft hover:text-foreground transition-colors"
 aria-label="Close"
 >
 <svg viewBox="0 0 16 16" className="size-4" fill="none" strokeWidth="2">
 <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeLinecap="round" />
 </svg>
 </button>
 ) : null}
 </div>

 {/* Confirm start */}
 {showConfirm ? (
 <div className="px-5 py-5">
 <p className="text-[14px] leading-relaxed text-muted">
 This will pull the task requirements, find the Figma link from Jira comments, and
 run a delivery sync check using the strongest available model.
 </p>
 <p className="mt-2 text-[14px] leading-relaxed text-muted">
 The check is read-only and will take around 20–40 seconds.
 </p>
 <div className="mt-5 flex gap-3">
 <Button className="flex-1" onPress={startRun} isDisabled={starting}>
 {starting ? "Starting…" : "Run validation"}
 </Button>
 <Button variant="ghost" onPress={handleClose}>
 Cancel
 </Button>
 </div>
 </div>
 ) : (
 <>
 {/* Progress steps */}
 {(isRunning || isDone || isCancelled || isError) && run ? (
 <ul className="space-y-0 px-5 py-4">
 {run.steps.map((step) => (
 <li key={step.label} className="flex items-center gap-3 py-2">
 <StepIcon status={step.status} />
 <span
 className={`text-[14px] leading-snug ${
 step.status === "done"
 ? "text-foreground"
 : step.status === "error"
 ? "text-danger"
 : step.status === "running"
 ? "text-foreground font-medium"
 : "text-muted"
 }`}
 >
 {step.label}
 {step.detail ? (
 <span className="ml-1.5 text-sm text-muted-soft">{step.detail}</span>
 ) : null}
 </span>
 </li>
 ))}
 </ul>
 ) : null}

 {/* Previous result */}
 {run && !isRunning && !showConfirm ? (
 <div className="border-t border-border px-5 py-4">
 {isDone && run.report ? (
 <>
 <p className="text-sm text-muted leading-relaxed mb-3">
 {run.report.summary}
 </p>

 {run.report.ok.length + run.report.notOk.length + run.report.conflicts.length > 0 ? (
 <ul className="divide-y divide-border/60">
 {run.report.ok.map((item, i) => (
 <FindingRow key={item} text={item} kind="ok" index={i} />
 ))}
 {run.report.notOk.map((item, i) => (
 <FindingRow key={item} text={item} kind="notOk" index={run.report!.ok.length + i} />
 ))}
 {run.report.conflicts.map((item, i) => (
 <FindingRow
 key={item}
 text={item}
 kind="conflict"
 index={run.report!.ok.length + run.report!.notOk.length + i}
 />
 ))}
 </ul>
 ) : null}

 {run.report.recommendedNextAction ? (
 <div className="mt-4 rounded-xl border border-accent/20 bg-accent/8 px-4 py-3">
 <p className="text-sm font-bold uppercase tracking-[0.06em] text-accent-strong">
 Recommended next action
 </p>
 <p className="mt-1 text-[14px] leading-snug">
 {run.report.recommendedNextAction}
 </p>
 </div>
 ) : null}
 </>
 ) : isCancelled ? (
 <p className="text-[14px] text-muted">Validation was cancelled.</p>
 ) : isError ? (
 <p className="text-[14px] text-danger">{run.error ?? "Validation failed."}</p>
 ) : null}
 </div>
 ) : null}

 {/* Footer actions */}
 <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
 {isRunning ? (
 <>
 <p className="text-sm text-muted">
 Using strongest model — this takes 20–40 s.
 </p>
 <Button size="sm" variant="danger-soft" onPress={handleCancel}>
 Cancel
 </Button>
 </>
 ) : isDone && run?.report ? (
 <>
 <Button
 size="sm"
 variant="ghost"
 className="text-accent hover:bg-accent/10"
 onPress={() => setShowConfirm(true)}
 >
 Run again
 </Button>
 <Button size="sm" onPress={handleClose}>
 Done
 </Button>
 </>
 ) : (
 <>
 <Button
 size="sm"
 variant="ghost"
 className="text-accent hover:bg-accent/10"
 onPress={() => setShowConfirm(true)}
 >
 {isCancelled || isError ? "Try again" : "Run validation"}
 </Button>
 <Button size="sm" variant="ghost" onPress={handleClose}>
 Close
 </Button>
 </>
 )}
 </div>
 </>
 )}
 </div>
 </div>
 ) : null}
 </>
 );
}
