import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTaskDeliveryLinks } from "@/lib/tasks/deliveryLinks";
import { jiraIssueToCandidate } from "./jiraIssueCandidate";

const cloud = { id: "cloud-1", name: "ooden", url: "https://ooden.atlassian.net" };

/** Trimmed copy of a real `searchJiraIssuesUsingJql` payload (markdown format). */
const issue = {
  key: "BOM-356",
  fields: {
    summary: "Design for BOM warning/errors",
    description:
      'Task originated after discussing<custom data-type="smartlink" data-id="id-0">https://ooden.atlassian.net/wiki/pages/x</custom> in call w. Saeed.',
    duedate: "2026-07-30",
    updated: "2026-07-27T14:45:59.865+0200",
    status: { name: "In Review", statusCategory: { key: "indeterminate" } },
    priority: { name: "Low" },
    assignee: { displayName: "Milos Dostanic" },
    reporter: { displayName: "João Pedro Vieira Leão" },
    comment: {
      comments: [
        {
          id: "54911",
          created: "2026-07-22T12:24:58.853+0200",
          author: { displayName: "João Pedro Vieira Leão" },
          body: '<custom data-type="mention" data-id="id-0">@Matt Pettit</custom> The technical issues were handled in <custom data-type="smartlink" data-id="id-1">https://github.com/ooden-tech/on-hydra-app/pull/545</custom> (open for screenshots).',
        },
        {
          id: "55306",
          created: "2026-07-27T14:45:53.959+0200",
          author: { displayName: "Milos Dostanic" },
          body: "Implemented [revised BOM warning/error flow](https://www.figma.com/design/Ht3Up5MlRAKjK7eCuAy05L/BOM-SPEC---ASC-Connected-v2?node-id=6611-28339) in Figma:\n\n* Standardized `Partial UPC` handling across all states.",
        },
      ],
    },
  },
};

describe("jiraIssueToCandidate", () => {
  it("keeps comments in the body", () => {
    const candidate = jiraIssueToCandidate(issue, cloud);
    assert.ok(candidate);
    assert.doesNotMatch(candidate.body, /Comments:\n\(none\)/);
    assert.match(candidate.body, /- Milos Dostanic \(2026-07-27T14:45:53/);
    assert.match(candidate.body, /- João Pedro Vieira Leão \(2026-07-22T12:24:58/);
  });

  it("keeps the URLs a comment carries", () => {
    const candidate = jiraIssueToCandidate(issue, cloud)!;
    assert.match(
      candidate.body,
      /https:\/\/www\.figma\.com\/design\/Ht3Up5MlRAKjK7eCuAy05L\/BOM-SPEC---ASC-Connected-v2\?node-id=6611-28339/
    );
    assert.match(candidate.body, /https:\/\/github\.com\/ooden-tech\/on-hydra-app\/pull\/545/);
  });

  it("strips mention and smart-link markup", () => {
    const candidate = jiraIssueToCandidate(issue, cloud)!;
    assert.doesNotMatch(candidate.body, /<custom/);
    assert.doesNotMatch(candidate.body, /data-type=/);
  });

  it("records the due date", () => {
    const candidate = jiraIssueToCandidate(issue, cloud)!;
    assert.match(candidate.body, /Due date: 2026-07-30/);
  });

  it("records assignee changelog evidence in metadata", () => {
    const candidate = jiraIssueToCandidate(
      {
        ...issue,
        changelog: {
          histories: [
            {
              created: "2026-07-27T13:30:00.000Z",
              items: [
                {
                  field: "assignee",
                  fromString: "Sofija",
                  toString: "Milos Dostanic",
                },
              ],
            },
          ],
        },
      },
      cloud
    )!;
    assert.equal(candidate.metadata?.assignmentChangedAt, "2026-07-27T13:30:00.000Z");
    assert.equal(candidate.metadata?.previousAssignee, "Sofija");
  });

  it("accepts comments hoisted to the issue root", () => {
    const hoisted = {
      key: "BOM-356",
      fields: { summary: "x", updated: "2026-07-27T14:45:59.865+0200" },
      comments: [
        {
          id: "1",
          created: "2026-07-27T00:00:00.000Z",
          author: { displayName: "Milos Dostanic" },
          body: "see https://www.figma.com/design/KEY/File?node-id=1-2",
        },
      ],
    };
    const candidate = jiraIssueToCandidate(hoisted, cloud)!;
    assert.match(candidate.body, /node-id=1-2/);
  });

  it("says (none) when the issue really has no comments", () => {
    const candidate = jiraIssueToCandidate(
      { key: "BOM-1", fields: { summary: "x", updated: "2026-07-27T00:00:00.000Z" } },
      cloud
    )!;
    assert.match(candidate.body, /Comments:\n\(none\)/);
  });

  it("hands the delivery link resolver everything it needs", () => {
    const candidate = jiraIssueToCandidate(issue, cloud)!;
    const links = resolveTaskDeliveryLinks({
      task: {
        title: "BOM-356 · Design UPC warning/error UI",
        reason: "Jira ticket BOM-356 assigns Milos to design UPC warning/error UI.",
        nextAction: "Create design mockups for UPC warning and error messages",
        doneCriteria: ["Design mockups are created and meet the requirements"],
        figmaFrameUrl: null,
        githubRepo: null,
      },
      evidence: [
        {
          sourceItemId: 269,
          quote: "Assignee: Milos Dostanic",
          summary: "Milos is assigned to design the warnings and errors.",
          url: candidate.url ?? null,
        },
      ],
      sources: [
        {
          id: 269,
          title: candidate.title,
          body: candidate.body,
          url: candidate.url ?? null,
          sourceDate: candidate.sourceDate,
        },
      ],
    });

    assert.equal(
      links.figmaFrameUrl,
      "https://www.figma.com/design/Ht3Up5MlRAKjK7eCuAy05L/BOM-SPEC---ASC-Connected-v2?node-id=6611-28339"
    );
    assert.equal(links.githubRepo, "ooden-tech/on-hydra-app");
  });
});
