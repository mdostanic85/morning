import "server-only";

import { getWorkTaskById } from "@/services/workTasks";
import { getSourceItems } from "@/services/sourceItems";
import { extractFigmaUrl } from "@/lib/tasks/deliverableContext";
import { runDeliverySyncReview } from "@/lib/tasks/deliverySyncReview";
import type { SyncReviewReport } from "@/domain/syncReviewReport";
import { randomUUID } from "node:crypto";

export interface ValidationStep {
  label: string;
  status: "pending" | "running" | "done" | "error" | "skipped";
  detail?: string;
}

export interface ValidationRun {
  id: string;
  taskId: number;
  status: "running" | "done" | "cancelled" | "error";
  steps: ValidationStep[];
  cancelRequested: boolean;
  report?: SyncReviewReport;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// Module-level store — fine for single-user local app.
const runs = new Map<string, ValidationRun>();

const STEP_LABELS = [
  "Loading task and sources",
  "Finding Figma link",
  "Fetching Figma frame",
  "Running delivery validation",
  "Saving report",
] as const;

function makeRun(taskId: number): ValidationRun {
  return {
    id: randomUUID(),
    taskId,
    status: "running",
    steps: STEP_LABELS.map((label) => ({ label, status: "pending" })),
    cancelRequested: false,
    startedAt: new Date().toISOString(),
  };
}

function setStep(run: ValidationRun, index: number, status: ValidationStep["status"], detail?: string) {
  const step = run.steps[index];
  if (step) {
    step.status = status;
    if (detail) step.detail = detail;
  }
}

/** Extract figma.com URLs from Jira source bodies linked to the task's evidence. */
function extractFigmaUrlFromJiraSources(
  evidenceSourceIds: Set<number>,
  sourceItems: Awaited<ReturnType<typeof getSourceItems>>
): string | null {
  const jiraSources = sourceItems.filter(
    (item) => item.sourceType === "jira" && evidenceSourceIds.has(item.id)
  );
  for (const source of jiraSources) {
    const found = extractFigmaUrl([source.body ?? "", source.url ?? ""]);
    if (found) return found;
  }
  return null;
}

export function getRun(runId: string): ValidationRun | undefined {
  return runs.get(runId);
}

export function cancelRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.status !== "running") return false;
  run.cancelRequested = true;
  return true;
}

/**
 * Starts a Figma delivery validation in the background and returns the run ID
 * for polling. Progress is tracked step by step; the caller cancels by calling
 * `cancelRun(runId)`.
 */
export function startFigmaValidationRun(taskId: number): string {
  const run = makeRun(taskId);
  runs.set(run.id, run);

  // Kick off async — do not await.
  void executeRun(run);

  return run.id;
}

async function executeRun(run: ValidationRun): Promise<void> {
  const abort = () => run.cancelRequested;

  try {
    // ── Step 0: load task ────────────────────────────────────────────────
    setStep(run, 0, "running");
    if (abort()) return finish(run, "cancelled");

    const [task, allSources] = await Promise.all([
      getWorkTaskById(run.taskId),
      getSourceItems(),
    ]);

    if (!task) {
      setStep(run, 0, "error", "Task not found.");
      return finish(run, "error", "Task not found.");
    }
    setStep(run, 0, "done");

    // ── Step 1: find Figma URL ──────────────────────────────────────────
    setStep(run, 1, "running");
    if (abort()) return finish(run, "cancelled");

    const evidenceSourceIds = new Set(task.evidence.map((e) => e.sourceItemId));
    const figmaFromJira = extractFigmaUrlFromJiraSources(evidenceSourceIds, allSources);
    const figmaFrameUrl = figmaFromJira ?? task.figmaFrameUrl ?? undefined;

    if (figmaFrameUrl) {
      setStep(run, 1, "done", figmaFromJira ? "Found in Jira comments." : "Found in task.");
    } else {
      setStep(run, 1, "skipped", "No Figma link — will validate git/code only.");
    }

    // ── Step 2: fetch Figma frame (inside runDeliverySyncReview) ─────────
    // Mark as running now; the actual fetch happens inside the review call.
    setStep(run, 2, "running");
    if (abort()) return finish(run, "cancelled");

    // ── Step 3: run LLM delivery validation ─────────────────────────────
    setStep(run, 3, "running");
    if (abort()) return finish(run, "cancelled");

    const result = await runDeliverySyncReview({
      taskId: run.taskId,
      figmaFrameUrl,
    });

    if (!result.ok) {
      setStep(run, 2, "error");
      setStep(run, 3, "error", result.error);
      return finish(run, "error", result.error);
    }

    setStep(run, 2, "done", result.figmaUrl ? `Frame loaded from ${result.figmaUrl}` : "No Figma frame.");
    setStep(run, 3, "done");

    // ── Step 4: report already saved inside runDeliverySyncReview ───────
    setStep(run, 4, "running");
    if (abort()) return finish(run, "cancelled");
    setStep(run, 4, "done");

    run.report = result.report;
    return finish(run, "done");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    // Mark any still-running step as error.
    for (const step of run.steps) {
      if (step.status === "running") step.status = "error";
    }
    return finish(run, "error", msg);
  }
}

function finish(run: ValidationRun, status: ValidationRun["status"], error?: string) {
  run.status = status;
  run.completedAt = new Date().toISOString();
  if (error) run.error = error;
  // Mark any remaining pending/running steps as appropriate.
  for (const step of run.steps) {
    if (step.status === "pending") step.status = status === "cancelled" ? "skipped" : "skipped";
    if (step.status === "running") step.status = status === "cancelled" ? "skipped" : status === "error" ? "error" : "done";
  }
  // Prune old runs from memory (keep last 20).
  if (runs.size > 20) {
    const oldest = Array.from(runs.keys())[0];
    if (oldest && oldest !== run.id) runs.delete(oldest);
  }
}
