/** Human-readable labels for sync, connection, and provider statuses. */

export function formatSyncRunStatus(status: string | null | undefined): string {
  switch (status) {
    case "running":
      return "Syncing your day";
    case "cancelling":
      return "Cancelling sync";
    case "cancelled":
      return "Sync cancelled";
    case "completed":
      return "Sync complete";
    case "partially_completed":
      return "Finished with issues";
    case "failed":
      return "Sync failed";
    case "queued":
      return "Preparing your daily sync";
    default:
      return status ? status.replaceAll("_", " ") : "Unknown status";
  }
}

export function formatConnectionStatus(
  status: "connected" | "disconnected" | "error" | string
): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Not connected";
    case "error":
      return "Needs setup";
    default:
      return status.replaceAll("_", " ");
  }
}

export function formatProviderRunStatus(status: string): string {
  switch (status) {
    case "running":
      return "In progress";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  case "queued":
      return "Waiting";
    default:
      return status.replaceAll("_", " ");
  }
}

export function formatLocalTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
