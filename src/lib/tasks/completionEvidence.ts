/**
 * Self-reported completion (Paket: transcript-authored completion signal).
 *
 * A task's own evidence can report that the underlying work is finished —
 * e.g. a meeting note saying "the design has been finalized" — even when
 * there is no Jira ticket to mark Done. This is a distinct authority from
 * Jira's mechanical status: it comes from the artifact/transcript itself,
 * and only the freshest evidence for a task is trusted to make this claim
 * (an old "already done" note must not override a newer open item).
 */

export type CompletionSignal = {
  sourceItemId: number;
  matchedText: string;
};

const COMPLETION_PATTERNS = [
  /\b\w+ (?:has been|is now|is) finaliz\w*\b/i,
  /\bdesign (?:has been |is )?finaliz\w*\b/i,
  /\balready (?:done|completed|shipped|resolved|closed)\b/i,
  /\bhas been (?:completed|resolved|shipped|closed)\b/i,
  /\bis (?:now )?(?:complete|completed|done|resolved|shipped|closed)\b/i,
];

function matchCompletionPhrase(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const pattern of COMPLETION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export type CompletionEvidenceItem = {
  sourceItemId: number;
  quote: string | null;
  summary: string;
  sourceDate: string;
};

/**
 * Only evidence from the same calendar day as the task's newest signal is
 * eligible to report completion — an old "finalized" note must not silence
 * evidence added afterward, and stale completion claims must not resurface.
 */
function freshestDayEvidence(evidence: CompletionEvidenceItem[]): CompletionEvidenceItem[] {
  const dated = evidence
    .map((item) => ({ item, time: new Date(item.sourceDate).getTime() }))
    .filter((entry) => Number.isFinite(entry.time));
  if (dated.length === 0) return [];
  const newestTime = Math.max(...dated.map((entry) => entry.time));
  const newestDay = new Date(newestTime).toISOString().slice(0, 10);
  return dated
    .filter((entry) => new Date(entry.time).toISOString().slice(0, 10) === newestDay)
    .map((entry) => entry.item);
}

export function detectSelfReportedCompletion(
  evidence: CompletionEvidenceItem[]
): CompletionSignal | null {
  for (const item of freshestDayEvidence(evidence)) {
    const matched = matchCompletionPhrase(item.summary) ?? matchCompletionPhrase(item.quote);
    if (matched) {
      return { sourceItemId: item.sourceItemId, matchedText: matched };
    }
  }
  return null;
}
