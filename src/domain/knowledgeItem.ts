export const KNOWLEDGE_ITEM_TYPES = [
  "requirement",
  "decision",
  "open_question",
  "risk",
  "deadline",
  "stakeholder_preference",
  "acceptance_criteria",
] as const;
export type KnowledgeItemType = (typeof KNOWLEDGE_ITEM_TYPES)[number];

export interface KnowledgeItem {
  id: number;
  projectId: number | null;
  type: KnowledgeItemType;
  title: string;
  content: string;
  sourceItemId: number | null;
  /** 0..1 */
  confidence: number | null;
  createdAt: string;
}

export type NewKnowledgeItem = Pick<KnowledgeItem, "type" | "title" | "content"> &
  Partial<Pick<KnowledgeItem, "projectId" | "sourceItemId" | "confidence">>;
