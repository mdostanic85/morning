import type { SourceType } from "@/domain/sourceItem";
import type { EvidenceItem } from "@/domain/evidenceItem";

interface SourceLookup {
  id: number;
  title: string;
  body: string;
  sourceType: SourceType;
  sourceDate: string;
  url: string | null;
}

function normalizeForMatch(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function findSourceForQuote(quote: string, sources: SourceLookup[]): SourceLookup | undefined {
  const normalizedQuote = normalizeForMatch(quote);
  if (!normalizedQuote) return undefined;

  const exact = sources.find((source) =>
    normalizeForMatch(source.body).includes(normalizedQuote)
  );
  if (exact) return exact;

  const snippet = normalizedQuote.slice(0, 80);
  if (snippet.length >= 20) {
    const partial = sources.find((source) =>
      normalizeForMatch(source.body).includes(snippet)
    );
    if (partial) return partial;
  }

  return sources.find((source) =>
    normalizedQuote.includes(normalizeForMatch(source.title).slice(0, 40))
  );
}

export function quotesToEvidenceItems(
  quotes: string[],
  sources: SourceLookup[]
): EvidenceItem[] {
  return quotes.map((quote, index) => {
    const source = findSourceForQuote(quote, sources);
    return {
      id: index,
      quote,
      summary: quote,
      sourceTitle: source?.title,
      sourceType: source?.sourceType,
      sourceUrl: source?.url ?? null,
      sourceDate: source?.sourceDate ?? null,
    };
  });
}
