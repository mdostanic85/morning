/**
 * WL-07 stage boundary: a deterministic fact ("does this quote actually
 * appear in the source?") computed once in code and handed to the cheap
 * reflect stage, rather than asking the model to re-derive or simply trust
 * its own prior claim. Pure and dependency-free — no LLM, no DB.
 */

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whitespace/case-insensitive substring check — deliberately lenient, not exact-verbatim. */
export function quoteAppearsInSource(quote: string, sourceBody: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (!normalizedQuote) return false;
  return normalizeForMatch(sourceBody).includes(normalizedQuote);
}

/** True when at least one of the candidate's evidence quotes verifies against the source. */
export function candidateEvidenceVerified(evidenceQuotes: string[], sourceBody: string): boolean {
  return evidenceQuotes.some((quote) => quoteAppearsInSource(quote, sourceBody));
}
