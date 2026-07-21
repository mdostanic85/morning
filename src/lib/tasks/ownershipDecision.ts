import type { OwnershipDecision } from "@/domain/workTask";

const LEGACY_NOT_MINE_NOTE = "Not mine: user marked this as not their responsibility.";

export function isRejectedOwnership(
  task: Pick<{ ownershipDecision?: OwnershipDecision | null; reason?: string | null }, "ownershipDecision" | "reason">
): boolean {
  if (task.ownershipDecision === "rejected_not_mine") return true;
  return Boolean(task.reason?.includes(LEGACY_NOT_MINE_NOTE));
}

export function isConfirmedOwnership(
  task: Pick<{ ownershipDecision?: OwnershipDecision | null }, "ownershipDecision">
): boolean {
  return task.ownershipDecision === "confirmed_mine";
}

export function inferLegacyOwnershipDecision(
  reason: string | null | undefined
): OwnershipDecision | null {
  if (!reason?.includes(LEGACY_NOT_MINE_NOTE)) return null;
  return "rejected_not_mine";
}
