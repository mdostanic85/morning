import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectDeliveryAudits, type DeliveryAuditCandidate } from "./deliveryAuditSelection";

const pinned = "https://www.figma.com/design/KEY/File?node-id=6611-28339";

function candidate(overrides: Partial<DeliveryAuditCandidate> = {}): DeliveryAuditCandidate {
  return {
    taskId: 521,
    status: "later",
    frameUrl: pinned,
    newestEvidenceAt: "2026-07-27T14:45:59.865+0200",
    lastReviewedAt: null,
    ...overrides,
  };
}

describe("selectDeliveryAudits", () => {
  it("picks a parked task whose evidence points at a pinned frame", () => {
    assert.deepEqual(selectDeliveryAudits([candidate()], { limit: 5 }), [521]);
  });

  it("skips tasks already covered by today's queue", () => {
    assert.deepEqual(
      selectDeliveryAudits([candidate()], { skipTaskIds: [521], limit: 5 }),
      []
    );
  });

  it("skips done tasks", () => {
    assert.deepEqual(selectDeliveryAudits([candidate({ status: "done" })], { limit: 5 }), []);
  });

  it("skips tasks with no resolvable frame", () => {
    assert.deepEqual(selectDeliveryAudits([candidate({ frameUrl: null })], { limit: 5 }), []);
  });

  it("skips a frame that is not pinned to a node", () => {
    assert.deepEqual(
      selectDeliveryAudits(
        [candidate({ frameUrl: "https://www.figma.com/design/KEY/File" })],
        { limit: 5 }
      ),
      []
    );
  });

  it("skips tasks already reviewed after their newest evidence", () => {
    assert.deepEqual(
      selectDeliveryAudits(
        [candidate({ lastReviewedAt: "2026-07-28T09:00:00.000Z" })],
        { limit: 5 }
      ),
      []
    );
  });

  it("re-reviews once evidence lands after the last review", () => {
    assert.deepEqual(
      selectDeliveryAudits(
        [
          candidate({
            lastReviewedAt: "2026-07-20T09:00:00.000Z",
            newestEvidenceAt: "2026-07-27T14:45:59.865+0200",
          }),
        ],
        { limit: 5 }
      ),
      [521]
    );
  });

  it("skips tasks with no dated evidence", () => {
    assert.deepEqual(
      selectDeliveryAudits([candidate({ newestEvidenceAt: null })], { limit: 5 }),
      []
    );
  });

  it("orders by newest evidence and respects the limit", () => {
    const selected = selectDeliveryAudits(
      [
        candidate({ taskId: 1, newestEvidenceAt: "2026-07-10T00:00:00.000Z" }),
        candidate({ taskId: 2, newestEvidenceAt: "2026-07-27T00:00:00.000Z" }),
        candidate({ taskId: 3, newestEvidenceAt: "2026-07-20T00:00:00.000Z" }),
      ],
      { limit: 2 }
    );
    assert.deepEqual(selected, [2, 3]);
  });
});
