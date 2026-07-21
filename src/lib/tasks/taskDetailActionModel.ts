import type { WorkTaskStatus } from "@/domain/workTask";
import { resolveFocusPrimaryCta, type FocusCtaInput } from "./focusPrimaryCta";

export const LOCAL_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  now: "In progress",
  next: "Up next",
  later: "Later",
  tomorrow: "Tomorrow",
  waiting: "Waiting on someone",
  unclear: "Needs clarification",
  done: "Done locally",
};

export interface QueuePositionAction {
  action: "start" | "skip" | "snooze" | "waiting";
  label: string;
}

export const QUEUE_POSITION_ACTIONS: QueuePositionAction[] = [
  { action: "start", label: "Start now" },
  { action: "skip", label: "Move to later today" },
  { action: "snooze", label: "Move to tomorrow" },
  { action: "waiting", label: "Mark as waiting" },
];

export function localStatusLabel(status: WorkTaskStatus): string {
  return LOCAL_STATUS_LABELS[status];
}

export function resolveDetailPrimaryCta(input: FocusCtaInput) {
  return resolveFocusPrimaryCta(input);
}
