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
  title: string;
  url: string | null;
  sourceType: string;
  metadata: Record<string, unknown>;
}

export interface ConnectorSyncResult {
  ok: boolean;
  imported: number;
  skipped: number;
  /** Extracted tasks added to the Today queue. */
  tasksExtracted: number;
  errors: string[];
  importedItems: ImportedSourceItem[];
  knowledgeExtracted: {
    id: number;
    type: string;
    title: string;
    content: string;
    confidence: number | null;
    evidenceQuotes: string[];
    isUnclear: boolean;
  }[];
}
