import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { candidateEvidenceVerified, quoteAppearsInSource } from "./evidenceVerification";

const SOURCE = `Matt: We should ship the Canvas file manager change by Friday.
Sofija: I'll follow up with design on the icon set.
There is no ticket for this yet.`;

describe("quoteAppearsInSource", () => {
  it("matches a verbatim quote", () => {
    assert.equal(
      quoteAppearsInSource("We should ship the Canvas file manager change by Friday.", SOURCE),
      true
    );
  });

  it("is case and whitespace insensitive", () => {
    assert.equal(quoteAppearsInSource("  we SHOULD   ship the canvas", SOURCE), true);
  });

  it("returns false for a fabricated quote not present in the source", () => {
    assert.equal(quoteAppearsInSource("We should ship it by Monday instead", SOURCE), false);
  });

  it("returns false for an empty quote", () => {
    assert.equal(quoteAppearsInSource("   ", SOURCE), false);
  });
});

describe("candidateEvidenceVerified", () => {
  it("is true when at least one quote verifies", () => {
    assert.equal(
      candidateEvidenceVerified(
        ["this quote is fabricated", "I'll follow up with design on the icon set."],
        SOURCE
      ),
      true
    );
  });

  it("is false when no quote verifies", () => {
    assert.equal(candidateEvidenceVerified(["completely made up", "also fake"], SOURCE), false);
  });

  it("is false for an empty evidence list", () => {
    assert.equal(candidateEvidenceVerified([], SOURCE), false);
  });
});
