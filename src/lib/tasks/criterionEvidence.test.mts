import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCriterionEvidenceLinks,
  criterionItemIdForText,
  evidenceForCriterion,
} from "./criterionEvidence";
import type { Evidence } from "@/domain/evidence";

function evidenceRow(overrides: Partial<Evidence> & Pick<Evidence, "id">): Evidence {
  return {
    taskId: 1,
    sourceItemId: 10,
    quote: null,
    summary: "Summary",
    sourceDate: "2026-07-22T00:00:00.000Z",
    url: null,
    ...overrides,
  };
}

describe("criterionEvidence", () => {
  it("builds stable criterion ids", () => {
    const idA = criterionItemIdForText("Ship the branch link", 0);
    const idB = criterionItemIdForText("Ship the branch link", 1);
    assert.notEqual(idA, idB);
    assert.equal(idA, criterionItemIdForText("Ship the branch link", 0));
  });

  it("links criterion quotes to verified evidence rows", () => {
    const doneCriteria = ["Share prototype branch with Matt"];
    const rows = [
      evidenceRow({ id: 1, quote: "Please share the prototype branch with Matt today." }),
      evidenceRow({ id: 2, quote: "Unrelated Sentry noise discussion." }),
    ];
    const links = buildCriterionEvidenceLinks(
      doneCriteria,
      [{ criterion: "Share prototype branch with Matt", quote: "Please share the prototype branch with Matt today." }],
      rows,
      new Map([[10, "Please share the prototype branch with Matt today."]])
    );
    assert.equal(links.length, 1);
    assert.equal(links[0]?.evidenceId, 1);
  });

  it("keeps criterion evidence stable when evidence order changes", () => {
    const criterionItemId = criterionItemIdForText("Criterion A", 0);
    const rows = [
      evidenceRow({ id: 2, quote: "Beta" }),
      evidenceRow({ id: 1, quote: "Alpha" }),
    ];
    const links = [{ criterionItemId, evidenceId: 1 }];
    const matched = evidenceForCriterion(criterionItemId, ["Criterion A"], rows, links);
    assert.deepEqual(matched.map((item) => item.id), [1]);
  });
});
