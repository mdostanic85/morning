export type ConfidenceBand = "high" | "medium" | "low" | "not_scored";

export const CONFIDENCE_EXPLANATION =
  "How likely Worklight is to have understood this task correctly from these sources. This is not priority.";

export function confidenceBand(value: number | null | undefined): ConfidenceBand {
  if (value == null || !Number.isFinite(value)) return "not_scored";
  if (value >= 0.7) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

export function formatConfidenceLabel(value: number | null | undefined): string {
  const band = confidenceBand(value);
  switch (band) {
    case "high":
      return `AI confidence: High (${Math.round((value ?? 0) * 100)}%)`;
    case "medium":
      return "AI confidence: Medium (40–69%)";
    case "low":
      return "AI confidence: Low (under 40%)";
    case "not_scored":
      return "AI confidence: Not scored";
  }
}

export function confidenceNeedsReview(value: number | null | undefined): boolean {
  const band = confidenceBand(value);
  return band === "low" || band === "not_scored";
}
