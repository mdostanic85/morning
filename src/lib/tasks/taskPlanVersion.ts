import { createHash } from "node:crypto";

export type TaskProgressItemType = "step" | "done_criterion";

export function hashTaskPlanVersion(steps: string[], doneCriteria: string[]): string {
  const payload = JSON.stringify({
    steps: steps.map((entry) => entry.trim()),
    doneCriteria: doneCriteria.map((entry) => entry.trim()),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function stablePlanItemId(
  itemType: TaskProgressItemType,
  index: number,
  text: string
): string {
  const digest = createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 10);
  return `${itemType}-${index}-${digest}`;
}

export function isExternalApprovalCriterion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    /^(wait(ing)? for|needs?|requires?)\b/.test(normalized) ||
    /\b(sign[- ]?off|approval|approved by|final review)\b/.test(normalized)
  );
}
