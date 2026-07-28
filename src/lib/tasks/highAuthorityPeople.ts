/**
 * Declared table of high-authority people whose instructions earn a scoring
 * boost, with explicit full names and their accepted short-form aliases.
 *
 * Rules:
 * - A bare first-name alias resolves ONLY to the single declared entry for
 *   that alias — "Lucas" always means Lucas Saeed, never Lucas Thomas.
 * - Matching uses \b word boundaries, so "Matthew Adams" does NOT match "Matt".
 * - A configured stakeholder string (from saved DB config) may be a full name
 *   or an alias; `resolveStakeholder` normalises both so old configs work
 *   without a data migration.
 */

export interface HighAuthorityPerson {
  readonly fullName: string;
  readonly aliases: readonly string[];
}

export const HIGH_AUTHORITY_PEOPLE: readonly HighAuthorityPerson[] = [
  { fullName: "Matt Pettit", aliases: ["Matt"] },
  { fullName: "Lucas Saeed", aliases: ["Lucas"] },
];

/** Canonical full names — use this wherever you need the display string. */
export const HIGH_AUTHORITY_FULL_NAMES: readonly string[] = HIGH_AUTHORITY_PEOPLE.map(
  (person) => person.fullName
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allTokens(person: HighAuthorityPerson): readonly string[] {
  return [person.fullName, ...person.aliases];
}

/**
 * Returns the canonical full name for a configured stakeholder string, or
 * `null` when the string does not resolve to any declared entry.
 *
 * Accepts full names ("Matt Pettit") and aliases ("Matt") case-insensitively,
 * so saved configs that stored bare first names keep working.
 */
export function resolveStakeholder(configured: string): HighAuthorityPerson | null {
  const lower = configured.trim().toLowerCase();
  if (!lower) return null;
  return (
    HIGH_AUTHORITY_PEOPLE.find((person) =>
      allTokens(person).some((token) => token.toLowerCase() === lower)
    ) ?? null
  );
}

/**
 * True when `text` names one of the `people` (defaults to `HIGH_AUTHORITY_PEOPLE`)
 * as an author or instruction-giver using word-boundary matching.
 *
 * Two modes are supported via the `authorField` flag:
 *
 * - `authorField: false` (default) — body / sentence mode.
 *   Matches any alias or full name as a word in a longer string.
 *   "Lucas said please fix the nav labels" → true (alias "Lucas" matched).
 *   "Matthew Adams reviewed the PR" → false ("Matt" not present as whole word).
 *
 * - `authorField: true` — author-name mode.
 *   A SHORT NAME (one word) may match an alias, but a MULTI-WORD name must
 *   match a declared full name exactly.  This prevents "Lucas Thomas" from
 *   matching via the "Lucas" alias: "Lucas Thomas" contains two words and
 *   "Lucas Thomas" is not any entry's full name.
 *   "Lucas" (one word) → true (alias match).
 *   "Lucas Thomas" (two words) → false (not a declared full name).
 *   "Lucas Saeed" (two words) → true (IS a declared full name).
 */
export function matchesStakeholder(
  text: string,
  people: readonly HighAuthorityPerson[] = HIGH_AUTHORITY_PEOPLE,
  { authorField = false }: { authorField?: boolean } = {}
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (authorField) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount === 1) {
      // Single-word author: allow alias matching.
      return people.some((person) =>
        allTokens(person).some(
          (token) => token.toLowerCase() === trimmed.toLowerCase()
        )
      );
    } else {
      // Multi-word author: only exact full-name match is safe.
      return people.some(
        (person) => person.fullName.toLowerCase() === trimmed.toLowerCase()
      );
    }
  }

  // Body / sentence mode: word-boundary match.
  //
  // For aliases (short names), we guard against false positives caused by
  // a different person having the same first name.  "Lucas Thomas reviewed
  // the PR" must NOT match the "Lucas" alias (Lucas Thomas ≠ Lucas Saeed).
  // But "Lucas said please fix" SHOULD match — the alias appears standalone.
  //
  // Rule: find each occurrence of the alias.  If the word immediately
  // following uses a capital letter (indicating a surname), treat it as a
  // full-name reference and check whether that full name is declared.
  // If the next word is lowercase (or there is no next word), accept it.
  return people.some((person) => {
    // Full-name check first (always case-insensitive).
    if (new RegExp(`\\b${escapeRegex(person.fullName)}\\b`, "i").test(trimmed)) return true;

    return person.aliases.some((alias) => {
      const aliasPattern = new RegExp(`\\b${escapeRegex(alias)}\\b`, "gi");
      let m: RegExpExecArray | null;
      while ((m = aliasPattern.exec(trimmed)) !== null) {
        const afterAlias = trimmed.slice(m.index + m[0].length);
        // Deliberately NOT using the `i` flag so `[A-Z]` means uppercase only.
        const nextWordMatch = afterAlias.match(/^\s+([A-Z][a-z]+)/);
        if (!nextWordMatch) {
          // Alias not followed by a capitalised word — standalone reference.
          return true;
        }
        // Alias IS followed by a capitalised word; form the compound name.
        const candidate = `${alias} ${nextWordMatch[1]}`;
        if (candidate.toLowerCase() === person.fullName.toLowerCase()) {
          return true;
        }
        // e.g. "Lucas Thomas" — not this person's full name; skip occurrence.
      }
      return false;
    });
  });
}

/**
 * Builds an effective people list from a configured `stakeholders` array,
 * which may contain full names or legacy bare first names.  Unknown strings
 * are silently dropped; if no entry resolves, falls back to the full default
 * list so the feature keeps working for unconfigured reports.
 */
export function effectiveStakeholderPeople(
  configured: readonly string[]
): readonly HighAuthorityPerson[] {
  const resolved = configured
    .map(resolveStakeholder)
    .filter((person): person is HighAuthorityPerson => person !== null);
  return resolved.length > 0 ? resolved : HIGH_AUTHORITY_PEOPLE;
}

/**
 * Formatted "First or Second" label for reason strings.
 * e.g. "Matt Pettit or Lucas Saeed"
 */
export function stakeholderLabel(
  people: readonly HighAuthorityPerson[] = HIGH_AUTHORITY_PEOPLE
): string {
  return people.map((person) => person.fullName).join(" or ");
}
