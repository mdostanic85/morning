export const VERIFICATION_VERDICTS = [
  "done",
  "mostly_done",
  "missing_work",
  "cannot_verify",
] as const;
export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

export interface VerificationReport {
  id: number;
  taskId: number;
  verdict: VerificationVerdict;
  matches: string[];
  missing: string[];
  risks: string[];
  recommendedNextAction: string;
  /** 0..1 */
  confidence: number | null;
  createdAt: string;
}

export type NewVerificationReport = Pick<
  VerificationReport,
  "taskId" | "verdict" | "recommendedNextAction"
> &
  Partial<Pick<VerificationReport, "matches" | "missing" | "risks" | "confidence">>;
