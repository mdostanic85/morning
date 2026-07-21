import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSourceContentHash } from "./sourceContentHash";

const BASE = {
  title: "UATL-367 · Convert file manager to Canvas",
  body: "Matt asked us to convert the file manager view to use Canvas.",
  author: "Matt",
  sourceDate: "2026-07-18T09:00:00.000Z",
  url: "https://example.atlassian.net/browse/UATL-367",
};

// WL-03: content_hash detects real edits so a revision can be recorded, and
// stays stable across metadata-only churn so identical re-syncs don't spawn
// spurious revisions.
describe("computeSourceContentHash", () => {
  it("is stable for identical input", () => {
    assert.equal(computeSourceContentHash(BASE), computeSourceContentHash({ ...BASE }));
  });

  it("changes when the body changes", () => {
    const hash1 = computeSourceContentHash(BASE);
    const hash2 = computeSourceContentHash({ ...BASE, body: `${BASE.body} Also ship by Friday.` });
    assert.notEqual(hash1, hash2);
  });

  it("changes when the title changes", () => {
    const hash1 = computeSourceContentHash(BASE);
    const hash2 = computeSourceContentHash({ ...BASE, title: "A different title" });
    assert.notEqual(hash1, hash2);
  });

  it("treats missing author/url the same as null author/url", () => {
    const withNulls = computeSourceContentHash({ ...BASE, author: null, url: null });
    const withoutFields = computeSourceContentHash({
      title: BASE.title,
      body: BASE.body,
      sourceDate: BASE.sourceDate,
    });
    assert.equal(withNulls, withoutFields);
  });

  it("changes when the source date changes", () => {
    const hash1 = computeSourceContentHash(BASE);
    const hash2 = computeSourceContentHash({ ...BASE, sourceDate: "2026-07-19T09:00:00.000Z" });
    assert.notEqual(hash1, hash2);
  });
});
