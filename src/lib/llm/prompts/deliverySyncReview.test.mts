import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeliverySyncReviewUserPrompt,
  type DeliverySyncReviewInput,
} from "./deliverySyncReview";

function bulk(size: number, seed = "x"): string {
  return seed.repeat(size);
}

function input(overrides: Partial<DeliverySyncReviewInput> = {}): DeliverySyncReviewInput {
  return {
    taskTitle: "BOM-356 · Design UPC warning/error UI",
    taskReason: "Jira ticket BOM-356 assigns the UPC warning/error design.",
    nextAction: "Create design mockups for UPC warning and error messages",
    doneCriteria: ["Design mockups are created", "The design is refined after feedback"],
    taskEvidence: [],
    linkedKnowledge: [],
    githubRepo: "ooden-tech/on-hydra-app",
    githubBranch: "feature/bom-356",
    githubRepoActivity: null,
    gitBranchEvidence: [],
    localGitEvidence: null,
    figmaEvidence: null,
    figmaCommentThread: [],
    ...overrides,
  };
}

/** A task on a busy project with a large design file — the case that used to fail. */
function oversizedInput(): DeliverySyncReviewInput {
  return input({
    taskEvidence: Array.from({ length: 60 }, (_, index) => ({
      quote: bulk(3_000),
      summary: bulk(3_000),
      sourceTitle: `Source ${index}`,
      sourceDate: "2026-07-27T14:45:59.865+0200",
    })),
    linkedKnowledge: Array.from({ length: 80 }, (_, index) => ({
      type: "requirement",
      title: `Knowledge ${index}`,
      content: bulk(4_000),
      confidence: 0.9,
    })),
    githubRepoActivity: {
      repository: "ooden-tech/on-hydra-app",
      defaultBranch: "main",
      openPullRequests: Array.from({ length: 60 }, (_, index) => ({
        number: index,
        title: bulk(200),
        url: `https://github.com/ooden-tech/on-hydra-app/pull/${index}`,
        headRef: `feature/x-${index}`,
        baseRef: "main",
      })),
      recentCommits: Array.from({ length: 60 }, (_, index) => ({
        sha: `sha${index}`,
        message: bulk(200),
        date: "2026-07-27T00:00:00.000Z",
      })),
    },
    gitBranchEvidence: Array.from({ length: 8 }, () => ({
      repoPath: "/repo",
      targetBranch: "feature/bom-356",
      baseBranch: "main",
      branchExists: true,
      latestCommits: Array.from({ length: 40 }, (_, index) => ({
        hash: `h${index}`,
        date: "2026-07-27",
        subject: bulk(200),
      })),
      diffSummary: bulk(20_000),
      uiChangedFiles: Array.from({ length: 300 }, (_, index) => `src/file-${index}.tsx`),
      uiDiffExcerpt: bulk(80_000),
      visualNote: "no screenshot",
    })),
    figmaEvidence: {
      frameUrl: "https://www.figma.com/design/KEY/File?node-id=6611-28339",
      fileKey: "KEY",
      nodeId: "6611:28339",
      metadata: bulk(60_000),
      designContext: bulk(400_000),
      screenshotNote: "screenshot attached",
    },
    figmaCommentThread: [
      ...Array.from({ length: 90 }, (_, index) => ({
        author: "Someone",
        postedAt: "2026-07-01T00:00:00.000Z",
        isReply: true,
        message: `old comment ${index}`,
      })),
      {
        author: "Lucas Saeed",
        postedAt: "2026-07-27T15:00:00.000Z",
        isReply: true,
        message: "NEWEST-APPROVAL looks good, approved.",
      },
    ],
  });
}

describe("buildDeliverySyncReviewUserPrompt", () => {
  it("keeps a realistic prompt well under model context limits", () => {
    const prompt = buildDeliverySyncReviewUserPrompt(oversizedInput());
    // ~13k tokens at 4 chars/token, leaving room for the system prompt, an
    // attached screenshot and the completion.
    assert.ok(
      prompt.length < 60_000,
      `prompt was ${prompt.length} characters, expected under 60000`
    );
  });

  it("never drops the newest comment when trimming a long thread", () => {
    const prompt = buildDeliverySyncReviewUserPrompt(oversizedInput());
    assert.match(prompt, /NEWEST-APPROVAL/);
    assert.doesNotMatch(prompt, /old comment 0"/);
  });

  it("marks truncation so absence is not read as a gap", () => {
    const prompt = buildDeliverySyncReviewUserPrompt(oversizedInput());
    assert.match(prompt, /truncated: \d+ of \d+ characters shown/);
    assert.match(prompt, /not as absent from the artifact/);
  });

  it("leaves a small prompt untouched", () => {
    const prompt = buildDeliverySyncReviewUserPrompt(
      input({
        figmaCommentThread: [
          {
            author: "Milos Dostanic",
            postedAt: "2026-07-27T14:45:53.959+0200",
            isReply: false,
            message: "Implemented revised BOM warning/error flow",
          },
        ],
      })
    );
    assert.doesNotMatch(prompt, /truncated/);
    assert.match(prompt, /Implemented revised BOM warning\/error flow/);
    assert.match(prompt, /Outcome 1: Design mockups are created/);
  });

  it("still states when there is no Figma evidence at all", () => {
    const prompt = buildDeliverySyncReviewUserPrompt(input());
    assert.match(prompt, /Figma canvas evidence: \(no frame URL found or fetch skipped\)/);
    assert.match(prompt, /Figma comment thread on this frame: \(no imported comments\)/);
  });
});
