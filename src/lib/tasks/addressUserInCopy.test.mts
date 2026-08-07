import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressUserInCopy } from "./addressUserInCopy.ts";

describe("addressUserInCopy", () => {
  it("leaves text alone without a user name", () => {
    assert.equal(addressUserInCopy("Miloš needs to update Figma", null), "Miloš needs to update Figma");
  });

  it("rewrites possessive and actor phrasing to second person", () => {
    assert.equal(
      addressUserInCopy("Miloš's designs need edge cases", "Miloš Dostanic"),
      "Your designs need edge cases"
    );
    assert.equal(
      addressUserInCopy("Milos needs to confirm with Lucas", "Milos Dostanic"),
      "You need to confirm with Lucas"
    );
    assert.equal(
      addressUserInCopy("Milos to send the credentials", "Milos Dostanic"),
      "Send the credentials"
    );
  });

  it("matches š/s spellings interchangeably", () => {
    assert.equal(
      addressUserInCopy("Directly relevant to Miloš", "Milos Dostanic"),
      "Directly relevant to you"
    );
  });

  it("preserves meeting-style Name & Other titles", () => {
    assert.equal(
      addressUserInCopy("Milos & Lucas sync", "Milos Dostanic"),
      "Milos & Lucas sync"
    );
  });

  it("does not invent changes when the name is absent", () => {
    assert.equal(
      addressUserInCopy("Lucas will ship the PRD update", "Milos Dostanic"),
      "Lucas will ship the PRD update"
    );
  });
});
