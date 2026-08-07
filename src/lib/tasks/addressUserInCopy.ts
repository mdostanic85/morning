/**
 * Rewrite third-person references to the current user into second person
 * ("you" / "your") for UI-authored copy. Evidence quotes and other verbatim
 * source text must not go through this — leave those as written.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match s/š interchangeably so "Milos" and "Miloš" both rewrite. */
function nameTokenPattern(name: string): string {
  return escapeRegExp(name).replace(/[sš]/gi, "[sš]");
}

function nameVariants(userName: string): string[] {
  const full = userName.trim();
  if (!full) return [];
  const first = full.split(/\s+/)[0] ?? full;
  const unique = new Map<string, string>();
  for (const candidate of [full, first]) {
    const key = candidate.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((a, b) => b.length - a.length);
}

function applyNamePass(text: string, name: string): string {
  const token = nameTokenPattern(name);
  const boundary = `(?<![\\p{L}\\p{N}])${token}(?![\\p{L}\\p{N}])`;

  let result = text;

  // Possessive: "Miloš's designs" → "your designs"
  result = result.replace(new RegExp(`${boundary}(?:'s|’s|')`, "giu"), "your");

  // Common actor phrasing from extractors / planners
  result = result.replace(new RegExp(`${boundary}\\s+needs\\s+to\\b`, "giu"), "you need to");
  result = result.replace(new RegExp(`${boundary}\\s+has\\s+to\\b`, "giu"), "you have to");
  result = result.replace(new RegExp(`${boundary}\\s+should\\b`, "giu"), "you should");
  result = result.replace(new RegExp(`${boundary}\\s+must\\b`, "giu"), "you must");
  result = result.replace(new RegExp(`${boundary}\\s+will\\b`, "giu"), "you will");
  result = result.replace(new RegExp(`${boundary}\\s+can\\b`, "giu"), "you can");
  result = result.replace(new RegExp(`${boundary}\\s+is\\b`, "giu"), "you are");
  result = result.replace(new RegExp(`${boundary}\\s+was\\b`, "giu"), "you were");

  // "Name to <verb>…" titles / reasons → drop the name framing
  result = result.replace(new RegExp(`^${boundary}\\s+to\\s+`, "iu"), "");
  result = result.replace(new RegExp(`([.!?]\\s+)${boundary}\\s+to\\s+`, "giu"), "$1");

  // Prepositional references
  result = result.replace(
    new RegExp(`\\b(assigned to|owned by|relevant to|for|from|with)\\s+${boundary}`, "giu"),
    "$1 you"
  );

  // Remaining standalone mentions (skip meeting-style "Name & Other" / "Name and Other")
  result = result.replace(
    new RegExp(`${boundary}(?!\\s*(?:&|and)\\s+[\\p{L}])`, "giu"),
    "you"
  );

  return result;
}

function fixCapitalization(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

export function addressUserInCopy(
  text: string | null | undefined,
  userName: string | null | undefined
): string {
  const raw = text ?? "";
  if (!raw.trim() || !userName?.trim()) return raw;

  let result = raw;
  for (const variant of nameVariants(userName)) {
    result = applyNamePass(result, variant);
  }
  return fixCapitalization(result);
}
