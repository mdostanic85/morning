import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProviderSyncFullyOk } from "./providerSyncStatus";
import type { ConnectorSyncResult } from "@/lib/connectors/types";

function baseResult(overrides: Partial<ConnectorSyncResult> = {}): ConnectorSyncResult {
  return {
    ok: true,
    imported: 3,
    skipped: 0,
    itemsCreated: 3,
    itemsUpdated: 0,
    itemsUnchanged: 0,
    itemsFailed: 0,
    itemsExtractionFailed: 0,
    tasksExtracted: 2,
    errors: [],
    importedItems: [],
    extractedTasks: [],
    knowledgeExtracted: [],
    ...overrides,
  };
}

// WL-01/WL-02: syncProvider.ts previously returned `{ ok: true }`
// unconditionally whenever no exception was thrown, ignoring
// importResult.ok/itemsFailed entirely — and extraction failures
// never even touched itemsFailed, so they were invisible to any gate. Each
// case below first states what the pre-fix code would have reported (always
// "fully ok"), then asserts the fixed, honest outcome.
describe("isProviderSyncFullyOk (WL-01 honest provider status / WL-02 cursor gate)", () => {
  it("is fully ok when every item persisted and every extraction succeeded", () => {
    const result = baseResult();
    assert.equal(isProviderSyncFullyOk(result), true);
  });

  it("case 1 — a persist exception increments itemsFailed and must not be fully ok", () => {
    // Pre-fix: syncProvider.ts:193 returned `{ ok: true }` here regardless.
    const result = baseResult({ ok: false, itemsFailed: 1, imported: 2 });
    assert.equal(isProviderSyncFullyOk(result), false);
  });

  it("case 2 — extraction fails but persist succeeds (itemsFailed stays 0) and must still not be fully ok", () => {
    // This is the dominant silent-failure mode: result.ok stays true and
    // itemsFailed stays 0 because only the persist-layer catch increments
    // it. A fixture that only checks itemsFailed===1 would miss this case.
    const result = baseResult({ ok: true, itemsFailed: 0, itemsExtractionFailed: 1 });
    assert.equal(isProviderSyncFullyOk(result), false);
  });

  it("is not fully ok when both persist and extraction failures are present", () => {
    const result = baseResult({ ok: false, itemsFailed: 1, itemsExtractionFailed: 2 });
    assert.equal(isProviderSyncFullyOk(result), false);
  });

  it("a provider with zero imported items (nothing to fail) is fully ok", () => {
    const result = baseResult({ imported: 0, itemsCreated: 0, tasksExtracted: 0 });
    assert.equal(isProviderSyncFullyOk(result), true);
  });

  it("missing embeddings remain a warning and do not fail source sync", () => {
    const result = baseResult({
      warnings: ["Source 39 indexed without embeddings: OpenAI is off."],
    });
    assert.equal(isProviderSyncFullyOk(result), true);
  });
});
