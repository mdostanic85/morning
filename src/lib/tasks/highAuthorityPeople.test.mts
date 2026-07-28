import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchesStakeholder,
  resolveStakeholder,
  effectiveStakeholderPeople,
  stakeholderLabel,
  HIGH_AUTHORITY_PEOPLE,
} from "./highAuthorityPeople.ts";

describe("matchesStakeholder", () => {
  it("matches the declared full name", () => {
    assert.equal(matchesStakeholder("Matt Pettit"), true);
    assert.equal(matchesStakeholder("Lucas Saeed"), true);
  });

  it("matches the declared alias with word boundaries", () => {
    assert.equal(matchesStakeholder("Matt"), true);
    assert.equal(matchesStakeholder("Lucas"), true);
  });

  it("does NOT match partial substrings — the core defect fix", () => {
    assert.equal(matchesStakeholder("Matthew Adams"), false, "Matthew ≠ Matt");
    assert.equal(matchesStakeholder("matthew"), false, "matthew ≠ Matt");
  });

  it("does NOT grant Lucas Thomas the Lucas Saeed boost", () => {
    // Lucas Thomas is a real employee but not a declared high-authority person.
    // His full name must not match via the 'Lucas' alias.
    assert.equal(matchesStakeholder("Lucas Thomas"), false);
  });

  it("is case-insensitive", () => {
    assert.equal(matchesStakeholder("lucas saeed"), true);
    assert.equal(matchesStakeholder("MATT PETTIT"), true);
    assert.equal(matchesStakeholder("Lucas"), true);
  });

  it("matches inside a longer sentence", () => {
    assert.equal(matchesStakeholder("Lucas said please fix the nav labels"), true);
    assert.equal(matchesStakeholder("Matt asked for lighter banners"), true);
  });

  it("does not match on empty string", () => {
    assert.equal(matchesStakeholder(""), false);
  });
});

describe("resolveStakeholder", () => {
  it("resolves a full name", () => {
    assert.equal(resolveStakeholder("Matt Pettit")?.fullName, "Matt Pettit");
    assert.equal(resolveStakeholder("Lucas Saeed")?.fullName, "Lucas Saeed");
  });

  it("resolves a legacy bare first-name config (old saved config migration)", () => {
    assert.equal(resolveStakeholder("Matt")?.fullName, "Matt Pettit");
    assert.equal(resolveStakeholder("Lucas")?.fullName, "Lucas Saeed");
  });

  it("is case-insensitive", () => {
    assert.equal(resolveStakeholder("matt")?.fullName, "Matt Pettit");
    assert.equal(resolveStakeholder("LUCAS SAEED")?.fullName, "Lucas Saeed");
  });

  it("returns null for unknown strings", () => {
    assert.equal(resolveStakeholder("Lucas Thomas"), null);
    assert.equal(resolveStakeholder(""), null);
    assert.equal(resolveStakeholder("Joshua"), null);
  });
});

describe("effectiveStakeholderPeople", () => {
  it("resolves full names and aliases from configured list", () => {
    const people = effectiveStakeholderPeople(["Matt Pettit", "Lucas Saeed"]);
    assert.equal(people.length, 2);
  });

  it("resolves a legacy bare-name config without data migration", () => {
    const people = effectiveStakeholderPeople(["Matt", "Lucas"]);
    assert.equal(people.length, 2);
    assert.equal(people[0].fullName, "Matt Pettit");
    assert.equal(people[1].fullName, "Lucas Saeed");
  });

  it("falls back to the full default list when nothing resolves", () => {
    const people = effectiveStakeholderPeople(["UnknownPerson"]);
    assert.deepEqual(people, HIGH_AUTHORITY_PEOPLE);
  });

  it("falls back to the full default list on empty config", () => {
    const people = effectiveStakeholderPeople([]);
    assert.deepEqual(people, HIGH_AUTHORITY_PEOPLE);
  });
});

describe("stakeholderLabel", () => {
  it("joins full names with ' or '", () => {
    assert.equal(stakeholderLabel(), "Matt Pettit or Lucas Saeed");
  });

  it("uses the provided people list", () => {
    const people = effectiveStakeholderPeople(["Matt"]);
    assert.equal(stakeholderLabel(people), "Matt Pettit");
  });
});
