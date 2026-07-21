import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Evidence } from "@/domain/evidence";
import {
  buildTaskEvidenceEntries,
  hasTaskEvidence,
} from "./outcomeEvidencePresentation";

function evidence(overrides: Partial<Evidence> & Pick<Evidence, "id">): Evidence {
  return {
    taskId: 1,
    sourceItemId: 10,
    quote: null,
    summary: "Summary text",
    sourceDate: "2026-07-22T00:00:00.000Z",
    url: null,
    ...overrides,
  };
}

describe("outcomeEvidencePresentation", () => {
  it("lists all task evidence without pairing by criterion index", () => {
    const items = [
      evidence({ id: 1, quote: "First quote", sourceItemId: 10 }),
      evidence({ id: 2, quote: "Second quote", sourceItemId: 20 }),
    ];
    const sources = new Map([
      [10, { id: 10, title: "Granola · Standup" }],
      [20, { id: 20, title: "Jira · UATL-408" }],
    ]);

    const entries = buildTaskEvidenceEntries(items, sources);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.excerpt, "First quote");
    assert.equal(entries[1]?.excerpt, "Second quote");
    assert.equal(entries[0]?.sourceTitle, "Granola · Standup");
    assert.equal(entries[1]?.sourceTitle, "Jira · UATL-408");
  });

  it("keeps entries stable when evidence order changes", () => {
    const first = evidence({ id: 1, quote: "Alpha", sourceItemId: 10 });
    const second = evidence({ id: 2, quote: "Beta", sourceItemId: 20 });
    const sources = new Map([
      [10, { id: 10, title: "Source A" }],
      [20, { id: 20, title: "Source B" }],
    ]);

    const original = buildTaskEvidenceEntries([first, second], sources);
    const reordered = buildTaskEvidenceEntries([second, first], sources);

    assert.notDeepEqual(
      original.map((entry) => entry.excerpt),
      reordered.map((entry) => entry.excerpt)
    );
    assert.deepEqual(
      original.map((entry) => entry.evidence.id).sort(),
      reordered.map((entry) => entry.evidence.id).sort()
    );
  });

  it("falls back to summary when quote is missing", () => {
    const entries = buildTaskEvidenceEntries(
      [evidence({ id: 1, quote: null, summary: "Only summary" })],
      new Map([[10, { id: 10, title: "Email" }]])
    );
    assert.equal(entries[0]?.excerpt, "Only summary");
  });

  it("reports whether task-level evidence exists", () => {
    assert.equal(hasTaskEvidence([]), false);
    assert.equal(hasTaskEvidence([evidence({ id: 1 })]), true);
  });
});
