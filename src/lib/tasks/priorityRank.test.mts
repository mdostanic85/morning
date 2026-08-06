import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankWorkTasks, type WorkTaskForRanking } from "./priorityRank.ts";
import type { SourceItem } from "../../domain/sourceItem.ts";
import type { JiraPendingSnapshot } from "../connectors/jiraPending.ts";
import {
  NEW_ASSIGNMENT_BOOST,
  FRESH_OPEN_UPDATE_BOOST,
} from "./claimAwareRanking.ts";

const MY_NAME = "Milos Dostanic";

function todayString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function source(overrides: Partial<SourceItem> & Pick<SourceItem, "id" | "sourceType">): SourceItem {
  return {
    projectId: null,
    sourceExternalId: null,
    title: "Untitled source",
    body: "",
    author: null,
    sourceDate: isoDaysAgo(30),
    url: null,
    metadata: null,
    contentHash: null,
    createdAt: isoDaysAgo(30),
    updatedAt: null,
    ...overrides,
  };
}

function task(
  overrides: Partial<WorkTaskForRanking> & Pick<WorkTaskForRanking, "id">
): WorkTaskForRanking {
  return {
    projectId: null,
    title: "Untitled task",
    status: "later",
    reason: "",
    nextAction: "Do the thing.",
    doneCriteria: ["It is done."],
    priorityScore: null,
    dueDate: null,
    owner: MY_NAME,
    waitingOn: null,
    statusManuallySet: false,
    evidence: [],
    ...overrides,
  };
}

function jira(
  key: string,
  overrides: Partial<JiraPendingSnapshot> = {}
): JiraPendingSnapshot {
  return {
    key,
    title: key,
    status: "To Do",
    priority: "Medium",
    assignee: MY_NAME,
    dueDate: null,
    url: `https://example.atlassian.net/browse/${key}`,
    updatedAt: isoDaysAgo(30),
    createdAt: isoDaysAgo(30),
    excerpt: "",
    ...overrides,
  };
}

function toMap(sources: SourceItem[]): Map<number, SourceItem> {
  return new Map(sources.map((s) => [s.id, s]));
}

describe("rankWorkTask — importance dominates recency", () => {
  it("a Blocker due today outranks a low-priority ticket whose only edge is 24h-fresh evidence", () => {
    const today = todayString();

    // Blocker due today, but no fresh evidence at all.
    const blockerSource = source({
      id: 1,
      sourceType: "jira",
      sourceExternalId: "IMP-1",
      title: "IMP-1: Critical regression",
      sourceDate: isoDaysAgo(30),
    });
    const blocker = task({
      id: 100,
      title: "IMP-1 · Critical regression",
      dueDate: today,
      evidence: [{ sourceItemId: 1, quote: "Blocker", summary: "IMP-1 blocker" }],
    });

    // Low priority, its ONLY advantage is a fresh (now) non-Jira signal.
    const freshSignal = source({
      id: 2,
      sourceType: "figma",
      sourceExternalId: "figma-note",
      title: "Fresh Figma comment",
      sourceDate: new Date().toISOString(),
    });
    const staleJira = source({
      id: 3,
      sourceType: "jira",
      sourceExternalId: "LOW-2",
      title: "LOW-2: Minor polish",
      sourceDate: isoDaysAgo(30),
    });
    const lowFresh = task({
      id: 200,
      title: "LOW-2 · Minor polish",
      evidence: [
        { sourceItemId: 2, quote: "fresh", summary: "fresh figma note" },
        { sourceItemId: 3, quote: "ticket", summary: "LOW-2 ticket" },
      ],
    });

    const ranked = rankWorkTasks(
      [lowFresh, blocker],
      today,
      toMap([blockerSource, freshSignal, staleJira]),
      [jira("IMP-1", { priority: "Blocker" }), jira("LOW-2", { priority: "Low" })],
      { myName: MY_NAME }
    );

    assert.equal(ranked[0].taskId, blocker.id);
    const blockerScore = ranked.find((r) => r.taskId === blocker.id)!.score;
    const lowScore = ranked.find((r) => r.taskId === lowFresh.id)!.score;
    assert.ok(
      blockerScore > lowScore,
      `Blocker (${blockerScore}) must outrank fresh low-priority (${lowScore})`
    );
  });

  it("max recency contribution is far below max importance contribution", () => {
    const today = todayString();

    // Recency-maxed: fresh Jira just assigned to me, but low importance.
    const recencySource = source({
      id: 10,
      sourceType: "jira",
      sourceExternalId: "REC-1",
      title: "REC-1: Just assigned",
      sourceDate: new Date().toISOString(),
    });
    const recencyTask = task({
      id: 300,
      title: "REC-1 · Just assigned",
      evidence: [{ sourceItemId: 10, quote: "assigned", summary: "REC-1 assigned" }],
    });

    // Importance-maxed on the four importance terms: Blocker + due today +
    // blocking impact + stakeholder request.
    const importanceSource = source({
      id: 11,
      sourceType: "jira",
      sourceExternalId: "IMP-2",
      title: "IMP-2: Ship blocker",
      sourceDate: isoDaysAgo(30),
    });
    const importanceTask = task({
      id: 400,
      title: "IMP-2 · Ship blocker",
      reason:
        "This blocks the team and the client request came directly from the stakeholder.",
      dueDate: today,
      evidence: [{ sourceItemId: 11, quote: "blocker", summary: "IMP-2 blocker" }],
    });

    const ranked = rankWorkTasks(
      [recencyTask, importanceTask],
      today,
      toMap([recencySource, importanceSource]),
      [
        jira("REC-1", {
          priority: "Low",
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
        jira("IMP-2", { priority: "Blocker" }),
      ],
      { myName: MY_NAME }
    );

    assert.equal(ranked[0].taskId, importanceTask.id);
    const recScore = ranked.find((r) => r.taskId === recencyTask.id)!.score;
    const impScore = ranked.find((r) => r.taskId === importanceTask.id)!.score;
    assert.ok(impScore > recScore, `importance (${impScore}) must beat recency (${recScore})`);

    // Structural guarantee: the sum of every recency term (fresh evidence +
    // new assignment + fresh open update) stays below a single Blocker.
    const maxRecencyContribution = 60 + NEW_ASSIGNMENT_BOOST + FRESH_OPEN_UPDATE_BOOST;
    assert.ok(maxRecencyContribution < 260, "recency terms must sum below a Blocker priority");
  });
});

describe("rankWorkTask — manual pin and Jira Done", () => {
  it("a manually pinned task outranks a strong (Blocker due today) non-manual task", () => {
    const today = todayString();

    const pinnedSource = source({
      id: 20,
      sourceType: "manual_transcript",
      title: "Manual note",
      sourceDate: isoDaysAgo(30),
    });
    const pinned = task({
      id: 500,
      title: "Hand-pinned focus",
      status: "later",
      statusManuallySet: true,
      evidence: [{ sourceItemId: 20, quote: "pinned", summary: "manual pin" }],
    });

    const strongSource = source({
      id: 21,
      sourceType: "jira",
      sourceExternalId: "IMP-3",
      title: "IMP-3: Blocker",
      sourceDate: isoDaysAgo(30),
    });
    const strong = task({
      id: 600,
      title: "IMP-3 · Blocker",
      dueDate: today,
      evidence: [{ sourceItemId: 21, quote: "blocker", summary: "IMP-3 blocker" }],
    });

    const ranked = rankWorkTasks(
      [strong, pinned],
      today,
      toMap([pinnedSource, strongSource]),
      [jira("IMP-3", { priority: "Blocker" })],
      { myName: MY_NAME }
    );

    assert.equal(ranked[0].taskId, pinned.id);
  });

  it("a recent attended-meeting commitment force-includes, but Jira Done suppresses it", () => {
    const today = todayString();

    // Fresh transcript I attended → force-include commitment.
    const attendedSource = source({
      id: 30,
      sourceType: "granola",
      title: "Design review",
      body: `Participants: ${MY_NAME}, Design team\n${MY_NAME}: I will finish the screens.`,
      sourceDate: new Date().toISOString(),
      metadata: { participants: [MY_NAME, "Design team"] },
    });
    const committed = task({
      id: 700,
      title: "Finish the screens",
      status: "later",
      evidence: [{ sourceItemId: 30, quote: "I will finish the screens", summary: "commitment" }],
    });

    const rankedForce = rankWorkTasks(
      [committed],
      today,
      toMap([attendedSource]),
      [],
      { myName: MY_NAME }
    );
    assert.equal(rankedForce[0].forceInclude, true, "attended commitment must force-include");

    // Same commitment, but the Jira issue is Done → force-include suppressed.
    const doneJiraSource = source({
      id: 31,
      sourceType: "jira",
      sourceExternalId: "IMP-4",
      title: "IMP-4: Convert to Canvas",
      sourceDate: new Date().toISOString(),
      metadata: { key: "IMP-4", status: "Done", statusCategoryKey: "done" },
    });
    const committedDone = task({
      id: 701,
      title: "Finish the screens",
      status: "later",
      evidence: [
        { sourceItemId: 30, quote: "I will finish the screens", summary: "commitment" },
        { sourceItemId: 31, quote: "Status: Done", summary: "IMP-4 done" },
      ],
    });

    const rankedDone = rankWorkTasks(
      [committedDone],
      today,
      toMap([attendedSource, doneJiraSource]),
      [],
      { myName: MY_NAME }
    );
    assert.equal(
      rankedDone[0].forceInclude,
      false,
      "Jira Done must suppress the meeting force-include"
    );
  });
});
