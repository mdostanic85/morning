import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROMOTION_FRESH_EVIDENCE_DAYS,
  PROMOTION_MIN_SCORE,
  clearsPromotionFloor,
} from "./promotionFloor.ts";
import {
  buildQueueDecisionsFromRanking,
  rankWorkTasks,
  type RankedWorkTask,
  type WorkTaskForRanking,
} from "./priorityRank.ts";
import { composeDailyBriefV2 } from "../dailyBrief/composer.ts";
import type { SourceItem } from "../../domain/sourceItem.ts";
import type { JiraPendingSnapshot } from "../connectors/jiraPending.ts";

const NOW_MS = Date.parse("2026-08-05T12:00:00.000Z");
const TODAY = "2026-08-05";
const MY_NAME = "Milos Dostanic";

function daysAgoIso(days: number): string {
  return new Date(NOW_MS - days * 24 * 60 * 60 * 1000).toISOString();
}

function baseSignals(
  overrides: Partial<Parameters<typeof clearsPromotionFloor>[0]> = {}
): Parameters<typeof clearsPromotionFloor>[0] {
  return {
    score: 100,
    forceInclude: false,
    statusManuallySet: false,
    status: "later",
    waitingOn: null,
    dueDate: null,
    evidenceDates: [daysAgoIso(1)],
    hasOpenJira: false,
    nowMs: NOW_MS,
    ...overrides,
  };
}

describe("clearsPromotionFloor", () => {
  it("rejects deferred and blocked statuses even with strong signals", () => {
    for (const status of ["waiting", "tomorrow", "unclear", "done"] as const) {
      assert.equal(
        clearsPromotionFloor(baseSignals({ status, score: 500, hasOpenJira: true })),
        false,
        status
      );
    }
    assert.equal(
      clearsPromotionFloor(baseSignals({ waitingOn: "Lucas", score: 500, hasOpenJira: true })),
      false
    );
  });

  it("accepts an explicit user pin without other signals", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          statusManuallySet: true,
          score: -45,
          evidenceDates: [],
          hasOpenJira: false,
        })
      ),
      true
    );
  });

  it("accepts forceInclude without other signals", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          forceInclude: true,
          score: -10,
          evidenceDates: [],
          hasOpenJira: false,
        })
      ),
      true
    );
  });

  it("rejects a negative-score task with no forceInclude (WLA-01 reproduction)", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: -45,
          evidenceDates: [daysAgoIso(30)],
          hasOpenJira: false,
          dueDate: null,
        })
      ),
      false
    );
  });

  it("rejects a zero-score task with no real signal", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: PROMOTION_MIN_SCORE,
          evidenceDates: [],
          hasOpenJira: false,
          dueDate: null,
        })
      ),
      false
    );
  });

  it("accepts fresh evidence above the score floor", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 60,
          evidenceDates: [daysAgoIso(1)],
          hasOpenJira: false,
        })
      ),
      true
    );
  });

  it("rejects evidence just outside the freshness window", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 60,
          evidenceDates: [daysAgoIso(PROMOTION_FRESH_EVIDENCE_DAYS + 1)],
          hasOpenJira: false,
          dueDate: null,
        })
      ),
      false
    );
  });

  it("accepts an open Jira assignment above the score floor", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 70,
          evidenceDates: [daysAgoIso(30)],
          hasOpenJira: true,
        })
      ),
      true
    );
  });

  it("accepts a due date above the score floor", () => {
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 300,
          evidenceDates: [],
          hasOpenJira: false,
          dueDate: TODAY,
        })
      ),
      true
    );
  });

  it("uses the injectable clock for freshness", () => {
    const evidenceAt = "2026-08-01T12:00:00.000Z";
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 60,
          evidenceDates: [evidenceAt],
          nowMs: Date.parse("2026-08-05T12:00:00.000Z"),
        })
      ),
      true
    );
    assert.equal(
      clearsPromotionFloor(
        baseSignals({
          score: 60,
          evidenceDates: [evidenceAt],
          nowMs: Date.parse("2026-08-20T12:00:00.000Z"),
        })
      ),
      false
    );
  });
});

function source(overrides: Partial<SourceItem> & Pick<SourceItem, "id" | "sourceType">): SourceItem {
  return {
    projectId: null,
    sourceExternalId: null,
    title: "Untitled source",
    body: "",
    author: null,
    sourceDate: daysAgoIso(30),
    url: null,
    metadata: null,
    contentHash: null,
    createdAt: daysAgoIso(30),
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

describe("buildQueueDecisionsFromRanking — promotion floor", () => {
  it("assigns no now when the top entry fails the floor (stale maintenance)", () => {
    const weak = task({
      id: 1,
      title: "Update Figma",
      reason: "General polish.",
      evidence: [{ sourceItemId: 1, quote: "polish", summary: "stale" }],
    });
    const weaker = task({
      id: 2,
      title: "Cleanup exports",
      reason: "Housekeeping.",
      evidence: [{ sourceItemId: 2, quote: "cleanup", summary: "stale" }],
    });
    const sources = [
      source({ id: 1, sourceType: "manual_transcript", title: "Old note" }),
      source({ id: 2, sourceType: "manual_transcript", title: "Older note" }),
    ];
    const ranked = rankWorkTasks(
      [weak, weaker],
      TODAY,
      new Map(sources.map((s) => [s.id, s])),
      [],
      { myName: MY_NAME },
      NOW_MS
    );

    // Authority may still add a positive score for a transcript source; the
    // floor must refuse promotion when evidence is stale and there is no
    // open Jira / due date / forceInclude.
    assert.equal(ranked[0].forceInclude, false);
    assert.equal(ranked[0].clearsPromotionFloor, false);
    assert.ok(
      ranked.every((entry) => !entry.clearsPromotionFloor),
      "no candidate should clear the floor"
    );

    const decisions = buildQueueDecisionsFromRanking(ranked, [weak, weaker]);
    assert.ok(
      decisions.every((decision) => decision.status !== "now"),
      `expected no now, got ${decisions.map((d) => d.status).join(",")}`
    );
  });

  it("assigns exactly one now when a candidate clears the floor", () => {
    const strongSource = source({
      id: 10,
      sourceType: "jira",
      sourceExternalId: "IMP-1",
      title: "IMP-1: Critical",
      sourceDate: daysAgoIso(1),
      metadata: { status: "To Do", priority: "Highest", assignee: MY_NAME },
    });
    const strong = task({
      id: 100,
      title: "IMP-1 · Critical regression",
      dueDate: TODAY,
      evidence: [{ sourceItemId: 10, quote: "blocker", summary: "IMP-1" }],
    });
    const weak = task({
      id: 101,
      title: "Update Figma",
      evidence: [{ sourceItemId: 11, quote: "polish", summary: "stale" }],
    });
    const weakSource = source({ id: 11, sourceType: "manual_transcript", title: "Old" });

    const jira: JiraPendingSnapshot[] = [
      {
        key: "IMP-1",
        title: "Critical",
        status: "To Do",
        priority: "Highest",
        assignee: MY_NAME,
        dueDate: TODAY,
        url: "https://example.atlassian.net/browse/IMP-1",
        updatedAt: daysAgoIso(1),
        createdAt: daysAgoIso(1),
        excerpt: "",
      },
    ];

    const ranked = rankWorkTasks(
      [strong, weak],
      TODAY,
      new Map([
        [10, strongSource],
        [11, weakSource],
      ]),
      jira,
      { myName: MY_NAME },
      NOW_MS
    );

    assert.equal(ranked[0].taskId, strong.id);
    assert.equal(ranked[0].clearsPromotionFloor, true);

    const decisions = buildQueueDecisionsFromRanking(ranked, [strong, weak]);
    const nowDecisions = decisions.filter((decision) => decision.status === "now");
    assert.equal(nowDecisions.length, 1);
    assert.equal(nowDecisions[0].taskId, strong.id);
  });

  it("skips a weak top candidate and promotes the first that clears", () => {
    const weak = task({
      id: 1,
      title: "Update Figma",
      status: "now", // prior-day status weight alone must not clear the floor
      evidence: [{ sourceItemId: 1, quote: "polish", summary: "stale" }],
    });
    const strong = task({
      id: 2,
      title: "SHIP-9 · Due today",
      dueDate: TODAY,
      evidence: [{ sourceItemId: 2, quote: "due", summary: "SHIP-9" }],
    });
    const sources = [
      source({ id: 1, sourceType: "manual_transcript", title: "Old" }),
      source({
        id: 2,
        sourceType: "jira",
        sourceExternalId: "SHIP-9",
        title: "SHIP-9: Ship",
        sourceDate: daysAgoIso(2),
        metadata: { status: "In Progress", priority: "High" },
      }),
    ];
    const jira: JiraPendingSnapshot[] = [
      {
        key: "SHIP-9",
        title: "Ship",
        status: "In Progress",
        priority: "High",
        assignee: MY_NAME,
        dueDate: TODAY,
        url: "https://example.atlassian.net/browse/SHIP-9",
        updatedAt: daysAgoIso(2),
        createdAt: daysAgoIso(10),
        excerpt: "",
      },
    ];

    const ranked = rankWorkTasks(
      [weak, strong],
      TODAY,
      new Map(sources.map((s) => [s.id, s])),
      jira,
      { myName: MY_NAME },
      NOW_MS
    );

    // Strong should outrank weak on importance, but even if ordering flipped we
    // only care that exactly one now is the floor-clearing task.
    const decisions = buildQueueDecisionsFromRanking(ranked, [weak, strong]);
    const nowDecisions = decisions.filter((decision) => decision.status === "now");
    assert.equal(nowDecisions.length, 1);
    assert.equal(nowDecisions[0].taskId, strong.id);
    assert.equal(
      decisions.find((decision) => decision.taskId === weak.id)?.status !== "now",
      true
    );
  });
});

describe("RankedWorkTask.clearsPromotionFloor wiring", () => {
  it("exposes the floor flag from rankWorkTasks", () => {
    const ranked: RankedWorkTask[] = rankWorkTasks(
      [
        task({
          id: 1,
          title: "Cleanup exports",
          evidence: [{ sourceItemId: 1, quote: "cleanup", summary: "stale" }],
        }),
      ],
      TODAY,
      new Map([
        [1, source({ id: 1, sourceType: "manual_transcript", title: "Old" })],
      ]),
      [],
      undefined,
      NOW_MS
    );
    assert.equal(ranked[0].clearsPromotionFloor, false);
  });
});

describe("composeDailyBriefV2 — promotion floor", () => {
  it("emits the no-primary placeholder when every owned task fails the floor", () => {
    const weakSource = source({
      id: 1,
      sourceType: "manual_transcript",
      title: "Old note",
    });
    const weak = {
      ...task({
        id: 1,
        title: "Update Figma",
        reason: "General polish.",
        evidence: [{ sourceItemId: 1, quote: "polish", summary: "stale" }],
      }),
      confidence: 0.4,
      canonicalKey: null,
      ownershipDecision: "mine" as const,
    };

    const brief = composeDailyBriefV2({
      today: TODAY,
      tasks: [weak],
      sources: [weakSource],
      jiraPending: [],
      meetings: [],
      myName: MY_NAME,
      nowMs: NOW_MS,
    });

    assert.equal(brief.todayFirst.taskId, null);
    assert.equal(brief.todayFirst.jiraKey, null);
    assert.match(brief.todayFirst.title, /nothing clearly demands attention first/i);
  });
});
