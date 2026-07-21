import type { Evidence } from "@/domain/evidence";

export interface TaskEvidenceSource {
  id: number;
  title: string;
}

export interface TaskEvidenceEntry {
  evidence: Evidence;
  sourceTitle: string;
  excerpt: string;
  hasUrl: boolean;
}

/**
 * Task-level evidence for outcome detail. Until criterion-to-evidence links exist
 * (Release B), never pair evidence to a criterion by array index.
 */
export function buildTaskEvidenceEntries(
  evidence: Evidence[],
  sourcesById: ReadonlyMap<number, TaskEvidenceSource>
): TaskEvidenceEntry[] {
  return evidence.map((item) => {
    const sourceTitle = sourcesById.get(item.sourceItemId)?.title ?? "Unknown source";
    const excerpt = item.quote?.trim() || item.summary.trim();
    return {
      evidence: item,
      sourceTitle,
      excerpt,
      hasUrl: Boolean(item.url?.trim()),
    };
  });
}

export function hasTaskEvidence(evidence: Evidence[]): boolean {
  return evidence.length > 0;
}
