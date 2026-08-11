import type {
  SyncProviderRunStatus,
  SyncRunStatus,
} from "@/domain/syncRun";

export type SyncRunCompletionStatus = Extract<
  SyncRunStatus,
  "completed" | "partially_completed"
>;

/**
 * Derives the terminal status of a non-cancelled sync run.
 *
 * - `partially_completed` — at least one provider or briefing failed, but
 *   mandatory workflow phases completed.
 * - `completed` — everything succeeded.
 *
 * Mandatory workflow failures throw and are finalized by the exhausted-only
 * failure handler, so they are not a completion-status input.
 */
export function deriveSyncRunCompletionStatus(input: {
  failedProviderCount: number;
  briefingOk: boolean;
}): SyncRunCompletionStatus {
  if (input.failedProviderCount > 0 || !input.briefingOk) {
    return "partially_completed";
  }
  return "completed";
}

export function rebuildDiagnosticsFromResult(input: unknown): string[] {
  if (
    typeof input !== "object" ||
    input === null ||
    !("diagnostics" in input) ||
    !Array.isArray(input.diagnostics)
  ) {
    return [];
  }
  return input.diagnostics.filter(
    (diagnostic): diagnostic is string => typeof diagnostic === "string"
  );
}

const KNOWN_SYNC_FAILURE_PHASE_LIST = [
  "check-cancelled",
  "approve-pending",
  "resolve-connected-providers",
  "discover-projects",
  "finalize-cancelled-before-providers",
  "finalize-cancelled-after-providers",
  "backfill-sources",
  "finalize-cancelled-after-backfill",
  "check-cancelled-after-backfill",
  "fetch-jira-pending",
  "check-cancelled-before-rediscover",
  "rediscover-projects",
  "check-cancelled-before-rebuild",
  "import-linked-jira",
  "rebuild-queue",
  "check-cancelled-before-audits",
  "audit-today-figma-work",
  "build-briefing",
  "build-daily-brief-v2",
  "check-cancelled-before-publication",
  "post-sync-hooks",
  "finalize-sync-run",
] as const;

type KnownSyncFailurePhase = (typeof KNOWN_SYNC_FAILURE_PHASE_LIST)[number];
const KNOWN_SYNC_FAILURE_PHASES = new Set<string>(
  KNOWN_SYNC_FAILURE_PHASE_LIST
);
const SYNC_FAILURE_ERROR_PREFIX = "WorklightSyncPhase:";
const SYNC_FAILURE_MESSAGE_PREFIX = "Worklight sync phase failed:";

export type SyncFailurePhase =
  | KnownSyncFailurePhase
  | "sync-provider"
  | "workflow";

export function failurePhaseFromStepId(stepId: string): SyncFailurePhase {
  if (stepId.startsWith("sync-provider-")) return "sync-provider";
  if (stepId.startsWith("backfill-sources")) return "backfill-sources";
  return KNOWN_SYNC_FAILURE_PHASES.has(stepId)
    ? (stepId as KnownSyncFailurePhase)
    : "workflow";
}

function errorCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null || !("cause" in error)) {
    return null;
  }
  return error.cause;
}

function errorStepId(error: unknown): string | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("stepId" in error) ||
    typeof error.stepId !== "string"
  ) {
    return null;
  }
  return error.stepId;
}

function encodedErrorPhase(error: unknown): SyncFailurePhase | null {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return null;
  }

  const encoded =
    "name" in error &&
    typeof error.name === "string" &&
    error.name.startsWith(SYNC_FAILURE_ERROR_PREFIX)
      ? error.name.slice(SYNC_FAILURE_ERROR_PREFIX.length)
      : "message" in error &&
          typeof error.message === "string" &&
          error.message.startsWith(SYNC_FAILURE_MESSAGE_PREFIX)
        ? error.message.slice(SYNC_FAILURE_MESSAGE_PREFIX.length).trim()
        : null;
  const phase = encoded?.endsWith(".") ? encoded.slice(0, -1) : encoded;
  if (!phase) return null;
  if (phase === "sync-provider" || phase === "workflow") return phase;
  return KNOWN_SYNC_FAILURE_PHASES.has(phase)
    ? (phase as KnownSyncFailurePhase)
    : null;
}

/**
 * Tags a durable operation with a fixed, non-sensitive phase message.
 * Inngest's serialized failure error retains `message` even though it drops
 * custom names and `StepError.stepId` from the final failure event.
 */
export async function runSyncPhase<T>(
  phase: SyncFailurePhase,
  operation: () => T | Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NonRetriableError" || error.name === "RetryAfterError")
    ) {
      throw error;
    }
    const wrapped = new Error(`${SYNC_FAILURE_MESSAGE_PREFIX} ${phase}.`, {
      cause: error,
    });
    wrapped.name = `${SYNC_FAILURE_ERROR_PREFIX}${phase}`;
    throw wrapped;
  }
}

/**
 * Resolves the durable step that caused an exhausted Inngest failure without
 * persisting the underlying exception text. Nested causes win because they
 * represent the earliest known failing operation.
 */
export function failurePhaseFromError(error: unknown): SyncFailurePhase {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let fallback: SyncFailurePhase = "workflow";

  while (current && !seen.has(current)) {
    seen.add(current);
    const encodedPhase = encodedErrorPhase(current);
    if (encodedPhase) fallback = encodedPhase;
    const stepId = errorStepId(current);
    const stepPhase = stepId ? failurePhaseFromStepId(stepId) : "workflow";
    if (stepPhase !== "workflow") fallback = stepPhase;
    current = errorCause(current);
  }

  return fallback;
}

interface SyncRunFailureState {
  status: SyncRunStatus;
  cancelRequestedAt: string | null;
  completedAt?: string | null;
  errorSummary?: string | null;
}

interface SyncProviderRunFailureState {
  id: number;
  status: SyncProviderRunStatus;
  completedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface TerminalSyncFailurePlan {
  syncRun: {
    status: SyncRunStatus;
    completedAt: string | null;
    errorSummary: string | null;
  };
  providerRuns: Array<{
    id: number;
    status: SyncProviderRunStatus;
    completedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
}

const SUCCESSFUL_SYNC_STATUSES = new Set<SyncRunStatus>([
  "completed",
  "partially_completed",
]);

function terminalFailurePhaseDescription(phase: SyncFailurePhase): string {
  if (phase === "sync-provider") return "updating a connected source";
  if (phase.includes("cancelled")) return "checking whether the sync was cancelled";

  switch (phase) {
    case "approve-pending":
      return "applying reviewed items";
    case "resolve-connected-providers":
      return "checking connected sources";
    case "discover-projects":
    case "rediscover-projects":
      return "finding related projects";
    case "backfill-sources":
      return "processing imported source content";
    case "fetch-jira-pending":
    case "import-linked-jira":
      return "updating linked Jira work";
    case "rebuild-queue":
      return "rebuilding today's plan";
    case "audit-today-figma-work":
      return "reviewing Figma work";
    case "build-briefing":
      return "preparing today's briefing";
    case "build-daily-brief-v2":
      return "preparing today's daily brief";
    case "post-sync-hooks":
      return "checking post-sync updates";
    case "finalize-sync-run":
      return "saving the sync result";
    default:
      return "processing the sync";
  }
}

function terminalFailureSummary(phase: SyncFailurePhase): string {
  return `Sync couldn't finish while ${terminalFailurePhaseDescription(phase)}. Try syncing again.`;
}

/**
 * Pure transition plan shared by the database finalizer and lifecycle tests.
 * It is monotonic: successful terminal states are never downgraded, while a
 * repeated failed/cancelled finalizer may still repair a running child row.
 */
export function planTerminalSyncFailure(input: {
  run: SyncRunFailureState;
  providerRuns: SyncProviderRunFailureState[];
  phase: SyncFailurePhase;
  completedAt: string;
}): TerminalSyncFailurePlan {
  const existingSyncRun = {
    status: input.run.status,
    completedAt: input.run.completedAt ?? null,
    errorSummary: input.run.errorSummary ?? null,
  };

  if (SUCCESSFUL_SYNC_STATUSES.has(input.run.status)) {
    return {
      syncRun: existingSyncRun,
      providerRuns: input.providerRuns.map((run) => ({
        id: run.id,
        status: run.status,
        completedAt: run.completedAt ?? null,
        errorCode: run.errorCode ?? null,
        errorMessage: run.errorMessage ?? null,
      })),
    };
  }

  const cancellation =
    input.run.status === "cancelling" ||
    input.run.status === "cancelled" ||
    input.run.cancelRequestedAt != null;
  const terminalStatus: Extract<SyncRunStatus, "failed" | "cancelled"> =
    cancellation ? "cancelled" : "failed";
  const providerStatus: Extract<SyncProviderRunStatus, "failed" | "cancelled"> =
    cancellation ? "cancelled" : "failed";
  const errorCode = cancellation ? "cancelled" : "workflow_failure";
  const errorMessage = cancellation
    ? "Sync cancelled. Any in-flight external requests may still complete."
    : "This source did not finish because the sync stopped. Try syncing again.";

  const syncRun =
    input.run.status === "failed" || input.run.status === "cancelled"
      ? existingSyncRun
      : {
          status: terminalStatus,
          completedAt: input.completedAt,
          errorSummary: cancellation
            ? "Sync cancelled. Source data already synced is preserved."
            : terminalFailureSummary(input.phase),
        };

  return {
    syncRun,
    providerRuns: input.providerRuns.map((run) =>
      run.status === "running"
        ? {
            id: run.id,
            status: providerStatus,
            completedAt: input.completedAt,
            errorCode,
            errorMessage,
          }
        : {
            id: run.id,
            status: run.status,
            completedAt: run.completedAt ?? null,
            errorCode: run.errorCode ?? null,
            errorMessage: run.errorMessage ?? null,
          }
    ),
  };
}

export async function retryTerminalSyncFailureFinalization<T>(
  finalize: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: (attempt: number) => Promise<void>;
  } = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delay =
    options.delay ??
    ((attempt: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, attempt * 100);
      }));

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await finalize();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(attempt);
    }
  }

  throw lastError;
}

export async function runPlannerSummaryWrite<T>(
  operation: () => T | Promise<T>
): Promise<
  | { ok: true; value: T }
  | { ok: false; warning: string }
> {
  try {
    return { ok: true, value: await operation() };
  } catch {
    return {
      ok: false,
      warning:
        "Planner summary could not be saved; the next sync will plan again.",
    };
  }
}
