import type { SourceType } from "@/domain/sourceItem";

/** One primary focus per day — extras stay in the collapsed queue. */
export const DAILY_FOCUS_TASK_LIMIT = 1;

/**
 * Auto-sync imports knowledge from Granola but does not create queue tasks.
 * Tasks from meetings only when the user pastes or asks in chat (manual transcript).
 */
export function shouldAutoExtractTasksFromSource(sourceType: SourceType | string): boolean {
  return sourceType !== "calendar";
}

/** Jira Done / tagged-only issues stay as evidence signals — not Today focus tasks. */
export function shouldSkipJiraTaskExtraction(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!metadata) return false;
  if (metadata.statusCategoryKey === "done") return true;
  if (metadata.involvement === "mentioned") return true;
  const status = typeof metadata.status === "string" ? metadata.status.toLowerCase() : "";
  if (status === "done" || status === "closed" || status === "resolved") return true;
  return false;
}

export function shouldExtractTasksFromSourceItem(input: {
  sourceType: SourceType | string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (!shouldAutoExtractTasksFromSource(input.sourceType)) return false;
  if (input.sourceType === "jira" && shouldSkipJiraTaskExtraction(input.metadata)) {
    return false;
  }
  return true;
}
