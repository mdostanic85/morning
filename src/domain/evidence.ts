export interface Evidence {
  id: number;
  taskId: number;
  sourceItemId: number;
  quote: string | null;
  summary: string;
  sourceDate: string;
  url: string | null;
}

export type NewEvidence = Pick<Evidence, "taskId" | "sourceItemId" | "summary" | "sourceDate"> &
  Partial<Pick<Evidence, "quote" | "url">>;
