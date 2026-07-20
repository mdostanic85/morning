import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  planJiraAnchorEvidenceAdoption,
  type AnchorEvidenceTask,
  type AnchorSourceInfo,
} from "./jiraAnchorEvidence.ts";

function task(overrides: Partial<AnchorEvidenceTask> & { id: number; title: string }): AnchorEvidenceTask {
  return {
    reason: "",
    nextAction: "",
    status: "next",
    evidence: [],
    ...overrides,
  };
}

function evidenceRow(sourceItemId: number, quote = "quote") {
  return {
    sourceItemId,
    quote,
    summary: "summary",
    sourceDate: "2026-07-17T00:00:00.000Z",
    url: null,
  };
}

const granolaSource: AnchorSourceInfo = {
  sourceType: "granola",
  title: "Content File Mgr - Review",
  body: "We discussed the content file manager screens.",
};

const jiraSource: AnchorSourceInfo = {
  sourceType: "jira",
  title: "UATL-367: DESIGN - Content File Manager - Convert to Canvas",
};

test("fragment transcript evidence is adopted by the matching Jira anchor", () => {
  const anchor = task({
    id: 371,
    title: "Review UATL-367: DESIGN - Content File Manager - Convert to Canvas",
    reason: "Jira ticket in progress",
    evidence: [evidenceRow(188)],
  });
  const fragment = task({
    id: 384,
    title: "Finish remaining Content File Manager screens",
    reason: "Discussed in review meeting",
    evidence: [evidenceRow(201, "finish the remaining screens")],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([
      [188, jiraSource],
      [201, granolaSource],
    ]),
  });

  assert.equal(planned.length, 1);
  assert.equal(planned[0].anchorTaskId, 371);
  assert.equal(planned[0].fragmentTaskId, 384);
  assert.equal(planned[0].sourceItemId, 201);
});

test("meeting title overlap counts even when the fragment title diverges", () => {
  const anchor = task({
    id: 371,
    title: "UATL-367: Content File Manager - Convert to Canvas",
    evidence: [],
  });
  const fragment = task({
    id: 383,
    title: "Send SKU screenshot to Sophia for validation",
    evidence: [evidenceRow(201)],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([[201, granolaSource]]),
  });

  assert.equal(planned.length, 1);
  assert.equal(planned[0].anchorTaskId, 371);
});

test("evidence the anchor already has from that source is not duplicated", () => {
  const anchor = task({
    id: 371,
    title: "UATL-367: Content File Manager - Convert to Canvas",
    evidence: [evidenceRow(201)],
  });
  const fragment = task({
    id: 384,
    title: "Finish remaining Content File Manager screens",
    evidence: [evidenceRow(201)],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([[201, granolaSource]]),
  });

  assert.equal(planned.length, 0);
});

test("unrelated fragments are not adopted", () => {
  const anchor = task({
    id: 371,
    title: "UATL-367: Content File Manager - Convert to Canvas",
    evidence: [],
  });
  const fragment = task({
    id: 400,
    title: "Advocate AI work to Bruce",
    reason: "Elevate AI design functionality for executive support",
    evidence: [evidenceRow(210)],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([
      [210, { sourceType: "granola", title: "Product/Design Weekly" }],
    ]),
  });

  assert.equal(planned.length, 0);
});

test("ambiguous overlap across two anchors is skipped", () => {
  const anchorA = task({
    id: 1,
    title: "UATL-100: Content File Manager backend",
    evidence: [],
  });
  const anchorB = task({
    id: 2,
    title: "UATL-200: Content File Manager frontend",
    evidence: [],
  });
  const fragment = task({
    id: 3,
    title: "Finish Content File Manager screens",
    evidence: [evidenceRow(201)],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchorA, anchorB, fragment],
    sourceById: new Map([[201, granolaSource]]),
  });

  assert.equal(planned.length, 0);
});

test("non-transcript fragment evidence is never adopted", () => {
  const anchor = task({
    id: 371,
    title: "UATL-367: Content File Manager - Convert to Canvas",
    evidence: [],
  });
  const fragment = task({
    id: 384,
    title: "Finish remaining Content File Manager screens",
    evidence: [evidenceRow(500)],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([
      [500, { sourceType: "github", title: "Content File Manager PR" }],
    ]),
  });

  assert.equal(planned.length, 0);
});

test("only sources that themselves match the anchor are adopted from a mixed fragment", () => {
  const anchor = task({
    id: 371,
    title: "UATL-367: Content File Manager - Convert to Canvas",
    evidence: [],
  });
  const fragment = task({
    id: 60,
    title: "Review Matt's Transcript for Feature Parity",
    evidence: [evidenceRow(201), evidenceRow(55, "mapping note")],
  });

  const planned = planJiraAnchorEvidenceAdoption({
    tasks: [anchor, fragment],
    sourceById: new Map([
      [201, granolaSource],
      [
        55,
        {
          sourceType: "gmail",
          title: "Mapping: ako fajl vec ima vecinu od ovih",
          body: "Gemini meeting notes about intelligent mapping.",
          metadata: { importedFrom: "gmail_gemini_meet_notes" },
        },
      ],
    ]),
  });

  assert.equal(planned.length, 1);
  assert.equal(planned[0].sourceItemId, 201);
});
