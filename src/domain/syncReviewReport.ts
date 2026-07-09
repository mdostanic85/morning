export interface SyncReviewReport {
  id: number;
  taskId: number;
  summary: string;
  ok: string[];
  notOk: string[];
  conflicts: string[];
  githubBranch: string | null;
  figmaUrl: string | null;
  recommendedNextAction: string;
  confidence: number | null;
  createdAt: string;
}

export type NewSyncReviewReport = Pick<
  SyncReviewReport,
  "taskId" | "summary" | "recommendedNextAction"
> &
  Partial<
    Pick<
      SyncReviewReport,
      "ok" | "notOk" | "conflicts" | "githubBranch" | "figmaUrl" | "confidence"
    >
  >;
