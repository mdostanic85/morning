import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFocusPrimaryCta } from "./focusPrimaryCta";
import {
  hashTaskPlanVersion,
  isExternalApprovalCriterion,
  stablePlanItemId,
} from "./taskPlanVersion";

describe("taskPlanVersion", () => {
  it("hashTaskPlanVersion is stable for the same plan", () => {
    const steps = ["Open Figma", "Annotate gaps"];
    const done = ["PR updated", "Matt approved"];
    assert.equal(hashTaskPlanVersion(steps, done), hashTaskPlanVersion(steps, done));
  });

  it("hashTaskPlanVersion changes when plan text changes", () => {
    const a = hashTaskPlanVersion(["Step A"], ["Done A"]);
    const b = hashTaskPlanVersion(["Step B"], ["Done A"]);
    assert.notEqual(a, b);
  });

  it("stablePlanItemId stays stable for the same text", () => {
    assert.equal(
      stablePlanItemId("step", 0, "Review PRD section 3"),
      stablePlanItemId("step", 0, "Review PRD section 3")
    );
  });

  it("detects external approval criteria", () => {
    assert.equal(isExternalApprovalCriterion("Waiting for Matt sign-off"), true);
    assert.equal(isExternalApprovalCriterion("Update the Figma frame"), false);
  });
});

describe("focusPrimaryCta", () => {
  it("prefers Figma when a frame link exists", () => {
    const cta = resolveFocusPrimaryCta({
      figmaFrameUrl: "https://www.figma.com/file/abc",
      linkedJiraUrl: "https://jira.example.com/browse/UATL-1",
      status: "next",
    });
    assert.equal(cta.label, "Open in Figma");
    assert.equal(cta.href, "https://www.figma.com/file/abc");
  });

  it("uses continue work scroll target for in-progress tasks without links", () => {
    const cta = resolveFocusPrimaryCta({ status: "now" });
    assert.equal(cta.label, "Continue work");
    assert.equal(cta.href, null);
    assert.equal(cta.scrollTargetId, "redosled");
  });
});
