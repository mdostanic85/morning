import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideTaskVisibility, filterTasksForTodayView } from "./taskVisibility.ts";
import {
  JUL20_MY_NAME,
  jul20Tasks,
} from "../../../test/fixtures/jul20DailyBriefScenario.mts";

describe("taskVisibility", () => {
  it("keeps Jul 20 UATL-376 visible despite contaminated low confidence", () => {
    const uatl376 = jul20Tasks.find((task) => task.id === 430)!;
    const decision = decideTaskVisibility(uatl376, JUL20_MY_NAME);
    assert.equal(decision.visible, true);
    assert.notEqual(decision.reason, "other_owner");
  });

  it("keeps UATL-233 visible despite confidence below legacy 0.8 gate", () => {
    const uatl233 = jul20Tasks.find((task) => task.id === 431)!;
    assert.ok(uatl233.confidence != null && uatl233.confidence < 0.8);
    assert.equal(decideTaskVisibility(uatl233, JUL20_MY_NAME).visible, true);
  });

  it("does not hide owner:null tasks", () => {
    const decision = decideTaskVisibility(
      {
        id: 1,
        owner: null,
        confidence: 0.9,
        priorityScore: 0.5,
      },
      JUL20_MY_NAME
    );
    assert.equal(decision.visible, true);
    assert.equal(decision.reason, "null_owner_needs_classification");
    assert.equal(decision.treatAsUnclear, true);
  });

  it("hides tasks owned by someone else", () => {
    const decision = decideTaskVisibility(
      {
        id: 2,
        owner: "Sofija Example",
        confidence: 0.95,
        priorityScore: 0.95,
      },
      JUL20_MY_NAME
    );
    assert.equal(decision.visible, false);
    assert.equal(decision.reason, "other_owner");
  });

  it("hides Sofija Discord credentials even when owner field is null", () => {
    const decision = decideTaskVisibility(
      {
        id: 99,
        owner: null,
        confidence: 0.95,
        priorityScore: 0.95,
        title: "Send CPQ Discord Credentials to Daniel",
        reason: "Sofija to send CPQ Discord credentials to Daniel for testing",
        nextAction: "Send the credentials",
      },
      JUL20_MY_NAME
    );
    assert.equal(decision.visible, false);
    assert.equal(decision.reason, "other_owner");
  });

  it("characterization: legacy 0.8 gate would have dropped Jul 20 Jira tasks", () => {
    const legacyHidden = jul20Tasks.filter(
      (task) => task.confidence != null && task.confidence < 0.8
    );
    assert.ok(legacyHidden.some((task) => task.title.includes("UATL-376")));
    assert.ok(legacyHidden.some((task) => task.title.includes("UATL-233")));

    const visible = filterTasksForTodayView(jul20Tasks, JUL20_MY_NAME);
    assert.ok(visible.some((task) => task.id === 430));
    assert.ok(visible.some((task) => task.id === 431));
  });
});
