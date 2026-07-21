export const SYNC_RUN_TRIGGERS = ["manual", "scheduled"] as const;
export type SyncRunTrigger = (typeof SYNC_RUN_TRIGGERS)[number];

export const SYNC_RUN_MODES = ["full"] as const;
export type SyncRunMode = (typeof SYNC_RUN_MODES)[number];

export const SYNC_RUN_STATUSES = [
  "running",
  "cancelling",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const SYNC_PROVIDER_RUN_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export type SyncProviderRunStatus = (typeof SYNC_PROVIDER_RUN_STATUSES)[number];

export interface SyncRun {
  id: number;
  userId: number | null;
  trigger: SyncRunTrigger;
  mode: SyncRunMode;
  status: SyncRunStatus;
  startedAt: string;
  completedAt: string | null;
  cancelRequestedAt: string | null;
  errorSummary: string | null;
  whatsNew: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncProviderRun {
  id: number;
  syncRunId: number;
  provider: string;
  status: SyncProviderRunStatus;
  startedAt: string;
  completedAt: string | null;
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  itemsFailed: number;
  /** Persisted but failed task/knowledge/embedding interpretation (WL-01). */
  itemsExtractionFailed: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SyncProviderRunMetrics {
  itemsFetched: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  itemsFailed: number;
  itemsExtractionFailed: number;
}
