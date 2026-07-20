import type { SourceType } from "@/domain/sourceItem";

export interface EvidenceItem {
  id: number;
  quote: string | null;
  summary: string;
  sourceTitle?: string;
  sourceType?: SourceType;
  sourceUrl?: string | null;
  sourceDate?: string | null;
  sourceAuthor?: string | null;
}
