import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePersonName, resolvePersonIdFromAliases, type PersonAliasRecord } from "./personIdentity";

describe("normalizePersonName", () => {
  it("folds case, diacritics, and whitespace", () => {
    assert.equal(normalizePersonName("  Sofija   Petrović "), "sofija petrovic");
    assert.equal(normalizePersonName("MATT"), "matt");
  });
});

describe("resolvePersonIdFromAliases (WL-10)", () => {
  it("resolves an exact match, case/diacritic-insensitive", () => {
    const aliases: PersonAliasRecord[] = [{ personId: 1, alias: "Matt Cohen" }];
    assert.equal(resolvePersonIdFromAliases("matt cohen", aliases), 1);
    assert.equal(resolvePersonIdFromAliases("MATT COHEN", aliases), 1);
  });

  it("returns null when no alias exists yet", () => {
    assert.equal(resolvePersonIdFromAliases("Nobody Yet", []), null);
  });

  // The acceptance criterion itself: two sources naming only "Matt" (no
  // last name ever given) must resolve to the same person entity.
  it("resolves an unambiguous first-name match: two mentions of 'Matt' become one person", () => {
    const aliases: PersonAliasRecord[] = [{ personId: 7, alias: "Matt Cohen" }];
    assert.equal(resolvePersonIdFromAliases("Matt", aliases), 7);
    assert.equal(resolvePersonIdFromAliases("matt", aliases), 7);
  });

  it("never guesses when two different people share the same first name", () => {
    const aliases: PersonAliasRecord[] = [
      { personId: 7, alias: "Matt Cohen" },
      { personId: 9, alias: "Matt Reyes" },
    ];
    assert.equal(resolvePersonIdFromAliases("Matt", aliases), null);
  });

  it("never guesses when two different people already share an identical exact alias", () => {
    const aliases: PersonAliasRecord[] = [
      { personId: 1, alias: "Alex Kim" },
      { personId: 2, alias: "Alex Kim" },
    ];
    assert.equal(resolvePersonIdFromAliases("Alex Kim", aliases), null);
  });

  it("does not match on a too-short first name (avoids noisy 2-letter collisions)", () => {
    const aliases: PersonAliasRecord[] = [{ personId: 1, alias: "Jo Smith" }];
    assert.equal(resolvePersonIdFromAliases("Jo", aliases), null);
  });

  it("returns null for an empty or whitespace-only name", () => {
    assert.equal(resolvePersonIdFromAliases("   ", [{ personId: 1, alias: "Matt" }]), null);
  });
});
