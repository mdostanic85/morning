import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessFocusCoherence,
  isActionConsistentWithTask,
  selectGroundingEvidence,
} from "./focusCoherence";

/**
 * The observed defect. The top card showed "Draft concept banner images" with a
 * next action about a focused empty-input state, backed by a Figma comment that
 * did support that action — but neither had anything to do with banner images.
 * The action and its evidence agreed with each other, which is why a grounding
 * check alone would pass this card. The title and done criteria are what expose
 * it.
 */
const UATL_380 = {
  title: "UATL-380: Draft concept banner images",
  doneCriteria: [
    "Concept images exist for all six modules.",
    "The concept images are merged into a single banner.",
  ],
  nextAction:
    "Update the component in Figma to include a focused state style for the empty input field",
  evidence: [
    {
      quote: "Focused state when no information is entered",
      summary: "Figma comment on the input component.",
    },
  ],
};

describe("assessFocusCoherence", () => {
  it("flags the UATL-380 card whose action and evidence describe other work", () => {
    const result = assessFocusCoherence(UATL_380);

    // The quote really does back the action — that is the trap.
    assert.equal(result.grounded, true);
    assert.equal(result.consistent, false);
    assert.equal(result.gap, "off-topic");
  });

  it("flags an action that no visible evidence supports", () => {
    const result = assessFocusCoherence({
      title: "UATL-412: Unified search banner",
      doneCriteria: ["Banner mockups are shared for review."],
      nextAction: "Draft the search banner mockups for the unified page",
      evidence: [
        {
          quote: "Payroll export needs a CSV column for cost centre",
          summary: "Standup note about payroll export.",
        },
      ],
    });

    assert.equal(result.grounded, false);
    assert.equal(result.gap, "ungrounded");
  });

  it("treats a task with no evidence at all as ungrounded", () => {
    const result = assessFocusCoherence({
      title: "UATL-500: Rework the onboarding checklist",
      doneCriteria: ["The onboarding checklist is rewritten and shared."],
      nextAction: "Rewrite the onboarding checklist copy",
      evidence: [],
    });

    assert.equal(result.evidence, null);
    assert.equal(result.gap, "ungrounded");
  });

  it("passes a coherent card without a warning", () => {
    const result = assessFocusCoherence({
      title: "UATL-380: Draft concept banner images",
      doneCriteria: [
        "Concept images exist for all six modules.",
        "The concept images are merged into a single banner.",
      ],
      nextAction: "Draft the concept banner images for the remaining modules",
      evidence: [
        {
          quote: "We still need concept banner images for the last three modules",
          summary: "Sync with Lucas.",
        },
      ],
    });

    assert.equal(result.grounded, true);
    assert.equal(result.consistent, true);
    assert.equal(result.gap, null);
  });
});

describe("selectGroundingEvidence", () => {
  it("shows the row that supports the action, not merely the first quoted row", () => {
    const offTopic = {
      quote: "Payroll export needs a CSV column for cost centre",
      summary: "Standup note.",
    };
    const supporting = {
      quote: "The concept banner images still need the last three modules",
      summary: "Sync with Lucas.",
    };

    const result = selectGroundingEvidence(
      "Draft the concept banner images for the remaining modules",
      [offTopic, supporting]
    );

    assert.equal(result.evidence, supporting);
    assert.equal(result.grounded, true);
  });

  it("prefers a verbatim quote over a paraphrase that scored the same", () => {
    const paraphrased = {
      quote: null,
      summary: "Concept banner images are outstanding for three modules",
    };
    const quoted = {
      quote: "Concept banner images are outstanding for three modules",
      summary: "Sync with Lucas.",
    };

    const result = selectGroundingEvidence("Draft the concept banner images", [
      paraphrased,
      quoted,
    ]);

    assert.equal(result.evidence, quoted);
  });

  it("still returns an excerpt when nothing supports the action", () => {
    const only = { quote: "Unrelated payroll line", summary: "Standup note." };

    const result = selectGroundingEvidence("Draft the concept banner images", [only]);

    // Hiding the evidence would leave even less to check against.
    assert.equal(result.evidence, only);
    assert.equal(result.grounded, false);
  });
});

describe("isActionConsistentWithTask", () => {
  it("does not accuse a short action that has too little to match on", () => {
    assert.equal(
      isActionConsistentWithTask({
        nextAction: "Reply to Ana",
        title: "UATL-380: Draft concept banner images",
        doneCriteria: ["Concept images exist for all six modules."],
      }),
      true
    );
  });

  it("does not match on the Jira key alone", () => {
    assert.equal(
      isActionConsistentWithTask({
        nextAction: "Update UATL-380 with the focused empty input state styling",
        title: "UATL-380: Draft concept banner images",
        doneCriteria: ["Concept images exist for all six modules."],
      }),
      false
    );
  });
});
