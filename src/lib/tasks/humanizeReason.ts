/**
 * Collapse a raw reason/explanation blob into one short, plain paragraph.
 * Source text can carry bullet separators ("·"), pipes, and many merged
 * evidence sentences — headline copy must read as a couple of clear
 * sentences, not a dump of tags and unrelated clauses. The full text stays
 * available elsewhere (e.g. behind a "show more" disclosure) — this only
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
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;

  const titleLower = title.trim().toLowerCase();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 3 && sentence.toLowerCase() !== titleLower);

  const picked = (sentences.slice(0, maxSentences).join(" ") || cleaned).trim();
  if (picked.length <= maxLength) return picked;
  return `${picked.slice(0, maxLength - 3).trimEnd()}…`;
}
