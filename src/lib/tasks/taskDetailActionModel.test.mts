import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOCAL_STATUS_LABELS,
  localStatusLabel,
  resolveDetailPrimaryCta,
} from "./taskDetailActionModel";

describe("taskDetailActionModel", () => {
  it("maps each local status to a human label", () => {
    assert.equal(localStatusLabel("now"), "In progress");
    assert.equal(localStatusLabel("unclear"), "Needs clarification");
    assert.equal(localStatusLabel("done"), "Done locally");
    assert.equal(Object.keys(LOCAL_STATUS_LABELS).length, 7);
  });

  it("reuses focus primary CTA resolution for detail view", () => {
    const cta = resolveDetailPrimaryCta({
      figmaFrameUrl: "https://www.figma.com/file/abc",
      status: "next",
    });
    assert.equal(cta.label, "Open in Figma");
  });
});
