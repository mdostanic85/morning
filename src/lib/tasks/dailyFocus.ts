import type { SourceType } from "@/domain/sourceItem";

/** One primary focus per day — extras stay in the collapsed queue. */
export const DAILY_FOCUS_TASK_LIMIT = 1;

/**
 * Auto-sync imports knowledge from Granola but does not create queue tasks.
 * Tasks from meetings only when the user pastes or asks in chat (manual transcript).
 */
export function shouldAutoExtractTasksFromSource(sourceType: SourceType | string): boolean {
  return sourceType !== "granola";
}
