/**
 * Collapse a raw reason/explanation blob into one short, plain paragraph.
 * Source text can carry bullet separators ("·"), pipes, and many merged
 * evidence sentences. Headline copy must read as a couple of clear
 * sentences, not a dump of tags and unrelated clauses. The full text stays
 * available elsewhere, for example behind a "show more" disclosure. This only
 * controls what renders as the lead summary.
 */
export function humanizeReason(
  raw: string | null | undefined,
  title: string,
  options?: { maxSentences?: number; maxLength?: number }
): string {
  const fallback = "This item needs source review before it can become actionable.";
  if (!raw?.trim()) return fallback;

  const maxSentences = options?.maxSentences ?? 2;
  const maxLength = options?.maxLength ?? 220;

  const cleaned = raw
    .replace(/[•·]/g, ". ")
    .replace(/\s*\|\s*/g, ". ")
    .replace(/\s+[—–]\s+/g, ". ")
    .replace(/^(?:now|next|later|tomorrow|waiting|unclear)\s*[-:]\s*/i, "")
    .replace(/^priority\s+\d+(?:\.\d+)?%?\s*[-:]\s*/i, "")
    .replace(/\bit is important to note that\b[:,]?\s*/gi, "")
    .replace(/\bit is worth noting that\b[:,]?\s*/gi, "")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\badditionally,\s*/gi, "")
    .replace(/\bfurthermore,\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;

  const titleLower = title.trim().toLowerCase();
  const seen = new Set<string>();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      const normalized = sentence
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      if (sentence.length <= 3 || normalized === titleLower || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

  const picked = (sentences.slice(0, maxSentences).join(" ") || cleaned).trim();
  if (picked.length <= maxLength) return picked;
  return `${picked.slice(0, maxLength - 3).trimEnd()}...`;
}
