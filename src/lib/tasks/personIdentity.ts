/**
 * WL-10 — deterministic person-identity resolution.
 *
 * Never auto-merges two distinct-looking people. Only two patterns resolve
 * automatically:
 *   1. An exact match (case/diacritic-insensitive) to an already-known alias.
 *   2. An unambiguous first-name match — exactly one existing person shares
 *      that first name. This is required by the acceptance criterion itself
 *      ("two sources naming 'Matt' -> single person entity") and mirrors the
 *      first-name heuristic `ownerFilter.ts` already trusts for filtering.
 * Anything else (zero matches, or two+ different people sharing a name) is
 * left unresolved rather than guessed — per ai-safety's ambiguity handling,
 * a real identity merge across *different*-looking names requires an
 * explicit, separate confirmation (see `services/people.ts` mergePersonInto).
 */

export function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Extracts the display name from common composite strings that connectors
 * emit before passing a name to the identity pipeline:
 *
 * - "Alice Smith <alice@example.com>"  → "Alice Smith"
 * - "alice@example.com"               → null  (bare email, not a displayable name)
 * - "Unknown attendee"                → null  (calendar placeholder)
 * - "Unknown"                         → null
 * - anything else                     → the original string (trimmed)
 */
export function extractDisplayName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "Display Name <email>" — take the part before the angle bracket.
  const angleMatch = trimmed.match(/^(.+?)\s*<[^>]+>$/);
  if (angleMatch) {
    const display = angleMatch[1].trim();
    return display || null;
  }

  // Bare email address (contains @ but no space before it).
  if (/^[^\s]+@[^\s]+$/.test(trimmed)) return null;

  // Calendar / connector placeholder strings.
  if (/^unknown(\s+attendee)?$/i.test(trimmed)) return null;

  return trimmed;
}

export interface PersonAliasRecord {
  personId: number;
  alias: string;
}

/**
 * Resolves a free-text name to an existing person id, or `null` when no safe
 * (non-ambiguous) match exists.
 */
export function resolvePersonIdFromAliases(
  name: string,
  aliases: PersonAliasRecord[]
): number | null {
  const normalized = normalizePersonName(name);
  if (!normalized) return null;

  const exactMatches = aliases.filter((entry) => normalizePersonName(entry.alias) === normalized);
  const exactPersonIds = new Set(exactMatches.map((entry) => entry.personId));
  if (exactPersonIds.size === 1) return exactMatches[0].personId;
  if (exactPersonIds.size > 1) return null; // two different people already share this exact alias — ambiguous

  const firstName = normalized.split(" ")[0];
  if (!firstName || firstName.length < 3) return null;
  const firstNameMatches = aliases.filter(
    (entry) => normalizePersonName(entry.alias).split(" ")[0] === firstName
  );
  const firstNamePersonIds = new Set(firstNameMatches.map((entry) => entry.personId));
  if (firstNamePersonIds.size === 1) return firstNameMatches[0].personId;
  return null; // zero, or 2+ distinct people share this first name — never guess
}
