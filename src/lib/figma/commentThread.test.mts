import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  figmaCommentMessage,
  figmaCommentMessageFirstLine,
  figmaCommentThreadKey,
  resolveFigmaCommentThreadProjectId,
  selectFigmaCommentsForFrame,
  selectFigmaCommentThread,
  type FigmaCommentSourceLike,
} from "./commentThread";

const FILE = "usBJj4PPK8naOgJdi31Lgt";
const NODE = "797:12910";
const ROOT_ID = "1859349649";

function comment(overrides: {
  id: number;
  commentId: string;
  parentId?: string;
  projectId?: number | null;
  sourceDate: string;
  author?: string | null;
  message?: string;
  fileKey?: string;
  nodeId?: string | null;
}): FigmaCommentSourceLike {
  const isReply = Boolean(overrides.parentId);
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? null,
    sourceType: "figma",
    author: overrides.author ?? "Milos Dostanic",
    sourceDate: overrides.sourceDate,
    body: [
      `Author: ${overrides.author ?? "Milos Dostanic"}`,
      isReply ? `Reply to: ${overrides.parentId}` : null,
      `Pinned to node: ${overrides.nodeId ?? NODE}`,
      `Message: ${overrides.message ?? "some feedback"}`,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: {
      importedFrom: "figma_comment",
      fileKey: overrides.fileKey ?? FILE,
      commentId: overrides.commentId,
      // Figma sends an empty string, not null, for root comments.
      parentId: overrides.parentId ?? "",
      nodeId: overrides.nodeId ?? NODE,
    },
  };
}

const root = comment({
  id: 276,
  commentId: ROOT_ID,
  projectId: 18,
  sourceDate: "2026-07-27T11:09:27.682Z",
  message: "I have consolidated all modules in the banner along with the new icons.",
});

const lucasRequest = comment({
  id: 275,
  commentId: "1859588773",
  parentId: ROOT_ID,
  projectId: 18,
  author: "Lucas Saeed",
  sourceDate: "2026-07-27T13:26:37.464Z",
  message: "my only suggestion is to make them lighter.",
});

const milosUpdate = comment({
  id: 283,
  commentId: "1861126271",
  parentId: ROOT_ID,
  projectId: null,
  sourceDate: "2026-07-28T10:13:44.624Z",
  message: "Updated. I reduced the opacity and contrast of the module illustrations.",
});

const lucasApproval = comment({
  id: 282,
  commentId: "1861362288",
  parentId: ROOT_ID,
  projectId: null,
  author: "Lucas Saeed",
  sourceDate: "2026-07-28T12:26:05.612Z",
  message: "Excellent. Everything looks good! @Milos Dostanic",
});

const otherThread = comment({
  id: 300,
  commentId: "999",
  projectId: 5,
  sourceDate: "2026-07-28T09:00:00.000Z",
  nodeId: "12:34",
  message: "unrelated thread in the same file",
});

const otherFile = comment({
  id: 301,
  commentId: "888",
  parentId: ROOT_ID,
  projectId: 9,
  sourceDate: "2026-07-26T09:00:00.000Z",
  fileKey: "OTHERFILEKEY99",
  message: "same root id, different file",
});

const allComments = [
  lucasApproval,
  milosUpdate,
  lucasRequest,
  root,
  otherThread,
  otherFile,
];

describe("figmaCommentThreadKey", () => {
  it("anchors a root comment on its own comment id", () => {
    assert.deepEqual(figmaCommentThreadKey(root), {
      fileKey: FILE,
      rootCommentId: ROOT_ID,
    });
  });

  it("anchors a reply on its parent id", () => {
    assert.deepEqual(figmaCommentThreadKey(lucasApproval), {
      fileKey: FILE,
      rootCommentId: ROOT_ID,
    });
  });

  it("ignores non-comment figma sources", () => {
    assert.equal(
      figmaCommentThreadKey({
        ...root,
        metadata: { importedFrom: "figma", fileKey: FILE },
      }),
      null
    );
  });
});

describe("selectFigmaCommentThread", () => {
  it("returns the thread oldest first, excluding the item being processed", () => {
    const thread = selectFigmaCommentThread(
      allComments,
      { fileKey: FILE, rootCommentId: ROOT_ID },
      { excludeSourceItemId: lucasApproval.id }
    );
    assert.deepEqual(
      thread.map((item) => item.id),
      [root.id, lucasRequest.id, milosUpdate.id]
    );
  });

  it("excludes other threads and other files that share a root id", () => {
    const thread = selectFigmaCommentThread(allComments, {
      fileKey: FILE,
      rootCommentId: ROOT_ID,
    });
    assert.ok(!thread.some((item) => item.id === otherThread.id));
    assert.ok(!thread.some((item) => item.id === otherFile.id));
  });
});

describe("resolveFigmaCommentThreadProjectId", () => {
  it("inherits the project of the oldest classified thread member", () => {
    const siblings = selectFigmaCommentThread(
      allComments,
      { fileKey: FILE, rootCommentId: ROOT_ID },
      { excludeSourceItemId: lucasApproval.id }
    );
    assert.deepEqual(resolveFigmaCommentThreadProjectId(siblings), {
      projectId: 18,
      fromSourceItemId: root.id,
    });
  });

  it("returns null when no thread member has a project yet", () => {
    assert.equal(
      resolveFigmaCommentThreadProjectId([milosUpdate, lucasApproval]),
      null
    );
  });
});

describe("selectFigmaCommentsForFrame", () => {
  it("keeps only comments pinned to the reviewed node, oldest first", () => {
    const forFrame = selectFigmaCommentsForFrame(allComments, {
      fileKey: FILE,
      nodeId: NODE,
    });
    assert.deepEqual(
      forFrame.map((item) => item.id),
      [root.id, lucasRequest.id, milosUpdate.id, lucasApproval.id]
    );
  });

  it("falls back to every comment in the file when the frame has no node id", () => {
    const forFile = selectFigmaCommentsForFrame(allComments, { fileKey: FILE });
    assert.ok(forFile.some((item) => item.id === otherThread.id));
    assert.ok(!forFile.some((item) => item.id === otherFile.id));
  });

  it("keeps the newest entries when the thread exceeds the limit", () => {
    const forFrame = selectFigmaCommentsForFrame(
      allComments,
      { fileKey: FILE, nodeId: NODE },
      2
    );
    assert.deepEqual(
      forFrame.map((item) => item.id),
      [milosUpdate.id, lucasApproval.id]
    );
  });
});

describe("figmaCommentMessage", () => {
  const body = [
    "Author: Milos Dostanic",
    "Pinned to node: 797:12910",
    "Message: I consolidated all modules in the banner.",
    "",
    "@Matt Pettit @Lucas Saeed",
  ].join("\n");

  it("keeps the whole message including trailing mentions", () => {
    assert.equal(
      figmaCommentMessage(body),
      "I consolidated all modules in the banner.\n\n@Matt Pettit @Lucas Saeed"
    );
  });

  it("returns only the first line for inline parent context", () => {
    assert.equal(
      figmaCommentMessageFirstLine(body),
      "I consolidated all modules in the banner."
    );
  });

  it("returns null when the body carries no message line", () => {
    assert.equal(figmaCommentMessage("Author: someone"), null);
  });
});
