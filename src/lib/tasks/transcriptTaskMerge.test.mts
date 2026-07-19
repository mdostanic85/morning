import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractJiraKeysFromText,
  findOnlyActiveTopicAnchor,
  mergeTaskTitle,
  pickPrimaryExtractedTask,
  resolveTranscriptMergeTarget,
  type MergeCandidateTask,
} from "./transcriptTaskMerge";

const uatl367: MergeCandidateTask = {
  id: 371,
  title: "Review UATL-367: DESIGN - Content File Manager - Convert to Canvas",
  reason: "In review in Jira",
  nextAction: "Review the Jira issue UATL-367",
  status: "next",
  projectId: 1,
};

const otherLater: MergeCandidateTask = {
  id: 10,
  title: "Tidy design tokens",
  reason: "Housekeeping",
  nextAction: "Clean unused tokens",
  status: "later",
  projectId: 1,
};

describe("transcriptTaskMerge", () => {
  it("extracts Jira keys from free text", () => {
    assert.deepEqual(
      extractJiraKeysFromText("Finished UATL-367 and mentioned ABC-12 twice UATL-367"),
      ["UATL-367", "ABC-12"]
    );
  });

  it("merges actionable transcript items onto the Jira key task", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Milos completed ticket 367 Content File Manager and will do final visual validation",
      },
      extracted: {
        title: "Implement Content File Manager on canvas",
        reason: "Spoken in daily",
        nextAction: "Connect screens and do final visual validation",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
    });
    // Body says "ticket 367" — inferred as UATL-367 when that suffix is unique.
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
    assert.match(resolution.reason, /jira key UATL-367/i);
  });

  it("forces merge when source names the full Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Content File Mgr - Review",
        body: "Feedback on UATL-367: finish remaining screens then ping for review",
      },
      extracted: {
        title: "Finish remaining Content File Manager screens",
        reason: "Review feedback",
        nextAction: "Finish the remaining Content File Manager screens",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
    });
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
    assert.match(resolution.reason, /jira key/i);
  });

  it("keeps waiting items separate even when they mention a Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Sofija to groom frontend epic for UATL-367",
      },
      extracted: {
        title: "Groom Content File Manager Frontend Epic",
        reason: "Needs grooming",
        nextAction: "Schedule grooming",
        status: "waiting",
        existingTaskId: null,
        owner: "Sofija",
      },
      existingTasks: [uatl367],
    });
    assert.equal(resolution.taskId, null);
  });

  it("uses the only active now/next topic anchor without a Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Content File Mgr - Review",
        body: "Finish remaining Content File Manager screens, then ping for review",
      },
      extracted: {
        title: "Finish remaining Content File Manager screens",
        reason: "Review feedback",
        nextAction: "Finish remaining screens",
        status: "actionable",
        existingTaskId: null,
      },
      existingTasks: [uatl367, otherLater],
    });
    assert.equal(resolution.taskId, 371);
    assert.equal(resolution.mode, "full");
  });

  it("does not topic-merge waiting items without a Jira key", () => {
    const resolution = resolveTranscriptMergeTarget({
      source: {
        sourceType: "granola",
        title: "Hydra Daily",
        body: "Grooming needed for Content File Manager frontend epic",
      },
      extracted: {
        title: "Groom frontend epic",
        reason: "Blocked on scheduling",
        nextAction: "Schedule with Sofija",
        status: "waiting",
        existingTaskId: null,
      },
      existingTasks: [uatl367],
    });
    assert.equal(resolution.taskId, null);
  });

  it("finds a sole focus anchor with domain overlap", () => {
    const anchor = findOnlyActiveTopicAnchor(
      [uatl367, otherLater],
      "Content File Manager review screens canvas"
    );
    assert.equal(anchor?.id, 371);
  });

  it("keeps Jira identity when merging titles", () => {
    assert.equal(
      mergeTaskTitle(uatl367.title, "Finish remaining screens"),
      uatl367.title
    );
  });

  it("picks the most concrete actionable next step", () => {
    const primary = pickPrimaryExtractedTask([
      {
        title: "A",
        reason: "r",
        nextAction: "Short",
        status: "actionable" as const,
        existingTaskId: null,
        doneCriteria: ["a"],
      },
      {
        title: "B",
        reason: "r",
        nextAction: "Finish remaining Content File Manager screens then ping Matt",
        status: "actionable" as const,
        existingTaskId: null,
        doneCriteria: ["a", "b"],
      },
    ]);
    assert.match(primary.nextAction, /Finish remaining/);
  });
});
