/**
 * Deterministic "does the focus card contradict itself?" check.
 *
 * The top card asserts four things at once: a title, done criteria, one next
 * action, and one evidence excerpt. Extraction merges can fuse two unrelated
 * jobs into a single task, and when that happens the card has been observed
 * stating a next action derived from an unrelated quote while its title and
 * done criteria describe entirely different work (UATL-380: "Draft concept
 * banner images" carrying "Update the component in Figma to include a focused
 * state style for the empty input field" alongside a Figma comment about a
 * focused empty input). Both halves were internally plausible, so nothing in
 * the UI caught it.
 *
 * `ai-safety.mdc` forbids presenting a next action that is not grounded in the
 * evidence shown with it. This module is the display-time enforcement of that
 * rule. It answers two questions before the card is rendered:
 *
 *   1. Grounded — does any visible evidence row actually support the action?
 *      The supporting row is then the one the card shows, instead of "whichever
 *      row happened to carry a quote".
 *   2. Consistent — does the action describe the same work as the card's own
 *      title and done criteria?
 *
 * Scoring reuses `topicOverlapScore`, the same predicate that decided which
 * evidence survived to be displayed, so grounding cannot disagree with the
 * filter that produced the visible rows.
 *
 * This is a warning gate, not a ranking input: it never reorders or hides work,
 * it only decides whether the action may be stated with confidence. False
 * accusations are therefore worse than misses, hence `MIN_JUDGEABLE_TOKENS` —
 * a three-word action shares nothing with any title, and that silence is not
 * evidence of a contradiction.
 *
 * Pure and dependency-light so the mismatch case is unit-testable without
 * rendering the view.
 */
import { significantTokens, topicOverlapScore } from "./transcriptTaskMerge";

/** Shared domain tokens required before two texts count as the same topic. */
export const MIN_TOPIC_OVERLAP = 2;

/**
 * Below this many domain tokens a text is too thin to judge. "Reply to Ana"
 * overlaps with nothing, and that is a short sentence rather than a mismatch.
 */
export const MIN_JUDGEABLE_TOKENS = 3;

const JIRA_KEY_PREFIX = /\b[A-Z][A-Z0-9]+-\d+\b:?\s*/g;

/** The evidence fields this check needs; the view's row type is a superset. */
export interface CoherenceEvidence {
  quote: string | null;
  summary: string;
}

/** Why the card may not state its next action as fact. */
export type FocusCoherenceGap =
  /** No visible evidence supports the action. */
  | "ungrounded"
  /** Evidence supports the action, but the action is about other work. */
  | "off-topic";

export interface FocusCoherence<E extends CoherenceEvidence> {
  /** The row to display: the one supporting the action when there is one. */
  evidence: E | null;
  grounded: boolean;
  consistent: boolean;
  /** Null when the card is coherent and the action may be stated plainly. */
  gap: FocusCoherenceGap | null;
}

/** A verbatim quote is the real proof; the summary is a paraphrase fallback. */
function evidenceText(item: CoherenceEvidence): string {
  return (item.quote ?? "").trim() || item.summary.trim();
}

function hasQuote(item: CoherenceEvidence): boolean {
  return Boolean(item.quote?.trim());
}

/**
 * Picks the evidence row that supports `nextAction`, and reports whether one
 * exists at all. When nothing supports the action the card still shows an
 * excerpt — hiding the evidence would leave the user with even less to check —
 * but `grounded` is false so the action can be marked unverified.
 */
export function selectGroundingEvidence<E extends CoherenceEvidence>(
  nextAction: string,
  evidence: readonly E[]
): { evidence: E | null; grounded: boolean } {
  let best: E | null = null;
  let bestScore = 0;

  for (const item of evidence) {
    const score = topicOverlapScore(evidenceText(item), nextAction);
    if (score < MIN_TOPIC_OVERLAP) continue;
    // Ties keep the earlier row, except that a verbatim quote outranks a
    // paraphrase that merely scored the same.
    const wins =
      score > bestScore || (score === bestScore && best != null && !hasQuote(best) && hasQuote(item));
    if (wins) {
      best = item;
      bestScore = score;
    }
  }

  if (best) return { evidence: best, grounded: true };
  return { evidence: evidence.find(hasQuote) ?? evidence[0] ?? null, grounded: false };
}

/**
 * Whether the next action describes the same work as the card's title and done
 * criteria. The Jira key is stripped first: "UATL-380" is an identifier, not a
 * topic, and matching on it would let any action pass.
 */
export function isActionConsistentWithTask(input: {
  nextAction: string;
  title: string;
  doneCriteria: readonly string[];
}): boolean {
  const selfText = `${input.title.replace(JIRA_KEY_PREFIX, " ")}\n${input.doneCriteria.join("\n")}`;

  if (
    significantTokens(input.nextAction).size < MIN_JUDGEABLE_TOKENS ||
    significantTokens(selfText).size < MIN_JUDGEABLE_TOKENS
  ) {
    // Not enough domain language on one side to call this a contradiction.
    return true;
  }

  return topicOverlapScore(input.nextAction, selfText) >= MIN_TOPIC_OVERLAP;
}

/**
 * Full verdict for one focus card. Ungrounded outranks off-topic: an action no
 * source supports is the more basic failure, and naming one gap is more useful
 * than listing two.
 */
export function assessFocusCoherence<E extends CoherenceEvidence>(input: {
  nextAction: string;
  title: string;
  doneCriteria: readonly string[];
  evidence: readonly E[];
}): FocusCoherence<E> {
  const { evidence, grounded } = selectGroundingEvidence(input.nextAction, input.evidence);
  const consistent = isActionConsistentWithTask(input);

  return {
    evidence,
    grounded,
    consistent,
    gap: !grounded ? "ungrounded" : !consistent ? "off-topic" : null,
  };
}
