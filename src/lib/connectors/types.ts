import type { SourceType } from "@/domain/sourceItem";

export interface ConnectorSourceCandidate {
  sourceType: SourceType;
  sourceExternalId: string;
  title: string;
  body: string;
  author?: string | null;
  sourceDate: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
  projectId?: number | null;
}

export interface ImportedSourceItem {
  sourceItemId: number;
  title: string;
  url: string | null;
  sourceType: string;
  metadata: Record<string, unknown>;
  projectId: number | null;
  projectName: string | null;
}

export interface SyncExtractedTask {
  id: number;
  title: string;
  nextAction: string;
  projectId: number | null;
  projectName: string | null;
  sourceItemId: number;
  status: string;
}

export interface SyncKnowledgeItem {
  id: number;
  type: string;
  title: string;
  content: string;
  confidence: number | null;
  evidenceQuotes: string[];
  isUnclear: boolean;
  sourceItemId: number;
  projectId: number | null;
  projectName: string | null;
}

export interface ConnectorSyncResult {
  ok: boolean;
  imported: number;
  skipped: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsUnchanged: number;
  itemsFailed: number;
  /**
   * A source persisted successfully but its task/knowledge/embedding
   * interpretation failed (WL-01). Distinct from `itemsFailed`, which is
   * persist-layer failure only — this counter is what makes
   * extraction/embedding failures visible to sync completion status instead
   * of silently vanishing.
   */
  itemsExtractionFailed: number;
  /** Extracted tasks added to the Today queue. */
  tasksExtracted: number;
  errors: string[];
  /**
   * Non-blocking degradation such as unavailable semantic embeddings. Source
   * import and task extraction still succeeded, so these must not fail the
   * provider or prevent its incremental cursor from advancing.
   */
  warnings?: string[];
  importedItems: ImportedSourceItem[];
  extractedTasks: SyncExtractedTask[];
  knowledgeExtracted: SyncKnowledgeItem[];
}
