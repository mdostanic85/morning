import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferLegacyOwnershipDecision,
  isConfirmedOwnership,
  isRejectedOwnership,
} from "./ownershipDecision";

describe("ownershipDecision", () => {
  it("detects rejected ownership from durable field", () => {
    assert.equal(isRejectedOwnership({ ownershipDecision: "rejected_not_mine" }), true);
  });

  it("detects legacy rejected ownership from reason note", () => {
    assert.equal(
      isRejectedOwnership({
        reason: "Some task (Not mine: user marked this as not their responsibility.)",
      }),
      true
    );
  });

  it("detects confirmed ownership", () => {
    assert.equal(isConfirmedOwnership({ ownershipDecision: "confirmed_mine" }), true);
  });

  it("infers legacy rejected decision for backfill", () => {
    assert.equal(
      inferLegacyOwnershipDecision(
        "Task reason (Not mine: user marked this as not their responsibility.)"
      ),
      "rejected_not_mine"
    );
  });
});
