const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_SCORE = 4;

export interface RelevanceSource {
  sourceType: string;
  title: string;
  body: string;
  sourceDate: string;
}

function tokens(text: string): string[] {
  return Array.from(
    new Set((text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((token) => token.length >= 4))
  );
}

function recencyBonus(sourceDate: string): number {
  const age = Date.now() - new Date(sourceDate).getTime();
  if (Number.isNaN(age) || age < 0) return 0;
  if (age <= 24 * 60 * 60 * 1000) return 5;
  if (age <= LOOKBACK_MS) return 3;
  return 0;
}

export function scoreSourceRelevance(
  source: RelevanceSource,
  focusTitle: string,
  jiraKey: string | null
): number {
  const haystack = `${source.title} ${source.body}`.toLowerCase();
  let score = recencyBonus(source.sourceDate);

  if (jiraKey && haystack.includes(jiraKey.toLowerCase())) {
    score += 12;
  }

  for (const token of tokens(focusTitle)) {
    if (haystack.includes(token)) score += 2;
  }

  return score;
}

export function relevantContextSources<T extends RelevanceSource>(
  sourceItems: T[],
  focusTitle: string,
  jiraKey: string | null,
  options?: { types?: string[]; limit?: number; minScore?: number }
): T[] {
  const types = new Set(options?.types ?? ["gmail", "granola", "confluence"]);
  const limit = options?.limit ?? 2;
  const minScore = options?.minScore ?? MIN_SCORE;

  return sourceItems
    .filter((item) => types.has(item.sourceType))
    .map((item) => ({
      item,
      score: scoreSourceRelevance(item, focusTitle, jiraKey),
    }))
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.sourceDate).getTime() - new Date(a.item.sourceDate).getTime();
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function extractGranolaQuote(body: string): string {
  const summaryMatch = body.match(/Meeting summary:\s*([\s\S]*?)(?:\n\nTranscript:|$)/i);
  const summary = summaryMatch?.[1]?.trim();
  if (summary && summary !== "(no summary)") {
    return summary.length > 480 ? `${summary.slice(0, 480).trimEnd()}…` : summary;
  }

  const transcriptMatch = body.match(/Transcript:\s*([\s\S]+)/i);
  const transcript = transcriptMatch?.[1]?.trim();
  if (transcript) {
    const firstLines = transcript.split("\n").filter(Boolean).slice(0, 3).join("\n");
    return firstLines.length > 480 ? `${firstLines.slice(0, 480).trimEnd()}…` : firstLines;
  }

  const trimmed = body.trim();
  return trimmed.length > 480 ? `${trimmed.slice(0, 480).trimEnd()}…` : trimmed;
}
