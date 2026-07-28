import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveFigmaCommentNodeId,
  shapeFigmaCommentCandidates,
  type FigmaCommentInput,
} from "./figmaComments";

const root: FigmaCommentInput = {
  id: "1859349649",
  message:
    "I have consolidated all modules in the banner along with the new icons I designed.",
  user: { handle: "Milos Dostanic" },
  created_at: "2026-07-27T11:09:27.682Z",
  order_id: 8,
  client_meta: { node_id: "797-12910" },
};

const reply: FigmaCommentInput = {
  id: "1859588773",
  parent_id: "1859349649",
  message:
    "@Milos Dostanic  I think the design looks great! my only suggestion is to make them lighter.",
  user: { handle: "Lucas Saeed" },
  created_at: "2026-07-27T13:26:37.464Z",
  // Figma omits client_meta on replies.
};

describe("resolveFigmaCommentNodeId", () => {
  it("returns the root comment's own pin", () => {
    const byId = new Map([[root.id, root]]);
    assert.equal(resolveFigmaCommentNodeId(root, byId), "797:12910");
  });

  it("inherits the root pin for a reply with no client_meta", () => {
    const byId = new Map([
      [root.id, root],
      [reply.id, reply],
    ]);
    assert.equal(resolveFigmaCommentNodeId(reply, byId), "797:12910");
  });

  it("returns null when the parent is missing from the batch", () => {
    const byId = new Map([[reply.id, reply]]);
    assert.equal(resolveFigmaCommentNodeId(reply, byId), null);
  });
});

describe("shapeFigmaCommentCandidates", () => {
  it("puts inherited node id and parent message on replies", () => {
    const [rootCandidate, replyCandidate] = shapeFigmaCommentCandidates({
      fileKey: "usBJj4PPK8naOgJdi31Lgt",
      projectId: 18,
      comments: [root, reply],
    });

    assert.equal(rootCandidate?.metadata?.nodeId, "797:12910");
    assert.equal(replyCandidate?.metadata?.nodeId, "797:12910");
    assert.equal(replyCandidate?.metadata?.nodeIdInherited, true);
    assert.match(replyCandidate?.body ?? "", /Pinned to node: 797:12910/);
    assert.match(replyCandidate?.body ?? "", /Parent message: .*modules in the banner/);
    assert.match(
      replyCandidate?.url ?? "",
      /node-id=797-12910/
    );
  });

  it("skips resolved threads", () => {
    const candidates = shapeFigmaCommentCandidates({
      fileKey: "FILEKEY12345",
      comments: [{ ...root, resolved_at: "2026-07-27T12:00:00Z" }, reply],
    });
    // Reply alone can't inherit — parent was filtered as resolved before map build.
    // Both are in the input map for inheritance, but resolved root is skipped
    // from output; reply still inherits from the in-memory byId map.
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.metadata?.commentId, reply.id);
    assert.equal(candidates[0]?.metadata?.nodeId, "797:12910");
  });
});
