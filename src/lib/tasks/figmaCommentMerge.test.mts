import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findTaskByFigmaNodeId,
  resolveTranscriptMergeTarget,
  type MergeCandidateTask,
} from "./transcriptTaskMerge";

const MILOS = "Milos Dostanic";

const taskWithNode: MergeCandidateTask = {
  id: 100,
  title: "UATL-400 · Redesign header",
  reason: "Product requirement from sprint",
  nextAction: "Update the Figma frame",
  status: "now",
  projectId: 1,
  figmaFrameUrl: "https://www.figma.com/design/FILEKEY12345/My-File?node-id=1-2",
};

const taskNoNode: MergeCandidateTask = {
  id: 101,
  title: "Unrelated task",
  reason: "Some other work",
  nextAction: "Do something",
  status: "later",
  projectId: 1,
  figmaFrameUrl: null,
};

describe("findTaskByFigmaNodeId", () => {
  it("matches a task by fileKey and nodeId", () => {
    const result = findTaskByFigmaNodeId(
      [taskWithNode, taskNoNode],
      "https://www.figma.com/design/FILEKEY12345/name?node-id=1-2"
    );
    assert.equal(result?.id, 100);
  });

  it("normalises node-id dash/colon form", () => {
    const result = findTaskByFigmaNodeId(
      [taskWithNode],
      "https://www.figma.com/design/FILEKEY12345/name?node-id=1:2"
    );
    assert.equal(result?.id, 100);
  });

  it("returns null when fileKey differs", () => {
    const result = findTaskByFigmaNodeId(
      [taskWithNode],
      "https://www.figma.com/design/DIFFERENTKEY1/name?node-id=1-2"
    );
    assert.equal(result, null);
  });

  it("returns null when nodeId differs", () => {
    const result = findTaskByFigmaNodeId(
      [taskWithNode],
      "https://www.figma.com/design/FILEKEY12345/name?node-id=3-4"
    );
    assert.equal(result, null);
  });

  it("returns null when comment URL has no node-id", () => {
    const result = findTaskByFigmaNodeId(
      [taskWithNode],
      "https://www.figma.com/design/FILEKEY12345/name"
    );
    assert.equal(result, null);
  });

  it("returns null for null comment URL", () => {
    const result = findTaskByFigmaNodeId([taskWithNode], null);
    assert.equal(result, null);
  });
});

describe("resolveTranscriptMergeTarget — figma comment source", () => {
  const figmaCommentSource = (overrides: Record<string, unknown> = {}) => ({
    sourceType: "figma" as const,
    title: "Figma comment #3 (node 1:2)",
    body: "Author: milos\nPinned to node: 1:2\nMessage: Please fix the heading spacing.",
    metadata: {
      importedFrom: "figma_comment",
      fileKey: "FILEKEY12345",
      commentId: "c001",
      nodeId: "1:2",
    },
    ...overrides,
  });

  const baseExtracted = {
    title: "Fix heading spacing",
    reason: "Figma comment requesting spacing fix",
    nextAction: "Adjust heading spacing in Figma frame",
    status: "actionable" as const,
    existingTaskId: null,
    owner: MILOS,
  };

  it("merges via Jira key in comment body", () => {
    const tasks: MergeCandidateTask[] = [
      { ...taskWithNode, title: "UATL-400 · Fix header" },
    ];
    const resolution = resolveTranscriptMergeTarget({
      source: figmaCommentSource({
        body: "UATL-400 fix the header",
        metadata: { importedFrom: "figma_comment", fileKey: "F", commentId: "c2", nodeId: null },
      }),
      extracted: baseExtracted,
      existingTasks: tasks,
      myName: MILOS,
    });
    assert.equal(resolution.taskId, tasks[0]!.id);
    assert.ok(resolution.reason.includes("UATL-400"));
  });

  it("merges via pinned node match", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: figmaCommentSource(),
      extracted: baseExtracted,
      existingTasks: [taskWithNode, taskNoNode],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, taskWithNode.id);
    assert.ok(resolution.reason.includes("node"));
  });

  it("creates a new task when no node match and no Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: figmaCommentSource({
        body: "Message: Improve button contrast",
        metadata: {
          importedFrom: "figma_comment",
          fileKey: "DIFFERENTFILE1",
          commentId: "c3",
          nodeId: "9:9",
        },
      }),
      extracted: baseExtracted,
      existingTasks: [taskWithNode],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, null);
    assert.ok(resolution.reason.includes("new"));
  });

  it("merges a reply onto the parent thread's task when already linked", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: figmaCommentSource({
        body: "Author: Lucas Saeed\nReply to: 1859349649\nMessage: make them lighter",
        metadata: {
          importedFrom: "figma_comment",
          fileKey: "FILEKEY12345",
          commentId: "c-reply",
          parentId: "1859349649",
          nodeId: null,
          parentLinkedTaskId: taskWithNode.id,
        },
      }),
      extracted: {
        ...baseExtracted,
        title: "Make design elements lighter",
        owner: MILOS,
      },
      existingTasks: [taskWithNode, taskNoNode],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, taskWithNode.id);
    assert.match(resolution.reason, /thread/);
  });

  it("merges Lucas-style banner feedback onto UATL-380 via topic anchor", () => {
    const bannerTask: MergeCandidateTask = {
      id: 527,
      title: "UATL-380 · Draft concept banner images",
      reason:
        "Draft concept images for each module and stack them into a wide banner for part search.",
      nextAction: "Create concept images for each listed module",
      status: "next",
      projectId: 18,
      figmaFrameUrl: null,
      owner: MILOS,
    };
    const resolution = resolveTranscriptMergeTarget({
      source: figmaCommentSource({
        title: "Reply on Figma comment (node 797:12910)",
        body: [
          "Author: Lucas Saeed",
          "Reply to: 1859349649",
          "Pinned to node: 797:12910",
          "Parent message: I have consolidated all modules in the banner along with the new icons I designed.",
          "Message: @Milos Dostanic  I think the design looks great! my only suggestion is to make them lighter.",
        ].join("\n"),
        metadata: {
          importedFrom: "figma_comment",
          fileKey: "usBJj4PPK8naOgJdi31Lgt",
          commentId: "1859588773",
          parentId: "1859349649",
          nodeId: "797:12910",
        },
      }),
      extracted: {
        title: "Make design elements lighter",
        reason: "Lucas suggested making the banner design elements lighter.",
        nextAction: "Reduce contrast of the banner module graphics in Figma.",
        status: "actionable",
        existingTaskId: 527,
        owner: MILOS,
      },
      existingTasks: [bannerTask, taskNoNode],
      myName: MILOS,
    });
    assert.equal(resolution.taskId, 527);
    assert.ok(
      resolution.reason.includes("topic") ||
        resolution.reason.includes("existingTaskId") ||
        resolution.reason.includes("node"),
      `unexpected reason: ${resolution.reason}`
    );
  });

  it("falls through to non-figma path for regular figma structure source", () => {
    // sourceType figma but importedFrom is NOT figma_comment — should use generic non-transcript path
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "figma",
        title: "Figma file FILEKEY12345",
        body: "File: My Design\nLast modified: 2026-07-01",
        metadata: { importedFrom: "figma", fileKey: "FILEKEY12345" },
      },
      extracted: {
        title: "UATL-400 · Redesign header",
        reason: "reason",
        nextAction: "next",
        status: "actionable",
        existingTaskId: null,
        owner: null,
      },
      existingTasks: [taskWithNode],
      myName: MILOS,
    });
    // Exact title match → merges to taskWithNode
    assert.equal(resolution.taskId, taskWithNode.id);
  });
});
