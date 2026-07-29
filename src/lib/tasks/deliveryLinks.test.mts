import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeDeliveryLinkOrigin,
  resolveTaskDeliveryLinks,
} from "./deliveryLinks";

const task = {
  title: "BOM-356 · Design UPC warning/error UI",
  reason: "Jira ticket BOM-356 assigns Milos to design UPC warning/error UI.",
  nextAction: "Create design mockups for UPC warning and error messages",
  doneCriteria: ["Design mockups are created and meet the requirements"],
  figmaFrameUrl: null,
  githubRepo: null,
};

// The link lives only in a Jira comment, never in the extracted quote — this is
// exactly the shape that used to leave the task with no deliverable.
const jiraSource = {
  id: 269,
  title: "BOM-356: Design for BOM warning/errors",
  url: "https://ooden.atlassian.net/browse/BOM-356",
  sourceDate: "2026-07-27T14:45:59.865+0200",
  body: [
    "Key: BOM-356",
    "URL: https://ooden.atlassian.net/browse/BOM-356",
    "",
    "Description:",
    "This is a design exploration task for checking how parsing problems should be conveyed to end-users.",
    "",
    "Comments:",
    "- João Pedro Vieira Leão (2026-07-22T12:24:58.853+0200): The technical issues around parsing were handled in https://github.com/ooden-tech/on-hydra-app/pull/545 (open the link for seeing the screenshots)",
    "- Milos Dostanic (2026-07-27T14:45:53.959+0200): Implemented [revised BOM warning/error flow](https://www.figma.com/design/Ht3Up5MlRAKjK7eCuAy05L/BOM-SPEC---ASC-Connected-v2?node-id=6611-28339) in Figma",
  ].join("\n"),
};

const evidence = [
  {
    sourceItemId: 269,
    quote: "Assignee: Milos Dostanic",
    summary: "Milos is assigned to design the user-facing warnings and errors.",
    url: "https://ooden.atlassian.net/browse/BOM-356",
  },
];

describe("resolveTaskDeliveryLinks", () => {
  it("finds a pinned Figma frame that only appears in a Jira comment", () => {
    const links = resolveTaskDeliveryLinks({
      task,
      evidence,
      sources: [jiraSource],
    });
    assert.equal(
      links.figmaFrameUrl,
      "https://www.figma.com/design/Ht3Up5MlRAKjK7eCuAy05L/BOM-SPEC---ASC-Connected-v2?node-id=6611-28339"
    );
    assert.equal(links.figmaFrameOrigin?.from, "source_body");
    assert.equal(links.figmaFrameOrigin?.sourceItemId, 269);
  });

  it("finds the GitHub repo and PR from a comment link", () => {
    const links = resolveTaskDeliveryLinks({
      task,
      evidence,
      sources: [jiraSource],
    });
    assert.equal(links.githubRepo, "ooden-tech/on-hydra-app");
    assert.equal(
      links.githubPullRequestUrl,
      "https://github.com/ooden-tech/on-hydra-app/pull/545"
    );
  });

  it("ignores sources the task does not cite", () => {
    const links = resolveTaskDeliveryLinks({
      task,
      evidence: [],
      sources: [jiraSource],
    });
    assert.equal(links.figmaFrameUrl, null);
    assert.equal(links.githubRepo, null);
  });

  it("keeps an already stored pinned frame instead of churning it", () => {
    const stored = "https://www.figma.com/design/OTHERKEY123/File?node-id=1-2";
    const links = resolveTaskDeliveryLinks({
      task: { ...task, figmaFrameUrl: stored },
      evidence,
      sources: [jiraSource],
    });
    assert.equal(links.figmaFrameUrl, stored);
    assert.equal(links.figmaFrameOrigin, null);
  });

  it("upgrades a stored frame that has no node id to a pinned one", () => {
    const links = resolveTaskDeliveryLinks({
      task: {
        ...task,
        figmaFrameUrl: "https://www.figma.com/design/Ht3Up5MlRAKjK7eCuAy05L/BOM-SPEC---ASC-Connected-v2",
      },
      evidence,
      sources: [jiraSource],
    });
    assert.match(links.figmaFrameUrl ?? "", /node-id=6611-28339/);
  });

  it("prefers the link from the newest cited source", () => {
    const older = {
      ...jiraSource,
      id: 100,
      title: "Older ticket",
      sourceDate: "2026-07-01T10:00:00.000Z",
      body: "Comments:\n- Someone: see https://www.figma.com/design/OLDFILEKEY01/Old?node-id=9-9",
    };
    const links = resolveTaskDeliveryLinks({
      task,
      evidence: [...evidence, { ...evidence[0]!, sourceItemId: 100 }],
      sources: [older, jiraSource],
    });
    assert.match(links.figmaFrameUrl ?? "", /Ht3Up5MlRAKjK7eCuAy05L/);
  });

  it("does not treat a plain figma.com marketing link as a frame", () => {
    const links = resolveTaskDeliveryLinks({
      task,
      evidence,
      sources: [
        {
          ...jiraSource,
          body: "Comments:\n- Someone: read https://www.figma.com/blog/design-systems/",
        },
      ],
    });
    assert.equal(links.figmaFrameUrl, null);
  });
});

describe("describeDeliveryLinkOrigin", () => {
  it("names the source a link came from", () => {
    assert.equal(
      describeDeliveryLinkOrigin({
        from: "source_body",
        sourceItemId: 269,
        sourceTitle: "BOM-356: Design for BOM warning/errors",
        sourceDate: "2026-07-27T14:45:59.865+0200",
      }),
      "source body — BOM-356: Design for BOM warning/errors"
    );
  });

  it("returns null when nothing was resolved", () => {
    assert.equal(describeDeliveryLinkOrigin(null), null);
  });
});
