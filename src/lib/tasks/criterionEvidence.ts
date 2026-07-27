import { createHash } from "node:crypto";
import type { Evidence } from "@/domain/evidence";
import { quoteAppearsInSource } from "@/lib/tasks/evidenceVerification";
import { stablePlanItemId } from "@/lib/tasks/taskPlanVersion";

export interface CriterionEvidenceLinkInput {
  criterion: string;
  quote: string;
}

export interface StoredCriterionEvidenceLink {
  criterionItemId: string;
  criterion: string;
  evidenceId: number;
}

export function criterionItemIdForText(criterion: string, index: number): string {
  return stablePlanItemId("done_criterion", index, criterion);
}

export function buildCriterionEvidenceLinks(
  doneCriteria: string[],
  inputs: CriterionEvidenceLinkInput[],
  evidenceRows: Evidence[],
  sourceBodiesByItemId: ReadonlyMap<number, string>
): StoredCriterionEvidenceLink[] {
  const links: StoredCriterionEvidenceLink[] = [];
  const usedEvidence = new Set<number>();

  for (const input of inputs) {
    const criterionIndex = doneCriteria.findIndex(
      (criterion) => criterion.trim().toLowerCase() === input.criterion.trim().toLowerCase()
    );
    if (criterionIndex < 0) continue;

    const evidence = evidenceRows.find((row) => {
      if (usedEvidence.has(row.id)) return false;
      const quote = row.quote?.trim() || row.summary.trim();
      if (!quote) return false;
      if (quote !== input.quote.trim() && !quote.includes(input.quote.trim())) return false;
      const sourceBody = sourceBodiesByItemId.get(row.sourceItemId) ?? "";
      return quoteAppearsInSource(input.quote, sourceBody || quote);
    });
    if (!evidence) continue;

    usedEvidence.add(evidence.id);
    links.push({
      criterionItemId: criterionItemIdForText(doneCriteria[criterionIndex]!, criterionIndex),
      criterion: doneCriteria[criterionIndex]!,
      evidenceId: evidence.id,
    });
  }

  return links;
}

export function evidenceForCriterion(
  criterionItemId: string,
  doneCriteria: string[],
  evidence: Evidence[],
  links: { criterionItemId: string; evidenceId: number }[]
): Evidence[] {
  const linkedIds = new Set(
    links.filter((link) => link.criterionItemId === criterionItemId).map((link) => link.evidenceId)
  );
  return evidence.filter((item) => linkedIds.has(item.id));
}

export function conflictKeyForSummary(summary: string): string {
  return createHash("sha256").update(summary.trim().toLowerCase()).digest("hex").slice(0, 16);
}
